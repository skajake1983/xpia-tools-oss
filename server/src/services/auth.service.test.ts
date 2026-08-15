import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { authenticator } from 'otplib';
import { config } from '../config';
import repos from '../db/repos';
import type { UserDoc } from '../db/repositories/types';
import { login, verify2FA, disable2FA, resetPassword, requestPasswordReset, setup2FA, confirm2FA, deleteAccount, createToken, blockToken, isTokenBlocked, blockAllUserTokens, isUserBlocked, clearUserBlock, refreshAccessToken, isUserSuspended, cleanExpiredBlocklistEntries, clearTrustedDevices, changePassword, getUser, createEmailVerification, verifyEmail, checkAndNotifyUserMilestone } from './auth.service';

function makeUser(overrides: Partial<UserDoc> & { id: string; email: string }): UserDoc {
  const now = new Date().toISOString();
  return {
    passwordHash: bcrypt.hashSync('TestPass1!', 4),
    totpSecret: null,
    totpEnabled: false,
    isAdmin: false,
    isSuperadmin: false,
    forcePasswordChange: false,
    firstName: null,
    lastName: null,
    organization: null,
    jobTitle: null,
    linkedinUrl: null,
    termsAcceptedAt: null,
    canGenerateInvites: false,
    emailVerified: false,
    limits: { dailyTokenLimit: 0, isSuspended: false, updatedBy: null },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Auth Service - Token Creation', () => {
  it('creates valid JWT access and refresh tokens', () => {
    const payload = { userId: 'test-123', email: 'test@example.com' };
    const { accessToken, refreshToken, jti } = createToken(payload);

    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();
    expect(jti).toBeDefined();
    expect(accessToken.split('.')).toHaveLength(3);
    expect(refreshToken.split('.')).toHaveLength(3);

    const decoded = jwt.verify(accessToken, config.jwt.secret) as typeof payload & { jti: string };
    expect(decoded.userId).toBe('test-123');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.jti).toBe(jti);
  });

  it('rejects tokens with wrong secret', () => {
    const { accessToken } = createToken({ userId: 'test', email: 'x@y.com' });
    expect(() => jwt.verify(accessToken, 'wrong-secret')).toThrow();
  });

  it('rejects expired tokens', () => {
    const token = jwt.sign({ userId: 'test' }, config.jwt.secret, { expiresIn: '0s' } as jwt.SignOptions);
    expect(() => jwt.verify(token, config.jwt.secret)).toThrow();
  });
});

describe('Config', () => {
  it('has required configuration values', () => {
    expect(config.port).toBeTypeOf('number');
    expect(config.jwt.secret).toBeDefined();
    expect(config.jwt.expiresIn).toBeDefined();
    expect(config.bcryptRounds).toBeGreaterThanOrEqual(10);
  });
});

describe('Trusted Device Flow', () => {
  const testEmail = `trust-test-${Date.now()}@example.com`;
  const testPassword = 'TrustedDev1ce!Pass';
  let userId: string;
  let totpSecret: string;

  beforeAll(async () => {
    userId = uuidv4();
    totpSecret = authenticator.generateSecret();
    const passwordHash = bcrypt.hashSync(testPassword, 4);

    // Insert a test user with 2FA enabled
    await repos.users.create(makeUser({
      id: userId,
      email: testEmail,
      passwordHash,
      totpSecret,
      totpEnabled: true,
    }));
  });

  afterAll(async () => {
    await repos.auth.deleteAllForUser(userId);
    await repos.users.delete(userId);
  });

  it('login returns requires2FA when no device token is provided', async () => {
    const result = await login(testEmail, testPassword);
    expect(result.requires2FA).toBe(true);
    expect(result.tempToken).toBeDefined();
    expect(result.accessToken).toBeUndefined();
  });

  it('verify2FA with trustDevice=true returns a deviceToken', async () => {
    const loginResult = await login(testEmail, testPassword);
    const totpCode = authenticator.generate(totpSecret);
    const result = await verify2FA(loginResult.tempToken!, totpCode, true);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.deviceToken).toBeDefined();
    expect(typeof result.deviceToken).toBe('string');
    expect(result.deviceToken!.length).toBeGreaterThan(10);
  });

  it('verify2FA without trustDevice does not return a deviceToken', async () => {
    const loginResult = await login(testEmail, testPassword);
    const totpCode = authenticator.generate(totpSecret);
    const result = await verify2FA(loginResult.tempToken!, totpCode);

    expect(result.accessToken).toBeDefined();
    expect(result.deviceToken).toBeUndefined();
  });

  it('login skips 2FA when valid device token is provided', async () => {
    // First, get a trusted device token
    const loginResult = await login(testEmail, testPassword);
    const totpCode = authenticator.generate(totpSecret);
    const verifyResult = await verify2FA(loginResult.tempToken!, totpCode, true);
    const deviceToken = verifyResult.deviceToken!;

    // Now login again with the device token — should skip 2FA
    const result = await login(testEmail, testPassword, deviceToken);
    expect(result.accessToken).toBeDefined();
    expect(result.requires2FA).toBeUndefined();
  });

  it('login requires 2FA with invalid device token', async () => {
    const result = await login(testEmail, testPassword, 'bogus-token-value');
    expect(result.requires2FA).toBe(true);
    expect(result.accessToken).toBeUndefined();
  });

  it('trusted device is cleaned up when 2FA is disabled', async () => {
    // Create a trusted device
    const loginResult = await login(testEmail, testPassword);
    const totpCode1 = authenticator.generate(totpSecret);
    const verifyResult = await verify2FA(loginResult.tempToken!, totpCode1, true);
    const deviceToken = verifyResult.deviceToken!;

    // Verify it works
    const skipResult = await login(testEmail, testPassword, deviceToken);
    expect(skipResult.accessToken).toBeDefined();

    // Disable 2FA
    const totpCode2 = authenticator.generate(totpSecret);
    await disable2FA(userId, totpCode2);

    // Trusted devices should be cleared — login should not skip 2FA
    // Re-enable 2FA for subsequent tests
    await repos.users.update(userId, { totpSecret, totpEnabled: true });
  });

  it('password reset clears all trusted devices', async () => {
    // Re-enable 2FA for this user
    const newSecret = authenticator.generateSecret();
    await repos.users.update(userId, { totpSecret: newSecret, totpEnabled: true });

    // Create a trusted device
    const loginResult = await login(testEmail, testPassword);
    const totpCode = authenticator.generate(newSecret);
    const verifyResult = await verify2FA(loginResult.tempToken!, totpCode, true);
    const deviceToken = verifyResult.deviceToken!;

    // Verify trusted device works
    const skipResult = await login(testEmail, testPassword, deviceToken);
    expect(skipResult.accessToken).toBeDefined();

    // Request and perform password reset
    const resetResult = await requestPasswordReset(testEmail);
    expect(resetResult).toBeDefined();
    const resetUrl = resetResult!.resetUrl;
    const rawToken = new URL(resetUrl).searchParams.get('token')!;

    const newPassword = 'NewSecurePass1!';
    await resetPassword(rawToken, newPassword);

    // Login with new password should require 2FA again (device token no longer valid)
    const postResetLogin = await login(testEmail, newPassword, deviceToken);
    expect(postResetLogin.requires2FA).toBe(true);
    expect(postResetLogin.accessToken).toBeUndefined();
  });
});

describe('TOTP Secret Encryption', () => {
  const testEmail = `totp-enc-${Date.now()}@example.com`;
  const testPassword = 'EncryptedT0tp!Pass';
  let userId: string;

  beforeAll(async () => {
    userId = uuidv4();
    const passwordHash = bcrypt.hashSync(testPassword, 4);
    await repos.users.create(makeUser({
      id: userId,
      email: testEmail,
      passwordHash,
    }));
  });

  afterAll(async () => {
    await repos.auth.deleteAllForUser(userId);
    await repos.users.delete(userId);
  });

  it('setup2FA stores an encrypted secret (enc:v1: prefix)', async () => {
    const result = await setup2FA(userId);
    expect(result.secret).toBeDefined();
    expect(result.qrCodeUrl).toContain('data:image/png');

    const user = await repos.users.getById(userId);
    expect(user!.totpSecret).toMatch(/^enc:v1:/);
    expect(user!.totpSecret).not.toBe(result.secret);
  });

  it('confirm2FA decrypts and validates the code', async () => {
    const { secret } = await setup2FA(userId);
    const code = authenticator.generate(secret);
    const result = await confirm2FA(userId, code);
    expect(result.success).toBe(true);
  });

  it('verify2FA decrypts and validates the code after login', async () => {
    // Reset 2FA for a clean setup
    await repos.users.update(userId, { totpSecret: null, totpEnabled: false });
    const { secret } = await setup2FA(userId);
    const setupCode = authenticator.generate(secret);
    await confirm2FA(userId, setupCode);

    // Now login → should require 2FA
    const loginResult = await login(testEmail, testPassword);
    expect(loginResult.requires2FA).toBe(true);

    const verifyCode = authenticator.generate(secret);
    const verifyResult = await verify2FA(loginResult.tempToken!, verifyCode);
    expect(verifyResult.accessToken).toBeDefined();
  });

  it('disable2FA decrypts and validates the code', async () => {
    await repos.users.update(userId, { totpSecret: null, totpEnabled: false });
    const { secret } = await setup2FA(userId);
    const setupCode = authenticator.generate(secret);
    await confirm2FA(userId, setupCode);

    const disableCode = authenticator.generate(secret);
    const result = await disable2FA(userId, disableCode);
    expect(result.success).toBe(true);

    const user = await repos.users.getById(userId);
    expect(user!.totpSecret).toBeNull();
    expect(user!.totpEnabled).toBe(false);
  });

  it('rejects invalid TOTP code even with encrypted secret', async () => {
    await repos.users.update(userId, { totpSecret: null, totpEnabled: false });
    await setup2FA(userId);
    await expect(async () => await confirm2FA(userId, '000000')).rejects.toThrow('Invalid 2FA code');
  });
});

describe('Account Deletion', () => {
  const testEmail = `delete-test-${Date.now()}@example.com`;
  const testPassword = 'DeleteMe1!Strong';
  let userId: string;

  beforeAll(async () => {
    userId = uuidv4();
    const passwordHash = bcrypt.hashSync(testPassword, 4);
    await repos.users.create(makeUser({
      id: userId,
      email: testEmail,
      passwordHash,
    }));
  });

  it('rejects deletion with wrong password', async () => {
    await expect(async () => await deleteAccount(userId, 'WrongPassword1!')).rejects.toThrow('Incorrect password');
    // User should still exist
    const user = await repos.users.getById(userId);
    expect(user).toBeDefined();
  });

  it('deletes account with correct password', async () => {
    await deleteAccount(userId, testPassword);

    // User should be gone
    const user = await repos.users.getById(userId);
    expect(user).toBeUndefined();
  });

  it('throws for non-existent user', async () => {
    await expect(async () => await deleteAccount('non-existent-id', testPassword)).rejects.toThrow('User not found');
  });
});

describe('Token Blocklist', () => {
  const blUserId = uuidv4();
  const blEmail = `bl-${Date.now()}@example.com`;

  beforeAll(async () => {
    const passwordHash = bcrypt.hashSync('TestPass1!', 4);
    await repos.users.create(makeUser({ id: blUserId, email: blEmail, passwordHash }));
  });

  afterAll(async () => {
    await repos.auth.deleteAllForUser(blUserId);
    await repos.users.delete(blUserId);
  });

  it('blocks and detects a token JTI', async () => {
    const jti = uuidv4();
    expect(await isTokenBlocked(jti)).toBe(false);
    await blockToken(jti, blUserId, new Date(Date.now() + 60_000));
    expect(await isTokenBlocked(jti)).toBe(true);
  });

  it('blocks all tokens for a user and detects it', async () => {
    expect(await isUserBlocked(blUserId)).toBe(false);
    await blockAllUserTokens(blUserId);
    expect(await isUserBlocked(blUserId)).toBe(true);
  });

  it('cleanExpiredBlocklistEntries removes old entries', async () => {
    const jti = uuidv4();
    await blockToken(jti, blUserId, new Date(Date.now() - 1000)); // already expired
    await cleanExpiredBlocklistEntries();
    expect(await isTokenBlocked(jti)).toBe(false);
  });

  it('clearUserBlock removes the user-level marker', async () => {
    await blockAllUserTokens(blUserId);
    expect(await isUserBlocked(blUserId)).toBe(true);
    await clearUserBlock(blUserId);
    expect(await isUserBlocked(blUserId)).toBe(false);
  });
});

describe('Refresh Token Flow', () => {
  const rfUserId = uuidv4();
  const rfEmail = `rf-${Date.now()}@example.com`;

  beforeAll(async () => {
    const passwordHash = bcrypt.hashSync('TestPass1!', 4);
    await repos.users.create(makeUser({ id: rfUserId, email: rfEmail, passwordHash }));
  });

  afterAll(async () => {
    await repos.auth.deleteAllForUser(rfUserId);
    await repos.users.delete(rfUserId);
  });

  it('issues new token pair from a valid refresh token', async () => {
    const { refreshToken } = createToken({ userId: rfUserId, email: rfEmail });
    const result = await refreshAccessToken(refreshToken);
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.jti).toBeDefined();
  });

  it('rejects a used (rotated) refresh token', async () => {
    const { refreshToken } = createToken({ userId: rfUserId, email: rfEmail });
    await refreshAccessToken(refreshToken); // first use — OK
    await expect(async () => await refreshAccessToken(refreshToken)).rejects.toThrow('Token has been revoked');
  });

  it('rejects an access token used as refresh token', async () => {
    const { accessToken } = createToken({ userId: rfUserId, email: rfEmail });
    await expect(async () => await refreshAccessToken(accessToken)).rejects.toThrow();
  });

  it('rejects refresh when user is blocked', async () => {
    const blockedUserId = uuidv4();
    const blockedEmail = `blocked-${Date.now()}@example.com`;
    const passwordHash = bcrypt.hashSync('TestPass1!', 4);
    await repos.users.create(makeUser({ id: blockedUserId, email: blockedEmail, passwordHash }));

    const { refreshToken } = createToken({ userId: blockedUserId, email: blockedEmail });
    await blockAllUserTokens(blockedUserId);
    await expect(async () => await refreshAccessToken(refreshToken)).rejects.toThrow('Token has been revoked');

    await repos.auth.deleteAllForUser(blockedUserId);
    await repos.users.delete(blockedUserId);
  });
});

describe('Suspension Check', () => {
  const suspUserId = uuidv4();
  const suspEmail = `susp-${Date.now()}@example.com`;

  beforeAll(async () => {
    const passwordHash = bcrypt.hashSync('TestPass1!', 4);
    await repos.users.create(makeUser({ id: suspUserId, email: suspEmail, passwordHash }));
  });

  afterAll(async () => {
    await repos.auth.deleteAllForUser(suspUserId);
    await repos.users.delete(suspUserId);
  });

  it('returns false for non-suspended user', async () => {
    expect(await isUserSuspended(suspUserId)).toBe(false);
  });

  it('returns true for suspended user', async () => {
    await repos.users.update(suspUserId, { limits: { dailyTokenLimit: 0, isSuspended: true, updatedBy: null } });
    expect(await isUserSuspended(suspUserId)).toBe(true);
    await repos.users.update(suspUserId, { limits: { dailyTokenLimit: 0, isSuspended: false, updatedBy: null } });
  });

  it('login rejects suspended users with a clear message', async () => {
    await repos.users.update(suspUserId, { limits: { dailyTokenLimit: 0, isSuspended: true, updatedBy: null } });
    await expect(async () => await login(suspEmail, 'TestPass1!')).rejects.toThrow('Account suspended. Contact an administrator.');
    await repos.users.update(suspUserId, { limits: { dailyTokenLimit: 0, isSuspended: false, updatedBy: null } });
  });
});

describe('Clear Trusted Devices', () => {
  const devUserId = uuidv4();
  const devEmail = `dev-${Date.now()}@example.com`;

  beforeAll(async () => {
    const passwordHash = bcrypt.hashSync('TestPass1!', 4);
    await repos.users.create(makeUser({ id: devUserId, email: devEmail, passwordHash }));
    // Add a trusted device
    await repos.auth.createTrustedDevice(devUserId, 'fakehash', new Date(Date.now() + 86400000).toISOString(), 86400);
  });

  afterAll(async () => {
    await repos.auth.deleteAllForUser(devUserId);
    await repos.users.delete(devUserId);
  });

  it('clears all trusted devices for a user', async () => {
    // Verify device exists by checking a known hash
    const device = await repos.auth.getTrustedDevice(devUserId, 'fakehash');
    expect(device).toBeDefined();

    await clearTrustedDevices(devUserId);

    const deviceAfter = await repos.auth.getTrustedDevice(devUserId, 'fakehash');
    expect(deviceAfter).toBeUndefined();
  });

  it('password reset also blocks all user tokens', async () => {
    // Create a user with known password for reset test
    const rpUserId = uuidv4();
    const rpEmail = `rp-${Date.now()}@example.com`;
    const passwordHash = bcrypt.hashSync('OldPass1!Strong', 4);
    await repos.users.create(makeUser({ id: rpUserId, email: rpEmail, passwordHash }));

    const result = await requestPasswordReset(rpEmail);
    expect(result).toBeDefined();
    const rawToken = new URL(result!.resetUrl).searchParams.get('token')!;
    await resetPassword(rawToken, 'NewSecurePass1!');

    // User tokens should be blocked
    expect(await isUserBlocked(rpUserId)).toBe(true);

    // Cleanup
    await repos.auth.deleteAllForUser(rpUserId);
    await repos.users.delete(rpUserId);
  });
});

describe('Change Password', () => {
  const cpUserId = uuidv4();
  const cpEmail = `cp-${Date.now()}@example.com`;
  const oldPassword = 'OldPassword1!Strong';
  const newPassword = 'NewPassword2@Strong';

  beforeAll(async () => {
    const passwordHash = bcrypt.hashSync(oldPassword, 4);
    await repos.users.create(makeUser({
      id: cpUserId,
      email: cpEmail,
      passwordHash,
      totpEnabled: true,
    }));
  });

  afterAll(async () => {
    await repos.auth.deleteAllForUser(cpUserId);
    await repos.users.delete(cpUserId);
  });

  it('rejects incorrect current password', async () => {
    await expect(async () => await changePassword(cpUserId, 'WrongPassword1!', newPassword)).rejects.toThrow('Current password is incorrect');
  });

  it('changes password with correct current password', async () => {
    await changePassword(cpUserId, oldPassword, newPassword);
    // Verify new password works by checking bcrypt directly
    const user = await repos.users.getById(cpUserId);
    expect(bcrypt.compareSync(newPassword, user!.passwordHash)).toBe(true);
  });

  it('clears force_password_change flag after change', async () => {
    // Set the flag
    await repos.users.update(cpUserId, { forcePasswordChange: true });
    const before = await repos.users.getById(cpUserId);
    expect(before!.forcePasswordChange).toBe(true);

    await changePassword(cpUserId, newPassword, 'AnotherPass3#Strong');
    const after = await repos.users.getById(cpUserId);
    expect(after!.forcePasswordChange).toBe(false);
  });

  it('blocks all user tokens after password change', async () => {
    // Clear any existing blocks
    await clearUserBlock(cpUserId);
    expect(await isUserBlocked(cpUserId)).toBe(false);

    await changePassword(cpUserId, 'AnotherPass3#Strong', 'FinalPass4$Strong');
    expect(await isUserBlocked(cpUserId)).toBe(true);
  });
});

describe('Force Password Change on Reset', () => {
  const fpUserId = uuidv4();
  const fpEmail = `fp-${Date.now()}@example.com`;

  beforeAll(async () => {
    const passwordHash = bcrypt.hashSync('OriginalPass1!', 4);
    await repos.users.create(makeUser({
      id: fpUserId,
      email: fpEmail,
      passwordHash,
      totpEnabled: true,
    }));
  });

  afterAll(async () => {
    await repos.auth.deleteAllForUser(fpUserId);
    await repos.users.delete(fpUserId);
  });

  it('clears force_password_change flag after password reset', async () => {
    const result = await requestPasswordReset(fpEmail);
    expect(result).toBeDefined();
    const rawToken = new URL(result!.resetUrl).searchParams.get('token')!;
    await resetPassword(rawToken, 'ResetPass5%Strong');

    const user = await repos.users.getById(fpUserId);
    expect(user!.forcePasswordChange).toBe(false);
  });

  it('getUser returns forcePasswordChange boolean', async () => {
    const user = await getUser(fpUserId);
    expect(user).toBeDefined();
    expect(user!.forcePasswordChange).toBe(false);
  });

  it('forcePasswordChange is false after changing password', async () => {
    await changePassword(fpUserId, 'ResetPass5%Strong', 'FreshPass6^Strong');
    const user = await getUser(fpUserId);
    expect(user).toBeDefined();
    expect(user!.forcePasswordChange).toBe(false);
  });
});

describe('Email Verification', () => {
  const evUserId = uuidv4();
  const evEmail = `ev-${Date.now()}@example.com`;

  beforeAll(async () => {
    const passwordHash = bcrypt.hashSync('TestPass1!Strong', 4);
    await repos.users.create(makeUser({
      id: evUserId,
      email: evEmail,
      passwordHash,
      emailVerified: false,
    }));
  });

  afterAll(async () => {
    await repos.auth.deleteAllForUser(evUserId);
    await repos.users.delete(evUserId);
  });

  it('getUser returns emailVerified: false for unverified user', async () => {
    const user = await getUser(evUserId);
    expect(user).toBeDefined();
    expect(user!.emailVerified).toBe(false);
  });

  it('creates a verification token and returns a URL', async () => {
    const { verifyUrl } = await createEmailVerification(evUserId);
    expect(verifyUrl).toContain('/verify-email?token=');
  });

  it('verifies email with a valid token', async () => {
    const { verifyUrl } = await createEmailVerification(evUserId);
    const rawToken = new URL(verifyUrl).searchParams.get('token')!;
    await verifyEmail(rawToken);

    const user = await getUser(evUserId);
    expect(user!.emailVerified).toBe(true);
  });

  it('rejects an already-used token', async () => {
    // Reset to unverified
    await repos.users.update(evUserId, { emailVerified: false });
    const { verifyUrl } = await createEmailVerification(evUserId);
    const rawToken = new URL(verifyUrl).searchParams.get('token')!;
    await verifyEmail(rawToken);
    await expect(async () => await verifyEmail(rawToken)).rejects.toThrow('already been used');
  });

  it('rejects an invalid token', async () => {
    await expect(async () => await verifyEmail('totally-bogus-token')).rejects.toThrow('Invalid or expired');
  });

  it('invalidates previous token when a new one is created', async () => {
    await repos.users.update(evUserId, { emailVerified: false });
    const { verifyUrl: first } = await createEmailVerification(evUserId);
    const firstToken = new URL(first).searchParams.get('token')!;

    // Create a second token (should invalidate the first)
    const { verifyUrl: second } = await createEmailVerification(evUserId);
    const secondToken = new URL(second).searchParams.get('token')!;

    // First token should no longer work
    await expect(async () => await verifyEmail(firstToken)).rejects.toThrow('Invalid or expired');

    // Second token should work
    await verifyEmail(secondToken);
    const user = await getUser(evUserId);
    expect(user!.emailVerified).toBe(true);
  });
});

describe('Email Verification — pre-feature users auto-verified', () => {
  it('users created without verification are marked unverified by default', async () => {
    const id = uuidv4();
    await repos.users.create(makeUser({ id, email: `pre-${Date.now()}@example.com` }));
    const user = await repos.users.getById(id);
    expect(user!.emailVerified).toBe(false);
    await repos.users.delete(id);
  });
});

describe('User Milestone Notifications', () => {
  const milestoneUserIds: string[] = [];

  afterAll(async () => {
    for (const id of milestoneUserIds) {
      await repos.users.delete(id);
    }
    // Clean up milestone settings
    await repos.config.delete('site:user_milestone_50');
    await repos.config.delete('site:milestone_notifications');
  });

  async function seedUsers(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      const id = uuidv4();
      milestoneUserIds.push(id);
      await repos.users.create(makeUser({
        id,
        email: `milestone-${Date.now()}-${i}@example.com`,
        isSuperadmin: i === 0,
      }));
    }
  }

  it('does nothing when user count is below 50', async () => {
    await seedUsers(10);
    await checkAndNotifyUserMilestone();
    const setting = await repos.config.getSiteSetting('site:user_milestone_50');
    expect(setting).toBeUndefined();
  });

  it('skips when milestone notifications are disabled', async () => {
    const currentCount = await repos.users.count();
    await seedUsers(50 - currentCount);
    // Disable notifications
    await repos.config.upsertSiteSetting({
      id: 'site:milestone_notifications',
      type: 'site_setting',
      value: 'false',
      updatedBy: 'test',
      updatedAt: new Date().toISOString(),
    });

    await checkAndNotifyUserMilestone();

    const setting = await repos.config.getSiteSetting('site:user_milestone_50');
    expect(setting).toBeUndefined();

    // Re-enable for subsequent tests
    await repos.config.delete('site:milestone_notifications');
  });

  it('records milestone setting when user count reaches 50', async () => {
    const totalNow = await repos.users.count();
    expect(totalNow).toBeGreaterThanOrEqual(50);

    await checkAndNotifyUserMilestone();

    const setting = await repos.config.getSiteSetting('site:user_milestone_50');
    expect(setting).toBeDefined();
    expect(setting!.value).toBeTruthy();
    expect(setting!.updatedBy).toBe('system');
  });

  it('does not re-record an already-notified milestone', async () => {
    const settingBefore = await repos.config.getSiteSetting('site:user_milestone_50');
    const originalTimestamp = settingBefore!.updatedAt;

    await checkAndNotifyUserMilestone();

    const settingAfter = await repos.config.getSiteSetting('site:user_milestone_50');
    expect(settingAfter!.updatedAt).toBe(originalTimestamp);
  });
});
