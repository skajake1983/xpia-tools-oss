import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRepositories } from '../db/repositories';
import { setRepos } from '../db/repos';
import { logAudit, getAuditLogs } from './audit.service';

// Silence logger in tests
vi.mock('../logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

describe('audit.service', () => {
  let mocks: ReturnType<typeof createMockRepositories>;

  beforeEach(() => {
    mocks = createMockRepositories();
    setRepos(mocks);
  });

  /** Wait for fire-and-forget promises to flush */
  const flush = () => new Promise((r) => setTimeout(r, 50));

  it('returns empty results when no audit logs exist', async () => {
    const result = await getAuditLogs();
    expect(result.logs).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.page).toBe(0);
    expect(result.pageSize).toBe(20);
  });

  it('logAudit creates an audit log entry', async () => {
    logAudit({
      action: 'user_suspended',
      actorId: 'admin-1',
      actorEmail: 'admin@test.com',
      targetType: 'user',
      targetId: 'user-1',
      targetLabel: 'user@test.com',
      detail: 'Suspended user "user@test.com"',
    });
    await flush();

    const result = await getAuditLogs();
    expect(result.logs).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.logs[0].action).toBe('user_suspended');
    expect(result.logs[0].actorEmail).toBe('admin@test.com');
    expect(result.logs[0].targetLabel).toBe('user@test.com');
    expect(result.logs[0].type).toBe('audit_log');
    expect(result.logs[0].createdAt).toBeTruthy();
    expect(result.logs[0].ttl).toBe(90 * 24 * 60 * 60);
  });

  it('returns logs in reverse chronological order', async () => {
    logAudit({
      action: 'user_suspended',
      actorId: 'admin-1',
      actorEmail: 'admin@test.com',
      targetType: 'user',
      targetId: 'user-1',
      targetLabel: 'first@test.com',
      detail: 'First action',
    });
    await flush();

    logAudit({
      action: 'user_deleted',
      actorId: 'admin-1',
      actorEmail: 'admin@test.com',
      targetType: 'user',
      targetId: 'user-2',
      targetLabel: 'second@test.com',
      detail: 'Second action',
    });
    await flush();

    const result = await getAuditLogs();
    expect(result.logs).toHaveLength(2);
    expect(result.logs[0].action).toBe('user_deleted');
    expect(result.logs[1].action).toBe('user_suspended');
  });

  it('supports search filtering by actorEmail', async () => {
    logAudit({
      action: 'user_suspended',
      actorId: 'admin-1',
      actorEmail: 'alice@test.com',
      targetType: 'user',
      targetId: 'user-1',
      targetLabel: 'target@test.com',
      detail: 'Alice suspended a user',
    });
    logAudit({
      action: 'model_created',
      actorId: 'admin-2',
      actorEmail: 'bob@test.com',
      targetType: 'model',
      targetId: 'model-1',
      targetLabel: 'GPT-4o',
      detail: 'Bob created a model',
    });
    await flush();

    const result = await getAuditLogs({ search: 'alice' });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].actorEmail).toBe('alice@test.com');
    expect(result.total).toBe(1);
  });

  it('supports search filtering by action', async () => {
    logAudit({
      action: 'provider_enabled',
      actorId: 'admin-1',
      actorEmail: 'admin@test.com',
      targetType: 'provider',
      targetId: 'p-1',
      targetLabel: 'OpenAI',
      detail: 'Enabled OpenAI',
    });
    logAudit({
      action: 'user_deleted',
      actorId: 'admin-1',
      actorEmail: 'admin@test.com',
      targetType: 'user',
      targetId: 'u-1',
      targetLabel: 'user@test.com',
      detail: 'Deleted user',
    });
    await flush();

    const result = await getAuditLogs({ search: 'deleted' });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].action).toBe('user_deleted');
  });

  it('supports search filtering by targetLabel', async () => {
    logAudit({
      action: 'model_created',
      actorId: 'admin-1',
      actorEmail: 'admin@test.com',
      targetType: 'model',
      targetId: 'm-1',
      targetLabel: 'GPT-4o',
      detail: 'Created GPT-4o',
    });
    logAudit({
      action: 'model_created',
      actorId: 'admin-1',
      actorEmail: 'admin@test.com',
      targetType: 'model',
      targetId: 'm-2',
      targetLabel: 'Gemini Pro',
      detail: 'Created Gemini Pro',
    });
    await flush();

    const result = await getAuditLogs({ search: 'gemini' });
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].targetLabel).toBe('Gemini Pro');
  });

  it('supports pagination', async () => {
    // Create 25 entries
    for (let i = 0; i < 25; i++) {
      logAudit({
        action: 'user_suspended',
        actorId: 'admin-1',
        actorEmail: 'admin@test.com',
        targetType: 'user',
        targetId: `user-${i}`,
        targetLabel: `user${i}@test.com`,
        detail: `Entry ${i}`,
      });
    }
    await flush();

    const page0 = await getAuditLogs({ page: 0, pageSize: 20 });
    expect(page0.logs).toHaveLength(20);
    expect(page0.total).toBe(25);
    expect(page0.page).toBe(0);

    const page1 = await getAuditLogs({ page: 1, pageSize: 20 });
    expect(page1.logs).toHaveLength(5);
    expect(page1.total).toBe(25);
    expect(page1.page).toBe(1);
  });

  it('search is case-insensitive', async () => {
    logAudit({
      action: 'setting_changed',
      actorId: 'admin-1',
      actorEmail: 'Admin@Test.com',
      targetType: 'setting',
      targetId: 'maintenanceMode',
      targetLabel: 'Maintenance Mode',
      detail: 'Enabled maintenance mode',
    });
    await flush();

    const result = await getAuditLogs({ search: 'ADMIN@TEST' });
    expect(result.logs).toHaveLength(1);
  });

  it('each log entry gets a unique id', async () => {
    logAudit({
      action: 'user_suspended',
      actorId: 'admin-1',
      actorEmail: 'admin@test.com',
      targetType: 'user',
      targetId: 'user-1',
      targetLabel: 'user@test.com',
      detail: 'First',
    });
    logAudit({
      action: 'user_suspended',
      actorId: 'admin-1',
      actorEmail: 'admin@test.com',
      targetType: 'user',
      targetId: 'user-1',
      targetLabel: 'user@test.com',
      detail: 'Second',
    });
    await flush();

    const result = await getAuditLogs();
    expect(result.logs).toHaveLength(2);
    expect(result.logs[0].id).not.toBe(result.logs[1].id);
  });
});
