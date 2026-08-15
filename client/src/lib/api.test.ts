import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch for API tests
const mockFetch = vi.fn();
(globalThis as Record<string, unknown>).fetch = mockFetch;

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('sends credentials include for cookie-based auth', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ user: { id: '1', email: 'test@test.com', totpEnabled: false } }),
    });

    const { api } = await import('../lib/api');
    await api.auth.me();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
      }),
    );
    // No Authorization header should be set
    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers?.Authorization).toBeUndefined();
  });

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: 'Invalid credentials' }),
    });

    const { api } = await import('../lib/api');
    await expect(api.auth.login('bad@email.com', 'wrong')).rejects.toThrow('Invalid credentials');
  });

  it('attempts silent refresh on 401 for protected routes', async () => {
    // First call returns 401
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });
    // Refresh call succeeds
    mockFetch.mockResolvedValueOnce({ ok: true });
    // Retry succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ user: { id: '1', email: 'test@test.com' } }),
    });

    const { api } = await import('../lib/api');
    const result = await api.auth.me();

    expect(result).toEqual({ user: { id: '1', email: 'test@test.com' } });
    // Should have called: original request, refresh, retry
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[1][0]).toBe('/api/auth/refresh');
  });

  it('sends correct body for registration', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () =>
        Promise.resolve({
          user: { id: '1', email: 'test@test.com' },
        }),
    });

    const { api } = await import('../lib/api');
    await api.auth.register({
      email: 'test@test.com',
      password: 'password123',
      firstName: 'Jane',
      lastName: 'Doe',
      organization: 'Acme',
      jobTitle: 'Pen Tester',
      linkedinUrl: 'https://linkedin.com/in/janedoe',
      inviteCode: 'ABCD1234',
      captchaId: 'captcha-123',
      captchaAnswer: '42',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          email: 'test@test.com',
          password: 'password123',
          firstName: 'Jane',
          lastName: 'Doe',
          organization: 'Acme',
          jobTitle: 'Pen Tester',
          linkedinUrl: 'https://linkedin.com/in/janedoe',
          inviteCode: 'ABCD1234',
          captchaId: 'captcha-123',
          captchaAnswer: '42',
        }),
      }),
    );
  });
});
