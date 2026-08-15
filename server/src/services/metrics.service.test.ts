import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRepositories } from '../db/repositories';
import { setRepos } from '../db/repos';
import type { MetricsDoc } from '../db/repositories/types';
import {
  recordPageCreated,
  recordDocumentGenerated,
  recordPayloadsGenerated,
  recordTokenUsage,
  recordCustomAction,
  recordNewUser,
  getMetrics,
} from './metrics.service';

// Silence logger in tests
vi.mock('../logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

describe('metrics.service', () => {
  let mocks: ReturnType<typeof createMockRepositories>;

  beforeEach(() => {
    mocks = createMockRepositories();
    setRepos(mocks);
  });

  /** Wait for fire-and-forget promises to flush */
  const flush = () => new Promise((r) => setTimeout(r, 50));

  it('starts with zero counters', async () => {
    const m = await getMetrics();
    expect(m.totalPages).toBe(0);
    expect(m.totalDocuments).toBe(0);
    expect(m.totalPayloads).toBe(0);
    expect(m.totalTokensIn).toBe(0);
    expect(m.totalTokensOut).toBe(0);
    expect(m.totalQrCodes).toBe(0);
    expect(m.totalImages).toBe(0);
    expect(m.totalCustomActions).toBe(0);
    expect(m.documentsByType).toEqual({});
    expect(m.payloadsByFormat).toEqual({});
    expect(m.monthly).toEqual({});
  });

  it('recordPageCreated increments totalPages', async () => {
    recordPageCreated();
    await flush();
    const m = await getMetrics();
    expect(m.totalPages).toBe(1);

    recordPageCreated();
    recordPageCreated();
    await flush();
    const m2 = await getMetrics();
    expect(m2.totalPages).toBe(3);
  });

  it('recordDocumentGenerated increments totalDocuments and per-type', async () => {
    recordDocumentGenerated('docx');
    await flush();
    recordDocumentGenerated('pdf');
    await flush();
    recordDocumentGenerated('docx');
    await flush();

    const m = await getMetrics();
    expect(m.totalDocuments).toBe(3);
    expect(m.documentsByType).toEqual({ docx: 2, pdf: 1 });
  });

  it('recordPayloadsGenerated increments totalPayloads and per-format', async () => {
    recordPayloadsGenerated(5, 'json');
    await flush();
    recordPayloadsGenerated(3, 'text');
    await flush();
    recordPayloadsGenerated(2, 'json');
    await flush();

    const m = await getMetrics();
    expect(m.totalPayloads).toBe(10);
    expect(m.payloadsByFormat).toEqual({ json: 7, text: 3 });
  });

  it('sets updatedAt on every save', async () => {
    recordPageCreated();
    await flush();
    const m = await getMetrics();
    expect(m.updatedAt).toBeTruthy();
    expect(new Date(m.updatedAt).getTime()).toBeGreaterThan(0);
  });

  it('survives concurrent increments without losing data', async () => {
    // Fire several increments before any resolves
    recordPageCreated();
    await flush();
    recordDocumentGenerated('htm');
    await flush();
    recordPayloadsGenerated(10, 'json');
    await flush();

    const m = await getMetrics();
    expect(m.totalPages).toBe(1);
    expect(m.totalDocuments).toBe(1);
    expect(m.totalPayloads).toBe(10);
  });

  // ── New recording functions ──

  it('recordTokenUsage increments all-time and monthly tokens and tracks active user', async () => {
    recordTokenUsage(100, 50, 'user-a');
    await flush();
    recordTokenUsage(200, 80, 'user-b');
    await flush();
    recordTokenUsage(50, 20, 'user-a'); // duplicate user
    await flush();

    const m = await getMetrics();
    expect(m.totalTokensIn).toBe(350);
    expect(m.totalTokensOut).toBe(150);

    const key = Object.keys(m.monthly)[0];
    expect(key).toBeTruthy();
    const mo = m.monthly[key];
    expect(mo.tokensIn).toBe(350);
    expect(mo.tokensOut).toBe(150);
    expect(mo.activeUserIds).toContain('user-a');
    expect(mo.activeUserIds).toContain('user-b');
    expect(mo.activeUserIds).toHaveLength(2); // no duplicates
  });

  it('recordCustomAction increments all-time and monthly', async () => {
    recordCustomAction();
    await flush();
    recordCustomAction();
    await flush();

    const m = await getMetrics();
    expect(m.totalCustomActions).toBe(2);

    const key = Object.keys(m.monthly)[0];
    expect(m.monthly[key].customActions).toBe(2);
  });

  it('recordNewUser increments monthly newUsers', async () => {
    recordNewUser();
    await flush();
    recordNewUser();
    await flush();

    const m = await getMetrics();
    const key = Object.keys(m.monthly)[0];
    expect(m.monthly[key].newUsers).toBe(2);
  });

  it('recordDocumentGenerated tracks images (png/svg) separately', async () => {
    recordDocumentGenerated('png');
    await flush();
    recordDocumentGenerated('svg');
    await flush();
    recordDocumentGenerated('docx');
    await flush();

    const m = await getMetrics();
    expect(m.totalDocuments).toBe(3);
    expect(m.totalImages).toBe(2);

    const key = Object.keys(m.monthly)[0];
    expect(m.monthly[key].images).toBe(2);
    expect(m.monthly[key].documents).toBe(1);
  });

  it('recordDocumentGenerated tracks QR codes separately', async () => {
    recordDocumentGenerated('qr');
    await flush();

    const m = await getMetrics();
    expect(m.totalDocuments).toBe(1);
    expect(m.totalQrCodes).toBe(1);

    const key = Object.keys(m.monthly)[0];
    expect(m.monthly[key].qrCodes).toBe(1);
  });

  it('recordPageCreated increments monthly webPages', async () => {
    recordPageCreated();
    await flush();

    const m = await getMetrics();
    const key = Object.keys(m.monthly)[0];
    expect(m.monthly[key].webPages).toBe(1);
  });

  it('recordPayloadsGenerated increments monthly payloads', async () => {
    recordPayloadsGenerated(7, 'json');
    await flush();

    const m = await getMetrics();
    const key = Object.keys(m.monthly)[0];
    expect(m.monthly[key].payloads).toBe(7);
  });
});
