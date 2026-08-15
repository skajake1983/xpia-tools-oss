import { describe, it, expect } from 'vitest';
import { config } from '../../config';

describe('Config - LLM Settings', () => {
  it('has encryption key of correct length (64 hex chars = 32 bytes)', () => {
    expect(config.encryptionKey).toBeDefined();
    expect(config.encryptionKey).toHaveLength(64);
    expect(/^[0-9a-f]+$/i.test(config.encryptionKey)).toBe(true);
  });

  it('has sensible default limits', () => {
    expect(config.defaultLimits.dailyTokenLimit).toBeGreaterThan(0);
  });

  it('has max LLM input length set', () => {
    expect(config.maxLlmInputLength).toBeGreaterThan(0);
    expect(config.maxLlmInputLength).toBeLessThanOrEqual(200000);
  });
});
