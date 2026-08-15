import { describe, it, expect } from 'vitest';
import { initRuntime, resetRuntime, getRepos } from './bootstrap';

describe('bootstrap', () => {
  it('wires repos, is idempotent, and resets', async () => {
    resetRuntime();
    await initRuntime();
    expect(() => getRepos()).not.toThrow();
    await initRuntime(); // idempotent — no throw, no re-seed
    resetRuntime();
    await initRuntime(); // re-initialises after reset
    expect(getRepos()).toBeDefined();
  });
});
