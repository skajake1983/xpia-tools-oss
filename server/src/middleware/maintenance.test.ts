import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { setRepos, getRepos } from '../db/repos';
import { createMockRepositories } from '../db/repositories';
import { config } from '../config';
import { maintenanceMiddleware } from './maintenance';
import { setMaintenanceMode, checkAndExpireMaintenance, isMaintenanceMode, getMaintenanceEndsAt } from '../services/settings.service';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    path: '/api/documents',
    headers: {},
    cookies: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response & { _status: number; _body: unknown } {
  const res = {
    _status: 0,
    _body: undefined,
    status(code: number) { res._status = code; return res; },
    json(body: unknown) { res._body = body; return res; },
  } as unknown as Response & { _status: number; _body: unknown };
  return res;
}

describe('maintenanceMiddleware', () => {
  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    setRepos(createMockRepositories());
  });

  it('calls next() when maintenance is disabled', async () => {
    const req = mockReq();
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(0);
  });

  it('returns 503 for regular requests when maintenance is enabled', async () => {
    await setMaintenanceMode(true, 'admin-1', 'Upgrading');
    const req = mockReq();
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(503);
    expect(res._body).toEqual({ error: 'maintenance', message: 'Upgrading' });
  });

  it('always allows /api/health through', async () => {
    await setMaintenanceMode(true, 'admin-1');
    const req = mockReq({ path: '/api/health' });
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows login auth routes through during maintenance', async () => {
    await setMaintenanceMode(true, 'admin-1');
    for (const path of ['/api/auth/login', '/api/auth/verify-2fa', '/api/auth/refresh']) {
      vi.clearAllMocks();
      const req = mockReq({ path });
      const res = mockRes();
      await maintenanceMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();
    }
  });

  it('blocks non-login auth routes during maintenance', async () => {
    await setMaintenanceMode(true, 'admin-1');
    for (const path of ['/api/auth/register', '/api/auth/captcha', '/api/auth/forgot-password', '/api/auth/reset-password']) {
      vi.clearAllMocks();
      const req = mockReq({ path });
      const res = mockRes();
      await maintenanceMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(503);
    }
  });

  it('allows admin users through via cookie token', async () => {
    await setMaintenanceMode(true, 'admin-1');

    // Create an admin user in the mock repo
    const repos = getRepos();
    const adminUser = {
      id: 'admin-user-1',
      email: 'admin@test.com',
      passwordHash: 'hash',
      isAdmin: true,
      isSuperadmin: false,
      emailVerified: true,
      totpEnabled: false,
      totpSecret: null,
      forcePasswordChange: false,
      canGenerateInvites: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      firstName: 'Admin',
      lastName: 'User',
      organization: null,
      jobTitle: null,
      linkedinUrl: null,
      limits: { dailyTokenLimit: 500000, isSuspended: false, updatedBy: null },
      termsAcceptedAt: null,
    };
    await repos.users.create(adminUser);

    const token = jwt.sign({ userId: 'admin-user-1' }, config.jwt.secret);
    const req = mockReq({ cookies: { access_token: token } });
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks non-admin users even with valid token', async () => {
    await setMaintenanceMode(true, 'admin-1', 'Down for maintenance');

    const repos = getRepos();
    const regularUser = {
      id: 'user-1',
      email: 'user@test.com',
      passwordHash: 'hash',
      isAdmin: false,
      isSuperadmin: false,
      emailVerified: true,
      totpEnabled: false,
      totpSecret: null,
      forcePasswordChange: false,
      canGenerateInvites: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      firstName: 'Regular',
      lastName: 'User',
      organization: null,
      jobTitle: null,
      linkedinUrl: null,
      limits: { dailyTokenLimit: 500000, isSuspended: false, updatedBy: null },
      termsAcceptedAt: null,
    };
    await repos.users.create(regularUser);

    const token = jwt.sign({ userId: 'user-1' }, config.jwt.secret);
    const req = mockReq({ cookies: { access_token: token } });
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(503);
  });

  it('uses default message when none is set', async () => {
    await setMaintenanceMode(true, 'admin-1');
    const req = mockReq();
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    expect(res._status).toBe(503);
    expect((res._body as { message: string }).message).toContain('scheduled maintenance');
  });

  it('passes through non-API requests so the SPA can render', async () => {
    await setMaintenanceMode(true, 'admin-1');
    const req = mockReq({ path: '/login' });
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(0);
  });

  it('passes through static asset requests during maintenance', async () => {
    await setMaintenanceMode(true, 'admin-1');
    const req = mockReq({ path: '/assets/index-abc123.js' });
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('includes endsAt in the 503 response when set', async () => {
    const endsAt = new Date(Date.now() + 30 * 60_000).toISOString();
    await setMaintenanceMode(true, 'admin-1', 'Upgrading', endsAt);
    const req = mockReq();
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    expect(res._status).toBe(503);
    expect((res._body as { endsAt: string }).endsAt).toBe(endsAt);
  });

  it('omits endsAt from 503 response when not set', async () => {
    await setMaintenanceMode(true, 'admin-1', 'Quick fix');
    const req = mockReq();
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    expect(res._status).toBe(503);
    expect((res._body as Record<string, unknown>).endsAt).toBeUndefined();
  });

  it('auto-expires maintenance when endsAt is in the past', async () => {
    const pastTime = new Date(Date.now() - 60_000).toISOString();
    await setMaintenanceMode(true, 'admin-1', 'Deploy', pastTime);
    const req = mockReq();
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    // Should pass through because maintenance auto-expired
    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(0);
    // Verify it's actually disabled now
    const stillActive = await isMaintenanceMode();
    expect(stillActive).toBe(false);
  });

  it('does not auto-expire when endsAt is in the future', async () => {
    const futureTime = new Date(Date.now() + 60 * 60_000).toISOString();
    await setMaintenanceMode(true, 'admin-1', 'Long outage', futureTime);
    const req = mockReq();
    const res = mockRes();
    await maintenanceMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(503);
    const stillActive = await isMaintenanceMode();
    expect(stillActive).toBe(true);
  });
});

describe('checkAndExpireMaintenance', () => {
  beforeEach(() => {
    setRepos(createMockRepositories());
  });

  it('returns false when maintenance is disabled', async () => {
    expect(await checkAndExpireMaintenance()).toBe(false);
  });

  it('returns true when enabled with no endsAt', async () => {
    await setMaintenanceMode(true, 'admin-1');
    expect(await checkAndExpireMaintenance()).toBe(true);
  });

  it('returns true when enabled with future endsAt', async () => {
    await setMaintenanceMode(true, 'admin-1', '', new Date(Date.now() + 30 * 60_000).toISOString());
    expect(await checkAndExpireMaintenance()).toBe(true);
  });

  it('returns false and disables when endsAt has passed', async () => {
    await setMaintenanceMode(true, 'admin-1', '', new Date(Date.now() - 1000).toISOString());
    expect(await checkAndExpireMaintenance()).toBe(false);
    expect(await isMaintenanceMode()).toBe(false);
    expect(await getMaintenanceEndsAt()).toBe('');
  });
});
