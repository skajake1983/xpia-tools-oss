import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runProvidersAdd, runProvidersList, runProvidersEnable, runProvidersRemove } from './providers';
import { loadConfig } from '../config-store';

let dir: string;
const orig = process.env.XPIA_CONFIG_PATH;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xpia-prov-'));
  process.env.XPIA_CONFIG_PATH = join(dir, 'config.json');
});
afterEach(() => {
  process.env.XPIA_CONFIG_PATH = orig;
  rmSync(dir, { recursive: true, force: true });
});

const noop = (): void => {};

describe('providers command', () => {
  it('adds a preset provider with its model(s)', () => {
    runProvidersAdd('openai', noop);
    const cfg = loadConfig();
    expect(cfg.providers.map((p) => p.id)).toContain('openai');
    expect(cfg.models.some((m) => m.providerId === 'openai')).toBe(true);
  });

  it('rejects an unknown preset', () => {
    expect(() => runProvidersAdd('nope', noop)).toThrow(/Unknown preset/);
  });

  it('rejects adding a duplicate provider', () => {
    runProvidersAdd('openai', noop);
    expect(() => runProvidersAdd('openai', noop)).toThrow(/already configured/);
  });

  it('enables and disables a provider', () => {
    runProvidersAdd('openai', noop);
    runProvidersEnable('openai', false, noop);
    expect(loadConfig().providers.find((p) => p.id === 'openai')?.isEnabled).toBe(false);
  });

  it('throws when enabling an unknown provider', () => {
    expect(() => runProvidersEnable('nope', true, noop)).toThrow(/not found/);
  });

  it('removes a provider and its models', () => {
    runProvidersAdd('openai', noop);
    runProvidersRemove('openai', noop);
    expect(loadConfig().providers).toHaveLength(0);
    expect(loadConfig().models).toHaveLength(0);
  });

  it('throws when removing an unknown provider', () => {
    expect(() => runProvidersRemove('nope', noop)).toThrow(/not found/);
  });

  it('lists providers (empty and populated)', () => {
    const log = vi.fn();
    runProvidersList(log);
    runProvidersAdd('openai', noop);
    runProvidersList(log);
    expect(log).toHaveBeenCalled();
  });

  it('notes when a preset needs an adapter', () => {
    const log = vi.fn();
    runProvidersAdd('anthropic', log);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/needs an adapter/));
  });
});
