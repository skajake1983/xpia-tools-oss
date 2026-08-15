import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import repos from '../db/repos';
import type { UserDoc } from '../db/repositories/types';

function makeUser(overrides: Partial<UserDoc> & { id: string; email: string }): UserDoc {
  const now = new Date().toISOString();
  return {
    passwordHash: bcrypt.hashSync('TestPassword1!', 4),
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

describe('Admin Delete User — DB-level validation', () => {
  const founderEmail = `founder-${Date.now()}@example.com`;
  const adminEmail = `admin-del-${Date.now()}@example.com`;
  const normalEmail = `normal-del-${Date.now()}@example.com`;
  let founderId: string;
  let adminId: string;
  let normalUserId: string;

  beforeAll(async () => {
    founderId = uuidv4();
    adminId = uuidv4();
    normalUserId = uuidv4();

    // Founder superadmin
    await repos.users.create(makeUser({
      id: founderId,
      email: founderEmail,
      isAdmin: true,
      isSuperadmin: true,
    }));

    // Regular admin
    await repos.users.create(makeUser({
      id: adminId,
      email: adminEmail,
      isAdmin: true,
    }));

    // Normal user
    await repos.users.create(makeUser({
      id: normalUserId,
      email: normalEmail,
    }));
  });

  afterAll(async () => {
    for (const id of [founderId, adminId, normalUserId]) {
      await repos.auth.deleteAllForUser(id);
      await repos.users.delete(id);
    }
  });

  it('deleting a user removes auth docs', async () => {
    const tempId = uuidv4();
    const tempEmail = `cascade-auth-${Date.now()}@example.com`;
    await repos.users.create(makeUser({ id: tempId, email: tempEmail }));
    // Create an auth doc (trusted device)
    await repos.auth.createTrustedDevice(tempId, 'testhash', new Date(Date.now() + 86400000).toISOString(), 86400);

    const device = await repos.auth.getTrustedDevice(tempId, 'testhash');
    expect(device).toBeDefined();

    // Delete user + auth docs
    await repos.auth.deleteAllForUser(tempId);
    await repos.users.delete(tempId);

    const deviceAfter = await repos.auth.getTrustedDevice(tempId, 'testhash');
    expect(deviceAfter).toBeUndefined();
    const userAfter = await repos.users.getById(tempId);
    expect(userAfter).toBeUndefined();
  });

  it('user count decreases after deletion', async () => {
    const beforeCount = await repos.users.count();

    const tempId = uuidv4();
    await repos.users.create(makeUser({ id: tempId, email: `temp-count-${Date.now()}@example.com` }));

    const midCount = await repos.users.count();
    expect(midCount).toBe(beforeCount + 1);

    await repos.users.delete(tempId);

    const afterCount = await repos.users.count();
    expect(afterCount).toBe(beforeCount);
  });

  it('deleting a non-existent user does not throw', async () => {
    // Should not throw — repos.users.delete is idempotent
    await expect(repos.users.delete('non-existent-id')).resolves.not.toThrow();
  });
});
