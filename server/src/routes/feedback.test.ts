import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

// Replicate the schema from feedback.ts for independent unit testing
const feedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'feedback']),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(320),
  correlationId: z.string().max(200).optional(),
  captchaId: z.string().uuid().optional(),
  captchaAnswer: z.string().max(20).optional(),
});

// Replicate optionalUser logic for independent unit testing
interface AuthPayload { userId: string; email: string; role: string }
const TEST_SECRET = 'test-secret-for-feedback-tests';

function optionalUser(cookies: Record<string, string | undefined>, authHeader: string | undefined): { user: AuthPayload | null; tokenExpired: boolean } {
  const tokenFromCookie = cookies?.access_token;
  const token = tokenFromCookie || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);
  if (!token) return { user: null, tokenExpired: false };
  try {
    return { user: jwt.verify(token, TEST_SECRET) as AuthPayload, tokenExpired: false };
  } catch {
    return { user: null, tokenExpired: true };
  }
}

const validBase = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
};

describe('feedback route — feedbackSchema validation', () => {
  it('accepts a valid bug report', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Login button breaks',
      description: 'When I click login with a valid password, nothing happens and the page freezes.',
      ...validBase,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid feature request', () => {
    const result = feedbackSchema.safeParse({
      type: 'feature',
      title: 'Dark mode toggle',
      description: 'It would be great to have a dark mode toggle in the settings page.',
      ...validBase,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid feedback submission', () => {
    const result = feedbackSchema.safeParse({
      type: 'feedback',
      title: 'Great tool!',
      description: 'Really enjoying the payload generator feature, very useful for testing.',
      ...validBase,
    });
    expect(result.success).toBe(true);
  });

  it('accepts feedback with correlationId', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Crash on page load',
      description: 'The documents page crashes immediately when loading with no API key configured.',
      ...validBase,
      correlationId: 'abc-123-def',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.correlationId).toBe('abc-123-def');
    }
  });

  it('accepts feedback without correlationId', () => {
    const result = feedbackSchema.safeParse({
      type: 'feedback',
      title: 'Nice UI design',
      description: 'The overall design is clean and intuitive, well done on the layout.',
      ...validBase,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.correlationId).toBeUndefined();
    }
  });

  it('rejects invalid type', () => {
    const result = feedbackSchema.safeParse({
      type: 'question',
      title: 'How do I reset?',
      description: 'I need help resetting my password but cannot find the option.',
      ...validBase,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing type', () => {
    const result = feedbackSchema.safeParse({
      title: 'Something broke',
      description: 'The settings page is not loading correctly after the update.',
      ...validBase,
    });
    expect(result.success).toBe(false);
  });

  it('rejects title shorter than 3 characters', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Hi',
      description: 'This is a detailed description of the issue I encountered.',
      ...validBase,
    });
    expect(result.success).toBe(false);
  });

  it('rejects title longer than 200 characters', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'x'.repeat(201),
      description: 'This is a detailed description of the issue I encountered.',
      ...validBase,
    });
    expect(result.success).toBe(false);
  });

  it('rejects description shorter than 10 characters', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Page crash',
      description: 'Short',
      ...validBase,
    });
    expect(result.success).toBe(false);
  });

  it('rejects description longer than 5000 characters', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Major issue found',
      description: 'x'.repeat(5001),
      ...validBase,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing title', () => {
    const result = feedbackSchema.safeParse({
      type: 'feature',
      description: 'Would be nice to have export functionality for all reports.',
      ...validBase,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing description', () => {
    const result = feedbackSchema.safeParse({
      type: 'feature',
      title: 'Export feature',
      ...validBase,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Login issue found',
      description: 'Cannot log in with my credentials after the latest update.',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing email', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Login issue found',
      description: 'Cannot log in with my credentials after the latest update.',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing firstName', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Login issue found',
      description: 'Cannot log in with my credentials after the latest update.',
      lastName: 'Doe',
      email: 'jane@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing lastName', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Login issue found',
      description: 'Cannot log in with my credentials after the latest update.',
      firstName: 'Jane',
      email: 'jane@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty firstName', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Login issue found',
      description: 'Cannot log in with my credentials after the latest update.',
      firstName: '',
      lastName: 'Doe',
      email: 'jane@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty object', () => {
    const result = feedbackSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts feedback with captcha fields', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Login issue found',
      description: 'Cannot log in with my credentials after the latest update.',
      ...validBase,
      captchaId: '550e8400-e29b-41d4-a716-446655440000',
      captchaAnswer: '42',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.captchaId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.data.captchaAnswer).toBe('42');
    }
  });

  it('rejects non-uuid captchaId', () => {
    const result = feedbackSchema.safeParse({
      type: 'bug',
      title: 'Login issue found',
      description: 'Cannot log in with my credentials after the latest update.',
      ...validBase,
      captchaId: 'not-a-uuid',
      captchaAnswer: '42',
    });
    expect(result.success).toBe(false);
  });

  it('accepts feedback without captcha fields (authenticated flow)', () => {
    const result = feedbackSchema.safeParse({
      type: 'feature',
      title: 'Add dark mode',
      description: 'It would be great to have a dark mode configuration option.',
      ...validBase,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.captchaId).toBeUndefined();
      expect(result.data.captchaAnswer).toBeUndefined();
    }
  });
});

describe('feedback route — optionalUser token detection', () => {
  const payload: AuthPayload = { userId: 'u1', email: 'test@example.com', role: 'user' };

  it('returns user when valid token is in cookie', () => {
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '15m' });
    const result = optionalUser({ access_token: token }, undefined);
    expect(result.user).not.toBeNull();
    expect(result.user!.email).toBe('test@example.com');
    expect(result.tokenExpired).toBe(false);
  });

  it('returns user when valid token is in Authorization header', () => {
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '15m' });
    const result = optionalUser({}, `Bearer ${token}`);
    expect(result.user).not.toBeNull();
    expect(result.tokenExpired).toBe(false);
  });

  it('returns tokenExpired=true for an expired token', () => {
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '-1s' });
    const result = optionalUser({ access_token: token }, undefined);
    expect(result.user).toBeNull();
    expect(result.tokenExpired).toBe(true);
  });

  it('returns tokenExpired=true for a token signed with wrong secret', () => {
    const token = jwt.sign(payload, 'wrong-secret', { expiresIn: '15m' });
    const result = optionalUser({ access_token: token }, undefined);
    expect(result.user).toBeNull();
    expect(result.tokenExpired).toBe(true);
  });

  it('returns user=null and tokenExpired=false when no token is present', () => {
    const result = optionalUser({}, undefined);
    expect(result.user).toBeNull();
    expect(result.tokenExpired).toBe(false);
  });

  it('prefers cookie over Authorization header', () => {
    const cookieToken = jwt.sign(payload, TEST_SECRET, { expiresIn: '15m' });
    const headerToken = jwt.sign({ ...payload, email: 'other@example.com' }, TEST_SECRET, { expiresIn: '15m' });
    const result = optionalUser({ access_token: cookieToken }, `Bearer ${headerToken}`);
    expect(result.user!.email).toBe('test@example.com');
  });
});
