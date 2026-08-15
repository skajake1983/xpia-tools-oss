import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import repos from '../db/repos';
import type { InviteCodeDoc } from '../db/repositories/types';

interface InviteCode {
  id: string;
  code: string;
  created_by: string;
  used_by: string | null;
  max_uses: number;
  use_count: number;
  note: string | null;
  invited_email: string | null;
  invited_first_name: string | null;
  invited_last_name: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface InviteCodeWithCreator extends InviteCode {
  creator_email: string;
}

/** Map CosmosDB doc → legacy snake_case */
function toLegacy(doc: InviteCodeDoc): InviteCode {
  return {
    id: doc.id, code: doc.code, created_by: doc.createdBy,
    used_by: doc.usedBy, max_uses: doc.maxUses, use_count: doc.useCount,
    note: doc.note, invited_email: doc.invitedEmail,
    invited_first_name: doc.invitedFirstName, invited_last_name: doc.invitedLastName,
    expires_at: doc.expiresAt, revoked_at: doc.revokedAt, created_at: doc.createdAt,
  };
}

function generateCode(): string {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
}

export async function canUserGenerateInvites(userId: string): Promise<boolean> {
  const user = await repos.users.getById(userId);
  if (!user) return false;
  return !!(user.isAdmin || user.canGenerateInvites);
}

export async function createInviteCode(
  createdBy: string,
  options: { email: string; firstName: string; lastName: string; organization?: string; jobTitle?: string; expiresInHours?: number },
): Promise<{ id: string; code: string }> {
  if (!(await canUserGenerateInvites(createdBy))) {
    throw new Error('Not authorized to generate invite codes');
  }

  const id = uuidv4();
  const code = generateCode();
  const expiresAt = options.expiresInHours
    ? new Date(Date.now() + options.expiresInHours * 60 * 60 * 1000).toISOString()
    : null;

  await repos.config.createInviteCode({
    id, type: 'invite_code', code, createdBy, maxUses: 1, useCount: 0,
    usedBy: null,
    note: `For ${options.firstName} ${options.lastName}`,
    invitedEmail: options.email.toLowerCase(),
    invitedFirstName: options.firstName,
    invitedLastName: options.lastName,
    invitedOrganization: options.organization ?? null,
    invitedJobTitle: options.jobTitle ?? null,
    expiresAt, revokedAt: null, createdAt: new Date().toISOString(),
  });

  return { id, code };
}

export async function validateInviteCode(
  code: string,
  registrant?: { email: string; firstName: string; lastName: string },
): Promise<{ valid: boolean; error?: string }> {
  const invite = await repos.config.getInviteByCode(code);

  if (!invite) {
    return { valid: false, error: 'Invalid invite code' };
  }

  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return { valid: false, error: 'Invite code has expired' };
  }

  if (invite.useCount >= invite.maxUses) {
    return { valid: false, error: 'Invite code has already been used' };
  }

  if (invite.invitedEmail && registrant) {
    if (registrant.email.toLowerCase() !== invite.invitedEmail.toLowerCase()) {
      return { valid: false, error: 'This invite code was issued for a different email address' };
    }
    if (registrant.firstName.toLowerCase() !== (invite.invitedFirstName ?? '').toLowerCase()) {
      return { valid: false, error: 'This invite code was issued for a different person' };
    }
    if (registrant.lastName.toLowerCase() !== (invite.invitedLastName ?? '').toLowerCase()) {
      return { valid: false, error: 'This invite code was issued for a different person' };
    }
  }

  return { valid: true };
}

export async function redeemInviteCode(code: string, usedBy: string): Promise<void> {
  const result = await validateInviteCode(code);
  if (!result.valid) {
    throw new Error(result.error);
  }

  const invite = await repos.config.getInviteByCode(code);
  if (invite) {
    await repos.config.updateInviteCode(invite.id, { useCount: invite.useCount + 1, usedBy });
  }
}

export async function listInviteCodes(createdBy?: string): Promise<InviteCodeWithCreator[]> {
  const codes = await repos.config.listInviteCodes(createdBy);
  // Enrich with creator email
  const results: InviteCodeWithCreator[] = [];
  for (const doc of codes) {
    let creatorEmail = '';
    if (doc.createdBy && doc.createdBy !== 'SYSTEM') {
      const creator = await repos.users.getById(doc.createdBy);
      creatorEmail = creator?.email ?? '';
    }
    results.push({ ...toLegacy(doc), creator_email: creatorEmail });
  }
  return results;
}

export async function revokeInviteCode(id: string, userId: string): Promise<void> {
  const invite = await repos.config.getInviteById(id);
  if (!invite) {
    throw new Error('Invite code not found');
  }

  const user = await repos.users.getById(userId);
  if (invite.createdBy !== userId && !user?.isAdmin) {
    throw new Error('Not authorized to revoke this code');
  }

  await repos.config.updateInviteCode(id, { maxUses: invite.useCount, revokedAt: new Date().toISOString() });
}

export async function lookupInviteCode(code: string): Promise<{
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  organization: string | null;
  jobTitle: string | null;
} | null> {
  const invite = await repos.config.getInviteByCode(code);
  if (!invite) return null;

  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return null;
  if (invite.useCount >= invite.maxUses) return null;
  if (invite.revokedAt) return null;

  return {
    email: invite.invitedEmail,
    firstName: invite.invitedFirstName,
    lastName: invite.invitedLastName,
    organization: invite.invitedOrganization ?? null,
    jobTitle: invite.invitedJobTitle ?? null,
  };
}
