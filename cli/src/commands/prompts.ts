import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { loadConfig, saveConfig, type CliPromptOverride } from '../config-store';
import { DEFAULT_PROMPTS, CLI_PROMPT_CATEGORIES, isCliPromptCategory, type CliPromptCategory } from '../prompts-defaults';

/** Effective prompts for a category: a local override if set, otherwise the code default. */
export function effectivePrompt(category: CliPromptCategory): { system: string; user: string } {
  const override = (loadConfig().prompts ?? []).find((p) => p.category === category);
  if (override) return { system: override.systemPrompt, user: override.userPrompt };
  return DEFAULT_PROMPTS[category];
}

export function runPromptsShow(category: string | undefined, log: (s: string) => void = console.log): void {
  const categories = category ? [category] : CLI_PROMPT_CATEGORIES;
  for (const c of categories) {
    if (!isCliPromptCategory(c)) {
      throw new Error(`Unknown category "${c}". Valid: ${CLI_PROMPT_CATEGORIES.join(', ')}`);
    }
    const p = effectivePrompt(c);
    log(`# ${c} — system\n${p.system}\n`);
    log(`# ${c} — user\n${p.user}\n`);
  }
}

export function runPromptsExport(dir: string, log: (s: string) => void = console.log): string[] {
  const out = resolve(dir);
  mkdirSync(out, { recursive: true });
  const written: string[] = [];
  for (const c of CLI_PROMPT_CATEGORIES) {
    const p = effectivePrompt(c);
    const sysFile = join(out, `${c}.system.txt`);
    const userFile = join(out, `${c}.user.txt`);
    writeFileSync(sysFile, p.system, 'utf-8');
    writeFileSync(userFile, p.user, 'utf-8');
    written.push(sysFile, userFile);
  }
  log(`Exported ${written.length} prompt file(s) to ${out}. Edit them, then run: xpia prompts import ${dir}`);
  return written;
}

export function runPromptsImport(dir: string, log: (s: string) => void = console.log): number {
  const src = resolve(dir);
  const cfg = loadConfig();
  const overrides: CliPromptOverride[] = [...(cfg.prompts ?? [])];
  let count = 0;
  for (const c of CLI_PROMPT_CATEGORIES) {
    const sysFile = join(src, `${c}.system.txt`);
    const userFile = join(src, `${c}.user.txt`);
    if (existsSync(sysFile) && existsSync(userFile)) {
      const entry: CliPromptOverride = {
        category: c,
        systemPrompt: readFileSync(sysFile, 'utf-8'),
        userPrompt: readFileSync(userFile, 'utf-8'),
      };
      const idx = overrides.findIndex((o) => o.category === c);
      if (idx >= 0) overrides[idx] = entry;
      else overrides.push(entry);
      count++;
    }
  }
  cfg.prompts = overrides;
  saveConfig(cfg);
  log(`Imported ${count} prompt override(s); they apply when generating with --model.`);
  return count;
}

export function runPromptsReset(category: string | undefined, log: (s: string) => void = console.log): void {
  const cfg = loadConfig();
  if (!cfg.prompts?.length) {
    log('No prompt overrides to reset.');
    return;
  }
  cfg.prompts = category ? cfg.prompts.filter((p) => p.category !== category) : [];
  saveConfig(cfg);
  log(category ? `Reset "${category}" prompt to default.` : 'Reset all prompts to defaults.');
}
