import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authLimiter } from '../middleware/rateLimiter';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as authService from '../services/auth.service';
import { generateCaptcha, verifyCaptcha } from '../services/captcha.service';
import { lookupInviteCode } from '../services/invite.service';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/email.service';
import { checkAndNotifyUserMilestone } from '../services/auth.service';
import logger from '../logger';
import { validatePassword } from '../../../shared/password-rules';
import { config } from '../config';
import { isInviteRequired } from '../services/settings.service';
import { recordNewUser } from '../services/metrics.service';

const router = Router();

const isProduction = config.nodeEnv === 'production';

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/auth', // only sent to auth endpoints
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth' });
}

const strongPassword = z.string().min(12).max(128).refine(
  (pw) => validatePassword(pw).valid,
  (pw) => ({ message: `Password requirements not met: ${validatePassword(pw).failures.join(', ')}` }),
);

const LINKEDIN_URL_PATTERN = /^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/;

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: strongPassword,
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  organization: z.string().max(200).trim().optional().or(z.literal('')),
  jobTitle: z.string().max(200).trim().optional().or(z.literal('')),
  termsAcceptedAt: z.string().min(1).max(50),
  linkedinUrl: z.string().max(500).refine(
    (url) => LINKEDIN_URL_PATTERN.test(url),
    { message: 'Must be a valid LinkedIn profile URL (e.g., https://linkedin.com/in/yourname)' },
  ).optional().or(z.literal('')),
  inviteCode: z.string().min(1).max(20).trim().optional(),
  captchaId: z.string().uuid(),
  captchaAnswer: z.string().min(1).max(20).trim(),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
  deviceToken: z.string().max(200).optional(),
});

const verify2FASchema = z.object({
  tempToken: z.string(),
  code: z.string().length(6),
  trustDevice: z.boolean().optional(),
});

const confirm2FASchema = z.object({
  code: z.string().length(6),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: strongPassword,
});

router.get('/captcha', async (_req: Request, res: Response) => {
  const captcha = await generateCaptcha();
  res.json(captcha);
});

router.get('/registration-settings', async (_req: Request, res: Response) => {
  const requireInviteCode = await isInviteRequired();
  res.json({ requireInviteCode });
});

router.get('/invite-code-info', authLimiter, async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
  if (!code || code.length > 20) {
    res.status(400).json({ error: 'Invalid code' });
    return;
  }
  const info = await lookupInviteCode(code);
  if (!info) {
    res.status(404).json({ error: 'Invalid or expired invite code' });
    return;
  }
  res.json(info);
});

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const input = registerSchema.parse(req.body);

    // If invites are required, enforce the invite code is present
    const inviteRequired = await isInviteRequired();
    if (inviteRequired && !input.inviteCode) {
      res.status(400).json({ error: 'An invite code is required to register' });
      return;
    }

    if (!(await verifyCaptcha(input.captchaId, input.captchaAnswer))) {
      res.status(400).json({ error: 'Incorrect verification answer. Please try again.' });
      return;
    }

    const result = await authService.register({ ...input, inviteCode: input.inviteCode || '' }, inviteRequired);
    const { accessToken, refreshToken } = authService.createToken({ userId: result.user.id, email: result.user.email });
    setAuthCookies(res, accessToken, refreshToken);

    // Send verification email
    const { verifyUrl } = await authService.createEmailVerification(result.user.id);
    sendVerificationEmail(input.email, verifyUrl, input.firstName).catch((err) =>
      logger.error({ err }, 'Failed to send verification email'),
    );

    recordNewUser();
    checkAndNotifyUserMilestone().catch((err) =>
      logger.error({ err }, 'Failed to check user milestone'),
    );
    res.status(201).json({ ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    const status = message === 'Email already registered' ? 409
      : message.includes('invite') || message.includes('Invite') ? 403
      : 400;
    res.status(status).json({ error: message });
  }
});

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, deviceToken } = loginSchema.parse(req.body);
    const result = await authService.login(email, password, deviceToken);
    if (result.accessToken && result.refreshToken) {
      // Clear any user-level blocklist marker so the new session works immediately
      await authService.clearUserBlock(result.userId!);
      setAuthCookies(res, result.accessToken, result.refreshToken);
    }
    res.json({ requires2FA: result.requires2FA, tempToken: result.tempToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    const status = message === 'Invalid credentials' ? 401
      : message === 'Account suspended. Contact an administrator.' ? 403
      : 400;
    res.status(status).json({ error: message });
  }
});

router.post('/verify-2fa', authLimiter, async (req: Request, res: Response) => {
  try {
    const { tempToken, code, trustDevice } = verify2FASchema.parse(req.body);
    const result = await authService.verify2FA(tempToken, code, trustDevice);
    await authService.clearUserBlock(result.userId);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ deviceToken: result.deviceToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    res.status(401).json({ error: message });
  }
});

// === Logout (server-side token revocation) ===

router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  // Block the current access token if it has a JTI
  if (req.user?.jti) {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // access token max lifetime
    await authService.blockToken(req.user.jti, req.user.userId, expiresAt);
  }
  clearAuthCookies(res);
  res.json({ message: 'Logged out' });
});

// === Refresh token rotation ===

router.post('/refresh', async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }
  try {
    const result = await authService.refreshAccessToken(refreshToken);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ message: 'Token refreshed' });
  } catch (err) {
    clearAuthCookies(res);
    res.status(401).json({ error: err instanceof Error ? err.message : 'Refresh failed' });
  }
});

router.post('/setup-2fa', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await authService.setup2FA(req.user!.userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Setup failed' });
  }
});

router.post('/confirm-2fa', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code } = confirm2FASchema.parse(req.body);
    const result = await authService.confirm2FA(req.user!.userId, code);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Confirmation failed' });
  }
});

router.post('/disable-2fa', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code } = confirm2FASchema.parse(req.body);
    const result = await authService.disable2FA(req.user!.userId, code);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Disable failed' });
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await authService.getUser(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: 'Unable to find your account. Please sign out and sign in again.' });
    return;
  }
  res.json({ user });
});

// === Email Verification ===

const verifyEmailSchema = z.object({
  token: z.string().min(1).max(200),
});

router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = verifyEmailSchema.parse(req.body);
    await authService.verifyEmail(token);
    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    res.status(400).json({ error: message });
  }
});

router.post('/resend-verification', authMiddleware, authLimiter, async (req: AuthRequest, res: Response) => {
  const user = await authService.getUser(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: 'Unable to find your account. Please sign out and sign in again.' });
    return;
  }
  if (user.emailVerified) {
    res.status(400).json({ error: 'Email is already verified' });
    return;
  }
  const { verifyUrl } = await authService.createEmailVerification(req.user!.userId);
  sendVerificationEmail(user.email, verifyUrl, user.firstName || 'there').catch((err) =>
    logger.error({ err }, 'Failed to send verification email'),
  );
  res.json({ message: 'Verification email sent' });
});

// === Profile Update ===

const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  organization: z.string().min(1).max(200).trim().optional(),
  jobTitle: z.string().min(1).max(200).trim().optional(),
  linkedinUrl: z.string().max(500).refine(
    (url) => LINKEDIN_URL_PATTERN.test(url),
    { message: 'Must be a valid LinkedIn profile URL' },
  ).optional(),
});

router.patch('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const updates = updateProfileSchema.parse(req.body);
    const user = await authService.updateProfile(req.user!.userId, updates);
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Update failed' });
  }
});

// === Change Password (authenticated) ===

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: strongPassword,
});

router.post('/change-password', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    const { accessToken, refreshToken } = authService.createToken({ userId: req.user!.userId, email: req.user!.email });
    await authService.clearUserBlock(req.user!.userId);
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Password change failed';
    const status = message === 'Current password is incorrect' ? 401 : 400;
    res.status(status).json({ error: message });
  }
});

// === Password Reset ===

router.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(email);

    if (result) {
      sendPasswordResetEmail(email, result.resetUrl).catch((err) =>
        logger.error({ err }, 'Failed to send password reset email'),
      );
    }

    // Always return success to prevent email enumeration
    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Request failed' });
  }
});

router.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    clearAuthCookies(res);
    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reset failed';
    res.status(400).json({ error: message });
  }
});

// === Account Deletion ===

const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
});

router.delete('/account', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { password } = deleteAccountSchema.parse(req.body);
    await authService.deleteAccount(req.user!.userId, password);
    clearAuthCookies(res);
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deletion failed';
    const status = message === 'Incorrect password' ? 403 : 400;
    res.status(status).json({ error: message });
  }
});

export default router;
