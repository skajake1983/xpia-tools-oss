import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import repos from '../db/repos';
import type { UserDoc } from '../db/repositories/types';
import { config } from '../config';
import { AuthPayload } from '../middleware/auth';
import { validateInviteCode, redeemInviteCode } from './invite.service';
import { encryptApiKey, decryptApiKey } from './llm/encryption';
import { isFoundingSuperAdmin } from '../middleware/admin';

// ── TOTP secret encryption helpers ──────────────────────────────────────
const TOTP_ENC_PREFIX = 'enc:v1:';

function encryptTotpSecret(secret: string): string {
  const { encrypted, iv, tag } = encryptApiKey(secret);
  return `${TOTP_ENC_PREFIX}${encrypted}:${iv}:${tag}`;
}

function decryptTotpSecret(stored: string): string {
  if (!stored.startsWith(TOTP_ENC_PREFIX)) {
    // Plaintext (pre-migration) — return as-is for backward compatibility
    return stored;
  }
  const parts = stored.slice(TOTP_ENC_PREFIX.length).split(':');
  return decryptApiKey(parts[0], parts[1], parts[2]);
}

export function createToken(payload: AuthPayload): { accessToken: string; refreshToken: string; jti: string } {
  const jti = uuidv4();
  const accessToken = jwt.sign({ ...payload, jti }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
  const refreshToken = jwt.sign({ ...payload, jti, type: 'refresh' }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as jwt.SignOptions);
  return { accessToken, refreshToken, jti };
}

// ── Token blocklist ─────────────────────────────────────────────────────

export async function blockToken(jti: string, userId: string, expiresAt: Date): Promise<void> {
  const ttl = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  await repos.auth.blockToken(jti, userId, expiresAt.toISOString(), ttl);
}

export async function isTokenBlocked(jti: string): Promise<boolean> {
  return repos.auth.isTokenBlocked(jti);
}

export async function blockAllUserTokens(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8h — covers any outstanding access tokens
  const ttl = 8 * 60 * 60; // 8 hours in seconds
  await repos.auth.blockAllUserTokens(userId, expiresAt.toISOString(), ttl);
}

export async function clearUserBlock(userId: string): Promise<void> {
  await repos.auth.clearUserBlock(userId);
}

export async function isUserBlocked(userId: string): Promise<boolean> {
  return repos.auth.isUserBlocked(userId);
}

export async function cleanExpiredBlocklistEntries(): Promise<void> {
  await repos.auth.cleanExpiredTokens();
}

export async function isUserSuspended(userId: string): Promise<boolean> {
  const user = await repos.users.getById(userId);
  return !!user?.limits.isSuspended;
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; jti: string }> {
  let payload: AuthPayload & { jti: string; type?: string };
  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as typeof payload;
  } catch {
    throw new Error('Invalid or expired refresh token');
  }
  if (payload.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  // Check if old refresh JTI is blocked
  if (await isTokenBlocked(payload.jti) || await isUserBlocked(payload.userId)) {
    throw new Error('Token has been revoked');
  }
  // Check suspension
  if (await isUserSuspended(payload.userId)) {
    throw new Error('Account suspended');
  }
  // Block the old refresh token (rotation)
  const oldExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await blockToken(payload.jti, payload.userId, oldExpiry);
  // Issue new pair
  return createToken({ userId: payload.userId, email: payload.email });
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organization?: string;
  jobTitle?: string;
  linkedinUrl?: string;
  inviteCode: string;
  termsAcceptedAt?: string;
}

export async function register(input: RegisterInput, requireInvite = true): Promise<{ user: { id: string; email: string } }> {
  // Validate invite code — check it matches this registrant
  if (requireInvite && input.inviteCode) {
    const codeResult = await validateInviteCode(input.inviteCode, {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
    });
    if (!codeResult.valid) {
      throw new Error(codeResult.error!);
    }
  }

  const existing = await repos.users.getByEmail(input.email);
  if (existing) {
    throw new Error('Email already registered');
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(input.password, config.bcryptRounds);

  // Check if this is the first user — auto-promote to admin
  const userCount = await repos.users.count();
  const isFirstUser = userCount === 0;

  const now = new Date().toISOString();
  await repos.users.create({
    id,
    email: input.email,
    passwordHash,
    totpSecret: null,
    totpEnabled: false,
    isAdmin: isFirstUser,
    isSuperadmin: isFirstUser,
    forcePasswordChange: false,
    firstName: input.firstName,
    lastName: input.lastName,
    organization: input.organization || null,
    jobTitle: input.jobTitle || null,
    termsAcceptedAt: input.termsAcceptedAt || null,
    linkedinUrl: input.linkedinUrl ?? null,
    canGenerateInvites: isFirstUser,
    emailVerified: false,
    limits: { dailyTokenLimit: 0, isSuspended: false, updatedBy: null },
    createdAt: now,
    updatedAt: now,
  });

  if (requireInvite && input.inviteCode) {
    await redeemInviteCode(input.inviteCode, id);
  }

  return { user: { id, email: input.email } };
}

const MILESTONE_INCREMENT = 50;

export async function checkAndNotifyUserMilestone(): Promise<void> {
  // Check if milestone notifications are disabled
  const { isMilestoneNotificationsEnabled } = await import('./settings.service');
  if (!(await isMilestoneNotificationsEnabled())) return;

  const count = await repos.users.count();
  const milestone = Math.floor(count / MILESTONE_INCREMENT) * MILESTONE_INCREMENT;

  if (milestone < MILESTONE_INCREMENT) return;

  const settingKey = `site:user_milestone_${milestone}`;
  const existing = await repos.config.getSiteSetting(settingKey);
  if (existing) return;

  // Record milestone before sending to prevent duplicates
  await repos.config.upsertSiteSetting({
    id: settingKey,
    type: 'site_setting',
    value: String(count),
    updatedBy: 'system',
    updatedAt: new Date().toISOString(),
  });

  // Send to all super admins
  const allUsers = await repos.users.list({ search: '', limit: 1000 });
  const admins = allUsers.filter(u => u.isSuperadmin);
  const { sendUserMilestoneEmail } = await import('./email.service');

  for (const admin of admins) {
    sendUserMilestoneEmail(admin.email, milestone).catch(() => {});
  }
}

const TRUST_DURATION_DAYS = 30;

function hashDeviceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function login(email: string, password: string, deviceToken?: string): Promise<{ accessToken?: string; refreshToken?: string; userId?: string; requires2FA?: boolean; tempToken?: string }> {
  const user = await repos.users.getByEmail(email);
  if (!user) {
    throw new Error('Invalid credentials');
  }

  if (!bcrypt.compareSync(password, user.passwordHash)) {
    throw new Error('Invalid credentials');
  }

  // Reject suspended users at login time with a clear message
  if (await isUserSuspended(user.id)) {
    throw new Error('Account suspended. Contact an administrator.');
  }

  if (user.totpEnabled) {
    // Check for a valid trusted device token
    if (deviceToken) {
      const tokenHash = hashDeviceToken(deviceToken);
      const trusted = await repos.auth.getTrustedDevice(user.id, tokenHash);
      if (trusted && new Date(trusted.expiresAt) > new Date()) {
        const { accessToken, refreshToken } = createToken({ userId: user.id, email: user.email });
        return { accessToken, refreshToken, userId: user.id };
      }
    }

    // Return a temporary token that only allows 2FA verification
    const tempToken = jwt.sign(
      { userId: user.id, email: user.email, pending2FA: true },
      config.jwt.secret,
      { expiresIn: '5m' } as jwt.SignOptions,
    );
    return { requires2FA: true, tempToken };
  }

  const { accessToken, refreshToken } = createToken({ userId: user.id, email: user.email });
  return { accessToken, refreshToken, userId: user.id };
}

export async function verify2FA(
  tempToken: string,
  totpCode: string,
  trustDevice?: boolean,
): Promise<{ accessToken: string; refreshToken: string; userId: string; deviceToken?: string }> {
  let payload: { userId: string; email: string; pending2FA?: boolean };
  try {
    payload = jwt.verify(tempToken, config.jwt.secret) as typeof payload;
  } catch {
    throw new Error('Invalid or expired verification token');
  }

  if (!payload.pending2FA) {
    throw new Error('Invalid verification token');
  }

  const user = await repos.users.getById(payload.userId);
  if (!user || !user.totpSecret) {
    throw new Error('2FA not configured');
  }

  const isValid = authenticator.check(totpCode, decryptTotpSecret(user.totpSecret));
  if (!isValid) {
    throw new Error('Invalid 2FA code');
  }

  const { accessToken, refreshToken } = createToken({ userId: user.id, email: user.email });

  let deviceToken: string | undefined;
  if (trustDevice) {
    deviceToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashDeviceToken(deviceToken);
    const expiresAt = new Date(Date.now() + TRUST_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Clean up expired tokens for this user
    await repos.auth.deleteExpiredDevices(user.id);

    const ttl = TRUST_DURATION_DAYS * 24 * 60 * 60;
    await repos.auth.createTrustedDevice(user.id, tokenHash, expiresAt, ttl);
  }

  return { accessToken, refreshToken, userId: user.id, deviceToken };
}

export async function setup2FA(userId: string): Promise<{ secret: string; qrCodeUrl: string }> {
  const user = await repos.users.getById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(user.email, 'XPIA-Tools', secret);

  // Store secret encrypted (not yet enabled until confirmed)
  await repos.users.update(userId, { totpSecret: encryptTotpSecret(secret) });

  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
  return { secret, qrCodeUrl };
}

export async function confirm2FA(userId: string, totpCode: string): Promise<{ success: boolean }> {
  const user = await repos.users.getById(userId);
  if (!user || !user.totpSecret) {
    throw new Error('2FA setup not started');
  }

  const isValid = authenticator.check(totpCode, decryptTotpSecret(user.totpSecret));
  if (!isValid) {
    throw new Error('Invalid 2FA code. Please try again.');
  }

  await repos.users.update(userId, { totpEnabled: true, updatedAt: new Date().toISOString() });
  return { success: true };
}

export async function disable2FA(userId: string, totpCode: string): Promise<{ success: boolean }> {
  const user = await repos.users.getById(userId);
  if (!user || !user.totpSecret) {
    throw new Error('2FA not enabled');
  }

  const isValid = authenticator.check(totpCode, decryptTotpSecret(user.totpSecret));
  if (!isValid) {
    throw new Error('Invalid 2FA code');
  }

  await repos.users.update(userId, { totpSecret: null, totpEnabled: false, updatedAt: new Date().toISOString() });
  // Remove all trusted devices for this user
  await repos.auth.deleteAllDevices(userId);
  return { success: true };
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  organization: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  totpEnabled: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isFounder: boolean;
  canGenerateInvites: boolean;
  forcePasswordChange: boolean;
  emailVerified: boolean;
}

export async function getUser(userId: string): Promise<UserProfile | null> {
  const user = await repos.users.getById(userId);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    organization: user.organization,
    jobTitle: user.jobTitle,
    linkedinUrl: user.linkedinUrl,
    totpEnabled: user.totpEnabled,
    isAdmin: user.isAdmin,
    isSuperAdmin: user.isSuperadmin,
    isFounder: await isFoundingSuperAdmin(user.id),
    canGenerateInvites: !!(user.isAdmin || user.canGenerateInvites),
    forcePasswordChange: user.forcePasswordChange,
    emailVerified: user.emailVerified,
  };
}

export async function updateProfile(
  userId: string,
  updates: { firstName?: string; lastName?: string; organization?: string; jobTitle?: string; linkedinUrl?: string },
): Promise<UserProfile> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.firstName !== undefined) { fields.push('first_name = ?'); values.push(updates.firstName); }
  if (updates.lastName !== undefined) { fields.push('last_name = ?'); values.push(updates.lastName); }
  if (updates.organization !== undefined) { fields.push('organization = ?'); values.push(updates.organization); }
  if (updates.jobTitle !== undefined) { fields.push('job_title = ?'); values.push(updates.jobTitle); }
  if (updates.linkedinUrl !== undefined) { fields.push('linkedin_url = ?'); values.push(updates.linkedinUrl); }

  if (fields.length > 0) {
    const updateFields: Partial<UserDoc> = { updatedAt: new Date().toISOString() };
    if (updates.firstName !== undefined) updateFields.firstName = updates.firstName;
    if (updates.lastName !== undefined) updateFields.lastName = updates.lastName;
    if (updates.organization !== undefined) updateFields.organization = updates.organization;
    if (updates.jobTitle !== undefined) updateFields.jobTitle = updates.jobTitle;
    if (updates.linkedinUrl !== undefined) updateFields.linkedinUrl = updates.linkedinUrl;
    await repos.users.update(userId, updateFields);
  }

  const user = await getUser(userId);
  if (!user) throw new Error('User not found');
  return user;
}

// === Password Reset ===

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function requestPasswordReset(email: string): Promise<{ resetUrl: string } | null> {
  const user = await repos.users.getByEmail(email);

  if (!user) {
    // Don't reveal whether email exists — return null silently
    return null;
  }

  // Invalidate any existing unused tokens for this user
  await repos.auth.deleteUnusedPasswordResets(user.id);

  // Generate cryptographically random token
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS).toISOString();
  const ttl = Math.ceil(RESET_TOKEN_EXPIRY_MS / 1000);

  await repos.auth.createPasswordReset(user.id, tokenHash, expiresAt, ttl);

  const resetUrl = `${config.clientUrl}/reset-password?token=${rawToken}`;
  return { resetUrl };
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);

  const resetToken = await repos.auth.getPasswordResetByHash(tokenHash);

  if (!resetToken) {
    throw new Error('Invalid or expired reset link');
  }

  if (resetToken.usedAt) {
    throw new Error('This reset link has already been used');
  }

  if (new Date(resetToken.expiresAt) < new Date()) {
    throw new Error('This reset link has expired');
  }

  const passwordHash = bcrypt.hashSync(newPassword, config.bcryptRounds);

  // Update password, mark token as used, clear trusted devices
  await repos.users.update(resetToken.userId, {
    passwordHash,
    forcePasswordChange: false,
    updatedAt: new Date().toISOString(),
  });
  await repos.auth.markPasswordResetUsed(resetToken.id, resetToken.userId);
  await repos.auth.deleteAllDevices(resetToken.userId);

  // Invalidate all existing tokens for this user
  await blockAllUserTokens(resetToken.userId);
}

// === Change Password (authenticated) ===

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await repos.users.getById(userId);

  if (!user) {
    throw new Error('User not found');
  }

  if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
    throw new Error('Current password is incorrect');
  }

  const passwordHash = bcrypt.hashSync(newPassword, config.bcryptRounds);

  await repos.users.update(userId, {
    passwordHash,
    forcePasswordChange: false,
    updatedAt: new Date().toISOString(),
  });
  await repos.auth.deleteAllDevices(userId);

  // Invalidate all existing tokens so every session must re-login
  await blockAllUserTokens(userId);
}

// === Account Deletion ===

export async function clearTrustedDevices(userId: string): Promise<void> {
  await repos.auth.deleteAllDevices(userId);
}

// === Email Verification ===

const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function createEmailVerification(userId: string): Promise<{ verifyUrl: string }> {
  // Invalidate any existing unused tokens for this user
  await repos.auth.deleteUnusedEmailVerifications(userId);

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS).toISOString();
  const ttl = Math.ceil(VERIFICATION_TOKEN_EXPIRY_MS / 1000);

  await repos.auth.createEmailVerification(userId, tokenHash, expiresAt, ttl);

  const verifyUrl = `${config.clientUrl}/verify-email?token=${rawToken}`;
  return { verifyUrl };
}

export async function verifyEmail(token: string): Promise<void> {
  const tokenHash = hashToken(token);

  const row = await repos.auth.getEmailVerificationByHash(tokenHash);

  if (!row) {
    throw new Error('Invalid or expired verification link');
  }

  if (row.usedAt) {
    throw new Error('This verification link has already been used');
  }

  if (new Date(row.expiresAt) < new Date()) {
    throw new Error('This verification link has expired. Please request a new one.');
  }

  await repos.users.update(row.userId, { emailVerified: true, updatedAt: new Date().toISOString() });
  await repos.auth.markEmailVerificationUsed(row.id, row.userId);
}

export async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = await repos.users.getById(userId);

  if (!user) {
    throw new Error('User not found');
  }

  if (!bcrypt.compareSync(password, user.passwordHash)) {
    throw new Error('Incorrect password');
  }

  // Clean up all related data (replaces SQL CASCADE)
  await repos.auth.deleteAllForUser(userId);
  await repos.users.delete(userId);
  // Usage logs, content, api-keys, and pages are left for audit trail.
  // Add explicit cleanup here if full purge is required.
}
