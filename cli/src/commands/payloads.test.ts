import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runPayloads } from './payloads';

const tmp = mkdtempSync(join(tmpdir(), 'xpia-cli-pl-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('runPayloads', () => {
  it('rejects an unknown --format', async () => {
    await expect(runPayloads({ format: 'xml' })).rejects.toThrow(/Unknown --format/);
  });

  it('rejects an unknown --severity', async () => {
    await expect(runPayloads({ severity: ['spicy'] })).rejects.toThrow(/Unknown --severity/);
  });

  it('returns formatted JSON for stdout when no --out', async () => {
    const res = await runPayloads({ count: 3, format: 'json', seed: 1 });
    expect(res.count).toBeGreaterThan(0);
    expect(res.outFile).toBeUndefined();
    expect(() => JSON.parse(res.formatted)).not.toThrow();
  });

  it('writes a text file when --out is given', async () => {
    const res = await runPayloads({ count: 2, format: 'text', out: tmp });
    expect(res.outFile).toBeDefined();
    expect(existsSync(res.outFile as string)).toBe(true);
    expect(readFileSync(res.outFile as string, 'utf-8').length).toBeGreaterThan(0);
  });

  it('defaults to json format when none is given', async () => {
    const res = await runPayloads({ count: 1 });
    expect(() => JSON.parse(res.formatted)).not.toThrow();
  });

  it('writes a json file when --out with json format', async () => {
    const res = await runPayloads({ count: 1, format: 'json', out: tmp });
    expect(res.outFile?.endsWith('payloads.json')).toBe(true);
    expect(existsSync(res.outFile as string)).toBe(true);
  });
});
