import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { configPath, loadConfig, saveConfig, keyEnvVar, configExists } from './config-store';

const orig = process.env.XPIA_CONFIG_PATH;
afterEach(() => {
  process.env.XPIA_CONFIG_PATH = orig;
});

describe('config-store', () => {
  it('configPath honors XPIA_CONFIG_PATH', () => {
    process.env.XPIA_CONFIG_PATH = join(tmpdir(), 'explicit.json');
    expect(configPath()).toBe(join(tmpdir(), 'explicit.json'));
  });

  it('loadConfig returns empty when the file is missing', () => {
    process.env.XPIA_CONFIG_PATH = join(tmpdir(), `nope-${Date.now()}.json`);
    expect(loadConfig()).toEqual({ providers: [], models: [], prompts: [] });
    expect(configExists()).toBe(false);
  });

  it('save then load round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xpia-cfg-'));
    process.env.XPIA_CONFIG_PATH = join(dir, 'config.json');
    saveConfig({ providers: [{ id: 'a', name: 'a', displayName: 'A', baseUrl: 'u', isEnabled: true }], models: [] });
    expect(configExists()).toBe(true);
    expect(loadConfig().providers[0].id).toBe('a');
    rmSync(dir, { recursive: true, force: true });
  });

  it('keyEnvVar produces a default and honors a custom env name', () => {
    expect(keyEnvVar({ id: 'azure-ai' })).toBe('XPIA_AZURE_AI_API_KEY');
    expect(keyEnvVar({ id: 'x', apiKeyEnv: 'MY_KEY' })).toBe('MY_KEY');
  });

  it('loadConfig tolerates a partial file (missing models)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xpia-cfg-p-'));
    process.env.XPIA_CONFIG_PATH = join(dir, 'config.json');
    writeFileSync(process.env.XPIA_CONFIG_PATH, JSON.stringify({ providers: [{ id: 'a', name: 'a', displayName: 'A', baseUrl: 'u', isEnabled: true }] }));
    expect(loadConfig().models).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('configPath falls back to the home directory', () => {
    delete process.env.XPIA_CONFIG_PATH;
    expect(configPath()).toMatch(/[\\/]\.xpia[\\/]config\.json$/);
  });
});
