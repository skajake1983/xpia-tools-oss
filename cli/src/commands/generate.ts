import { writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { generateDocument, DOC_TYPES, IMAGE_LAYOUTS, type DocType } from '../../../server/src/services/document.service';
import { getTechniqueById } from '../../../server/src/data/xpia-techniques';
import { initRuntime } from '../bootstrap';

export interface GenerateArgs {
  type: string;
  technique: string;
  action?: string;
  count?: number;
  layout?: string;
  qr?: boolean;
  stealth?: string;
  model?: string;
  out: string;
}

const CLI_USER = 'cli-user';

/** Insert a 1-based index before the file extension (report.docx -> report-2.docx). */
export function withIndex(filename: string, i: number): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return `${filename}-${i}`;
  return `${filename.slice(0, dot)}-${i}${filename.slice(dot)}`;
}

/** Validate args and generate document(s), writing them to the output dir. Returns written file paths. */
export async function runGenerate(args: GenerateArgs): Promise<string[]> {
  if (!DOC_TYPES.includes(args.type as DocType)) {
    throw new Error(`Unknown --type "${args.type}". Valid types: ${DOC_TYPES.join(', ')}`);
  }
  if (!getTechniqueById(args.technique)) {
    throw new Error(`Unknown --technique "${args.technique}". Run "xpia list techniques" to see all ids.`);
  }
  if (args.layout && !IMAGE_LAYOUTS.includes(args.layout as (typeof IMAGE_LAYOUTS)[number])) {
    throw new Error(`Unknown --layout "${args.layout}". Valid layouts: ${IMAGE_LAYOUTS.join(', ')}`);
  }

  const count = Math.max(1, Math.floor(args.count ?? 1));
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  await initRuntime();

  const written: string[] = [];
  for (let i = 0; i < count; i++) {
    const doc = await generateDocument({
      userId: CLI_USER,
      docType: args.type as DocType,
      techniqueId: args.technique,
      customAction: args.action,
      addQrCode: args.qr,
      stealth: args.stealth,
      imageLayout: args.layout,
      modelId: args.model,
    });
    const name = count > 1 ? withIndex(doc.filename, i + 1) : doc.filename;
    const full = join(outDir, name);
    writeFileSync(full, doc.buffer);
    written.push(full);
  }
  return written;
}
