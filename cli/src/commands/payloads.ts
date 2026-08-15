import { writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { generatePayloads } from '../../../server/src/services/payload.service';
import type { XPIACategory } from '../../../server/src/data/xpia-techniques';
import { initRuntime } from '../bootstrap';

export interface PayloadArgs {
  category?: string[];
  severity?: string[];
  count?: number;
  format?: string;
  evasion?: string;
  seed?: number;
  action?: string;
  out?: string;
}

const CLI_USER = 'cli-user';
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

/** Generate payloads; write to <out>/payloads.(json|txt) when --out is given, else return for stdout. */
export async function runPayloads(args: PayloadArgs): Promise<{ formatted: string; count: number; outFile?: string }> {
  const format = (args.format ?? 'json') as 'json' | 'text';
  if (format !== 'json' && format !== 'text') {
    throw new Error(`Unknown --format "${args.format}". Valid: json, text`);
  }
  if (args.severity) {
    const bad = args.severity.filter((s) => !VALID_SEVERITIES.includes(s as (typeof VALID_SEVERITIES)[number]));
    if (bad.length) throw new Error(`Unknown --severity "${bad.join(', ')}". Valid: ${VALID_SEVERITIES.join(', ')}`);
  }
  const count = Math.max(1, Math.floor(args.count ?? 5));

  await initRuntime();

  const result = await generatePayloads({
    userId: CLI_USER,
    categories: args.category as XPIACategory[] | undefined,
    severities: args.severity as ('low' | 'medium' | 'high' | 'critical')[] | undefined,
    count,
    seed: args.seed,
    format,
    evasionModifier: args.evasion,
    customAction: args.action,
  });

  let outFile: string | undefined;
  if (args.out) {
    const outDir = resolve(args.out);
    mkdirSync(outDir, { recursive: true });
    outFile = join(outDir, format === 'json' ? 'payloads.json' : 'payloads.txt');
    writeFileSync(outFile, result.formatted, 'utf-8');
  }
  return { formatted: result.formatted, count: result.payloads.length, outFile };
}
