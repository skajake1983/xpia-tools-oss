import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runPromptsShow, runPromptsExport, runPromptsImport, runPromptsReset, effectivePrompt } from './prompts';
import { loadConfig } from '../config-store';

let dir: string;
const orig = process.env.XPIA_CONFIG_PATH;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xpia-prompts-'));
  process.env.XPIA_CONFIG_PATH = join(dir, 'config.json');
});
afterEach(() => {
  process.env.XPIA_CONFIG_PATH = orig;
  rmSync(dir, { recursive: true, force: true });
});

const noop = (): void => {};

describe('prompts command', () => {
  it('show prints default prompts', () => {
    const log = vi.fn();
    runPromptsShow(undefined, log);
    expect(log).toHaveBeenCalled();
  });

  it('show rejects an unknown category', () => {
    expect(() => runPromptsShow('nope', noop)).toThrow(/Unknown category/);
  });

  it('export writes system + user files for each category', () => {
    const files = runPromptsExport(join(dir, 'p'), noop);
    expect(files.length).toBe(6);
    files.forEach((f) => expect(existsSync(f)).toBe(true));
  });

  it('import stores overrides that effectivePrompt returns', () => {
    const exportDir = join(dir, 'p');
    runPromptsExport(exportDir, noop);
    writeFileSync(join(exportDir, 'document.system.txt'), 'CUSTOM SYSTEM', 'utf-8');
    const n = runPromptsImport(exportDir, noop);
    expect(n).toBe(3);
    expect(loadConfig().prompts?.some((p) => p.category === 'document')).toBe(true);
    expect(effectivePrompt('document').system).toBe('CUSTOM SYSTEM');
  });

  it('reset clears all overrides', () => {
    runPromptsExport(join(dir, 'p'), noop);
    runPromptsImport(join(dir, 'p'), noop);
    runPromptsReset(undefined, noop);
    expect(loadConfig().prompts).toHaveLength(0);
  });

  it('reset is a no-op when there are no overrides', () => {
    const log = vi.fn();
    runPromptsReset(undefined, log);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/No prompt overrides/));
  });

  it('reset a single category leaves the others', () => {
    runPromptsExport(join(dir, 'p'), noop);
    runPromptsImport(join(dir, 'p'), noop);
    runPromptsReset('document', noop);
    expect(loadConfig().prompts?.some((p) => p.category === 'document')).toBe(false);
    expect(loadConfig().prompts?.length).toBe(2);
  });
});
