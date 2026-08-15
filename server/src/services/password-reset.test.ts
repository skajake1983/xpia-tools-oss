import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { z } from 'zod';
import { validatePassword, PASSWORD_RULES } from '../../../shared/password-rules';

// Schema mirrors auth.ts route validation
const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

const strongPassword = z.string().min(12).max(128).refine(
  (pw) => validatePassword(pw).valid,
  (pw) => ({ message: `Password requirements not met: ${validatePassword(pw).failures.join(', ')}` }),
);

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: strongPassword,
});

// Token hashing mirrors auth.service.ts
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

describe('password reset — schema validation', () => {
  it('accepts a valid forgot-password email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'user@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = forgotPasswordSchema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects missing email', () => {
    const result = forgotPasswordSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts a valid reset-password payload', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123def456',
      password: 'Str0ng!Pass#99',
    });
    expect(result.success).toBe(true);
  });

  it('rejects reset password shorter than 12 chars', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123',
      password: 'Sh0rt!pw',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without uppercase', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123',
      password: 'nouppercase1!abc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without lowercase', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123',
      password: 'NOLOWERCASE1!AB',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without digit', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123',
      password: 'NoDigitHere!!ab',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password without special character', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123',
      password: 'NoSpecialChar1a',
    });
    expect(result.success).toBe(false);
  });

  it('rejects reset password longer than 128 chars', () => {
    const result = resetPasswordSchema.safeParse({
      token: 'abc123',
      password: 'x'.repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty token', () => {
    const result = resetPasswordSchema.safeParse({
      token: '',
      password: 'ValidPassword1',
    });
    expect(result.success).toBe(false);
  });
});

describe('password reset — token hashing', () => {
  it('produces a consistent SHA-256 hash', () => {
    const token = 'test-reset-token-123';
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('different tokens produce different hashes', () => {
    const hash1 = hashToken('token-aaa');
    const hash2 = hashToken('token-bbb');
    expect(hash1).not.toBe(hash2);
  });

  it('raw token cannot be derived from hash', () => {
    const token = 'my-secret-reset-token';
    const hash = hashToken(token);
    // Hash shouldn't contain the original token
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('password reset — token generation', () => {
  it('crypto.randomBytes produces unique tokens', () => {
    const token1 = crypto.randomBytes(32).toString('base64url');
    const token2 = crypto.randomBytes(32).toString('base64url');
    expect(token1).not.toBe(token2);
    // URL-safe base64 of 32 bytes = 43 chars
    expect(token1.length).toBeGreaterThanOrEqual(40);
  });
});

describe('validatePassword utility', () => {
  it('reports all failures for empty string', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
    expect(result.failures).toHaveLength(PASSWORD_RULES.length);
  });

  it('accepts a fully compliant password', () => {
    expect(validatePassword('MyP@ssw0rd!!xy').valid).toBe(true);
  });

  it('rejects password missing uppercase', () => {
    const result = validatePassword('myp@ssw0rd!!xy');
    expect(result.valid).toBe(false);
    expect(result.failures).toContain('One uppercase letter');
  });

  it('rejects password missing lowercase', () => {
    const result = validatePassword('MYP@SSW0RD!!XY');
    expect(result.valid).toBe(false);
    expect(result.failures).toContain('One lowercase letter');
  });

  it('rejects password missing digit', () => {
    const result = validatePassword('MyP@sswOrd!!xy');
    expect(result.valid).toBe(false);
    expect(result.failures).toContain('One number');
  });

  it('rejects password missing special character', () => {
    const result = validatePassword('MyPassw0rdAbxy');
    expect(result.valid).toBe(false);
    expect(result.failures).toContain('One special character (!@#$%…)');
  });

  it('rejects password under 12 characters', () => {
    const result = validatePassword('MyP@ss0rd!');
    expect(result.valid).toBe(false);
    expect(result.failures).toContain('At least 12 characters');
  });
});
