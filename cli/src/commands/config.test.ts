import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runConfigInit, runConfigShow, runConfigPath } from './config';

let dir: string;
const orig = process.env.XPIA_CONFIG_PATH;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xpia-cfg-cmd-'));
  process.env.XPIA_CONFIG_PATH = join(dir, 'config.json');
});
afterEach(() => {
  process.env.XPIA_CONFIG_PATH = orig;
  rmSync(dir, { recursive: true, force: true });
});

const noop = (): void => {};

describe('config command', () => {
  it('init creates the config file', () => {
    const p = runConfigInit(noop);
    expect(existsSync(p)).toBe(true);
  });

  it('init is idempotent', () => {
    runConfigInit(noop);
    const log = vi.fn();
    runConfigInit(log);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/already exists/));
  });

  it('show prints the config', () => {
    runConfigInit(noop);
    const log = vi.fn();
    runConfigShow(log);
    expect(log).toHaveBeenCalled();
  });

  it('path prints the config path', () => {
    const log = vi.fn();
    runConfigPath(log);
    expect(log).toHaveBeenCalledWith(process.env.XPIA_CONFIG_PATH);
  });
});
