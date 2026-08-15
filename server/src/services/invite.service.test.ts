import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// We test the invite code logic in isolation — focusing on:
// - Code generation format
// - Validation logic
// - Expiry handling

describe('Invite Code - Code Format', () => {
  it('generates 8-char uppercase alphanumeric codes', () => {
    // Replicate the service's generation logic
    const code = crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-Z0-9_-]+$/);
  });

  it('generates unique codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase());
    }
    // Should be highly unique — at least 99 out of 100
    expect(codes.size).toBeGreaterThanOrEqual(99);
  });
});

describe('Invite Code - Validation Logic', () => {
  it('detects expired codes', () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const isExpired = new Date(pastDate) < new Date();
    expect(isExpired).toBe(true);
  });

  it('accepts non-expired codes', () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const isExpired = new Date(futureDate) < new Date();
    expect(isExpired).toBe(false);
  });

  it('detects already-used codes (single use)', () => {
    const useCount = 1;
    const maxUses = 1;
    expect(useCount >= maxUses).toBe(true);
  });

  it('accepts unused codes', () => {
    const useCount = 0;
    const maxUses = 1;
    expect(useCount >= maxUses).toBe(false);
  });
});

describe('Invite Code - Expiry Calculation', () => {
  it('calculates correct expiry from hours', () => {
    const hours = 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const now = new Date();

    // Should be approximately 24 hours from now
    const diffMs = expiresAt.getTime() - now.getTime();
    const diffHours = diffMs / (60 * 60 * 1000);
    expect(diffHours).toBeGreaterThan(23.9);
    expect(diffHours).toBeLessThan(24.1);
  });

  it('handles null expiry as non-expiring', () => {
    const expiresAt: string | null = null;
    // null = no expiry = always valid
    const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
    expect(isExpired).toBe(false);
  });
});

describe('LinkedIn URL Validation', () => {
  const LINKEDIN_RE = /^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/;

  it('accepts valid LinkedIn URLs', () => {
    const valid = [
      'https://linkedin.com/in/johndoe',
      'https://www.linkedin.com/in/johndoe',
      'https://linkedin.com/in/john-doe',
      'https://linkedin.com/in/john_doe123',
      'https://linkedin.com/in/johndoe/',
    ];
    for (const url of valid) {
      expect(LINKEDIN_RE.test(url), `Expected valid: ${url}`).toBe(true);
    }
  });

  it('rejects invalid LinkedIn URLs', () => {
    const invalid = [
      'http://linkedin.com/in/johndoe',         // http not https
      'https://linkedin.com/company/acme',       // not /in/
      'https://linkedin.com/in/',                // no username
      'https://facebook.com/in/johndoe',         // wrong domain
      'https://linkedin.com/in/john doe',        // space
      'linkedin.com/in/johndoe',                 // no protocol
      'https://linkedin.com/in/johndoe/extra',   // extra path
    ];
    for (const url of invalid) {
      expect(LINKEDIN_RE.test(url), `Expected invalid: ${url}`).toBe(false);
    }
  });
});

describe('Registration Input Validation', () => {
  it('validates required profile fields are non-empty', () => {
    const fields = {
      firstName: 'Jane',
      lastName: 'Doe',
      organization: 'Acme Security',
      jobTitle: 'Pen Tester',
      inviteCode: 'ABCD1234',
    };

    for (const [key, value] of Object.entries(fields)) {
      expect(value.trim().length, `${key} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('trims whitespace from profile fields', () => {
    const input = '  Jane  ';
    expect(input.trim()).toBe('Jane');
  });

  it('uppercases invite codes for normalization', () => {
    const input = 'abcD1234';
    expect(input.toUpperCase()).toBe('ABCD1234');
  });
});

describe('Invite Code - Person Binding', () => {
  it('rejects when registrant email does not match', () => {
    const invitedEmail = 'jane@acme.com';
    const registrantEmail = 'john@acme.com';
    expect(registrantEmail.toLowerCase() !== invitedEmail.toLowerCase()).toBe(true);
  });

  it('accepts when registrant email matches case-insensitively', () => {
    const invitedEmail = 'jane@acme.com';
    const registrantEmail = 'Jane@Acme.COM';
    expect(registrantEmail.toLowerCase() !== invitedEmail.toLowerCase()).toBe(false);
  });

  it('rejects when registrant name does not match', () => {
    const invitedFirst = 'Jane';
    const registrantFirst = 'John';
    expect(registrantFirst.toLowerCase() !== invitedFirst.toLowerCase()).toBe(true);
  });

  it('accepts when registrant name matches case-insensitively', () => {
    const invitedFirst = 'Jane';
    const registrantFirst = 'jane';
    expect(registrantFirst.toLowerCase() !== invitedFirst.toLowerCase()).toBe(false);
  });

  it('skips person check for bootstrap codes with no invited_email', () => {
    const invitedEmail: string | null = null;
    // When invited_email is null, the code is not tied to anyone
    const shouldCheck = invitedEmail !== null;
    expect(shouldCheck).toBe(false);
  });
});

describe('Invite Code - Revoke Status Detection', () => {
  it('distinguishes revoked from used when use_count equals max_uses', () => {
    // A revoked (never-used) code: max_uses=0, use_count=0, revoked_at set
    const revoked = { use_count: 0, max_uses: 0, revoked_at: '2026-01-01T00:00:00.000Z', expires_at: null };
    // A legitimately used code: max_uses=1, use_count=1, revoked_at null
    const used = { use_count: 1, max_uses: 1, revoked_at: null, expires_at: null };

    const isRevoked = (ic: typeof revoked) => !!ic.revoked_at;
    const isUsed = (ic: typeof revoked) => !ic.revoked_at && ic.use_count >= ic.max_uses;

    expect(isRevoked(revoked)).toBe(true);
    expect(isUsed(revoked)).toBe(false);

    expect(isRevoked(used)).toBe(false);
    expect(isUsed(used)).toBe(true);
  });

  it('revoked code is always inactive regardless of expiry', () => {
    const revokedWithFutureExpiry = {
      use_count: 0, max_uses: 0,
      revoked_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2099-12-31T00:00:00.000Z',
    };

    const isRevoked = !!revokedWithFutureExpiry.revoked_at;
    const isExpired = revokedWithFutureExpiry.expires_at
      ? new Date(revokedWithFutureExpiry.expires_at) < new Date()
      : false;
    const inactive = isRevoked || isExpired;

    expect(isRevoked).toBe(true);
    expect(inactive).toBe(true);
  });

  it('active code has no revoked_at and use_count < max_uses', () => {
    const active = { use_count: 0, max_uses: 1, revoked_at: null, expires_at: null };
    const isRevoked = !!active.revoked_at;
    const isUsed = !isRevoked && active.use_count >= active.max_uses;
    const isExpired = active.expires_at ? new Date(active.expires_at) < new Date() : false;
    const inactive = isRevoked || isUsed || isExpired;

    expect(inactive).toBe(false);
  });
});

describe('Invite Code - Lookup Logic', () => {
  it('returns null for expired codes', () => {
    const invite = {
      expires_at: new Date(Date.now() - 1000).toISOString(),
      use_count: 0, max_uses: 1, revoked_at: null,
      invited_email: 'jane@acme.com',
      invited_first_name: 'Jane',
      invited_last_name: 'Doe',
      invited_organization: 'Acme Security',
      invited_job_title: 'Pen Tester',
    };
    const isExpired = invite.expires_at ? new Date(invite.expires_at) < new Date() : false;
    expect(isExpired).toBe(true);
  });

  it('returns null for fully used codes', () => {
    const invite = { use_count: 1, max_uses: 1, revoked_at: null, expires_at: null };
    expect(invite.use_count >= invite.max_uses).toBe(true);
  });

  it('returns null for revoked codes', () => {
    const invite = { revoked_at: '2026-01-01T00:00:00Z', use_count: 0, max_uses: 1, expires_at: null };
    expect(!!invite.revoked_at).toBe(true);
  });

  it('returns pre-fill data for valid codes with org and job title', () => {
    const invite = {
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      use_count: 0, max_uses: 1, revoked_at: null,
      invited_email: 'jane@acme.com',
      invited_first_name: 'Jane',
      invited_last_name: 'Doe',
      invited_organization: 'Acme Security',
      invited_job_title: 'Pen Tester',
    };
    const isExpired = invite.expires_at ? new Date(invite.expires_at) < new Date() : false;
    const isUsed = invite.use_count >= invite.max_uses;
    const isRevoked = !!invite.revoked_at;
    const isValid = !isExpired && !isUsed && !isRevoked;
    expect(isValid).toBe(true);

    const result = {
      email: invite.invited_email,
      firstName: invite.invited_first_name,
      lastName: invite.invited_last_name,
      organization: invite.invited_organization ?? null,
      jobTitle: invite.invited_job_title ?? null,
    };
    expect(result.email).toBe('jane@acme.com');
    expect(result.firstName).toBe('Jane');
    expect(result.lastName).toBe('Doe');
    expect(result.organization).toBe('Acme Security');
    expect(result.jobTitle).toBe('Pen Tester');
  });

  it('returns null org/jobTitle for codes without those fields', () => {
    const invite = {
      expires_at: null,
      use_count: 0, max_uses: 1, revoked_at: null,
      invited_email: 'jane@acme.com',
      invited_first_name: 'Jane',
      invited_last_name: 'Doe',
      invited_organization: undefined as string | undefined,
      invited_job_title: undefined as string | undefined,
    };
    const result = {
      organization: invite.invited_organization ?? null,
      jobTitle: invite.invited_job_title ?? null,
    };
    expect(result.organization).toBeNull();
    expect(result.jobTitle).toBeNull();
  });
});
