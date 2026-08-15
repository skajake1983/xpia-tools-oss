import { getAvailableTechniques, DOC_TYPES, IMAGE_LAYOUTS } from '../../../server/src/services/document.service';
import { getAvailableCategories, getAvailableEvasions } from '../../../server/src/services/payload.service';

export function listTechniques(): ReturnType<typeof getAvailableTechniques> {
  return getAvailableTechniques();
}

export function listDocTypes(): string[] {
  return [...DOC_TYPES];
}

export function listLayouts(): string[] {
  return [...IMAGE_LAYOUTS];
}

export function listCategories(): ReturnType<typeof getAvailableCategories> {
  return getAvailableCategories();
}

export function listEvasions(): ReturnType<typeof getAvailableEvasions> {
  return getAvailableEvasions();
}

export function runListTechniques(log: (s: string) => void = console.log): void {
  const techniques = listTechniques();
  for (const t of techniques) {
    log(`${t.id.padEnd(28)} ${t.severity.padEnd(9)} ${t.name}`);
  }
  log(`\n${techniques.length} techniques. Use an id with:  xpia generate --technique <id> --type <type>`);
}

export function runListTypes(log: (s: string) => void = console.log): void {
  log(listDocTypes().join('\n'));
}

export function runListLayouts(log: (s: string) => void = console.log): void {
  log(listLayouts().join('\n'));
}

export function runListCategories(log: (s: string) => void = console.log): void {
  for (const c of listCategories()) {
    log(`${c.id.padEnd(24)} (${c.templateCount})  ${c.label}`);
  }
}

export function runListEvasions(log: (s: string) => void = console.log): void {
  for (const e of listEvasions()) {
    log(`${e.id.padEnd(16)} ${e.name}`);
  }
}
