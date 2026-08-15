import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { correlationIdMiddleware } from './correlationId';

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockRes(): Response {
  const res = { setHeader: vi.fn() } as unknown as Response;
  return res;
}

describe('correlationIdMiddleware', () => {
  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a UUID v4 when no header is present', () => {
    const req = mockReq();
    const res = mockRes();

    correlationIdMiddleware(req, res, next);

    const id = (req as Record<string, unknown>).correlationId as string;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', id);
    expect(next).toHaveBeenCalled();
  });

  it('uses the incoming X-Correlation-Id when it is a valid UUID v4', () => {
    const incomingId = '550e8400-e29b-41d4-a716-446655440000';
    const req = mockReq({ 'x-correlation-id': incomingId });
    const res = mockRes();

    correlationIdMiddleware(req, res, next);

    expect((req as Record<string, unknown>).correlationId).toBe(incomingId);
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', incomingId);
  });

  it('ignores a malformed X-Correlation-Id and generates a new one', () => {
    const req = mockReq({ 'x-correlation-id': 'not-a-uuid' });
    const res = mockRes();

    correlationIdMiddleware(req, res, next);

    const id = (req as Record<string, unknown>).correlationId as string;
    expect(id).not.toBe('not-a-uuid');
    expect(id).toMatch(/^[0-9a-f]{8}-/);
  });

  it('ignores an empty X-Correlation-Id header', () => {
    const req = mockReq({ 'x-correlation-id': '' });
    const res = mockRes();

    correlationIdMiddleware(req, res, next);

    const id = (req as Record<string, unknown>).correlationId as string;
    expect(id).toMatch(/^[0-9a-f]{8}-/);
  });

  it('always calls next()', () => {
    correlationIdMiddleware(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
