import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('telemetry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not throw when APPLICATIONINSIGHTS_CONNECTION_STRING is not set', async () => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
    await expect(import('../telemetry')).resolves.toBeDefined();
  });
});
