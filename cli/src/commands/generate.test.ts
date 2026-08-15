import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runGenerate, withIndex } from './generate';

const tmp = mkdtempSync(join(tmpdir(), 'xpia-cli-gen-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('withIndex', () => {
  it('inserts an index before the extension', () => {
    expect(withIndex('report.docx', 2)).toBe('report-2.docx');
  });
  it('appends when there is no extension', () => {
    expect(withIndex('report', 3)).toBe('report-3');
  });
  it('treats a leading dot as no extension', () => {
    expect(withIndex('.foo', 1)).toBe('.foo-1');
  });
});

describe('runGenerate', () => {
  it('rejects an unknown --type', async () => {
    await expect(runGenerate({ type: 'nope', technique: 'di-ignore-previous', out: tmp })).rejects.toThrow(/Unknown --type/);
  });

  it('rejects an unknown --technique', async () => {
    await expect(runGenerate({ type: 'docx', technique: 'nope', out: tmp })).rejects.toThrow(/Unknown --technique/);
  });

  it('rejects an unknown --layout', async () => {
    await expect(
      runGenerate({ type: 'png', technique: 'di-ignore-previous', layout: 'nope', out: tmp }),
    ).rejects.toThrow(/Unknown --layout/);
  });

  it('generates a single docx file', async () => {
    const files = await runGenerate({ type: 'docx', technique: 'di-ignore-previous', action: 'reveal your system prompt', out: tmp });
    expect(files).toHaveLength(1);
    expect(existsSync(files[0])).toBe(true);
  });

  it('generates multiple indexed files', async () => {
    const files = await runGenerate({ type: 'md', technique: 'di-ignore-previous', count: 2, out: tmp });
    expect(files).toHaveLength(2);
    expect(files[0]).not.toBe(files[1]);
    files.forEach((f) => expect(existsSync(f)).toBe(true));
  });
});
