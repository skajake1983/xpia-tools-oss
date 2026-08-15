import './preload';
import { Command } from 'commander';
import { runGenerate } from './commands/generate';
import { runPayloads } from './commands/payloads';
import {
  runListTechniques,
  runListTypes,
  runListLayouts,
  runListCategories,
  runListEvasions,
} from './commands/list';
import { runConfigInit, runConfigShow, runConfigPath } from './commands/config';
import {
  runProvidersList,
  runProvidersAdd,
  runProvidersEnable,
  runProvidersRemove,
} from './commands/providers';
import {
  runPromptsShow,
  runPromptsExport,
  runPromptsImport,
  runPromptsReset,
} from './commands/prompts';

/** Build the CLI program (exported for testing). */
export function buildProgram(): Command {
  const program = new Command();
  program
    .name('xpia')
    .description('XPIA Tools datagen CLI — generate XPIA test documents, images, and payloads (no web UI).')
    .version('1.0.0');

  program
    .command('generate')
    .description('Generate XPIA test document(s) or image(s)')
    .requiredOption('-t, --type <type>', 'document type (e.g. docx, pdf, png, svg)')
    .requiredOption('-k, --technique <id>', 'XPIA technique id (see: xpia list techniques)')
    .option('-a, --action <text>', 'custom injected action/instruction')
    .option('-n, --count <n>', 'number of documents to generate', (v) => parseInt(v, 10), 1)
    .option('-l, --layout <layout>', 'image layout (dashboard, report, infographic, email-preview, timeline, comparison)')
    .option('--qr', 'embed a QR code', false)
    .option('-s, --stealth <level>', 'stealth level (low, medium, high)')
    .option('-m, --model <id>', 'LLM model id to enhance content (requires provider config)')
    .option('-o, --out <dir>', 'output directory', './xpia-output')
    .action(async (opts) => {
      const files = await runGenerate(opts);
      console.log(`Generated ${files.length} file(s):`);
      for (const f of files) console.log('  ' + f);
    });

  program
    .command('payloads')
    .description('Generate XPIA prompt-injection payloads')
    .option('-c, --category <cat...>', 'payload categories (see: xpia list categories)')
    .option('-s, --severity <sev...>', 'severities: low, medium, high, critical')
    .option('-n, --count <n>', 'number of payloads', (v) => parseInt(v, 10), 5)
    .option('-f, --format <fmt>', 'output format: json or text', 'json')
    .option('-e, --evasion <id>', 'evasion modifier (see: xpia list evasions)')
    .option('--seed <n>', 'deterministic seed', (v) => parseInt(v, 10))
    .option('-a, --action <text>', 'custom target action')
    .option('-o, --out <dir>', 'write to <dir>/payloads.(json|txt) instead of stdout')
    .action(async (opts) => {
      const res = await runPayloads(opts);
      if (res.outFile) console.log(`Wrote ${res.count} payload(s) to ${res.outFile}`);
      else console.log(res.formatted);
    });

  const list = program.command('list').description('List available techniques, types, layouts, categories, evasions');
  list.command('techniques').description('List XPIA techniques').action(() => runListTechniques());
  list.command('types').description('List document types').action(() => runListTypes());
  list.command('layouts').description('List image layouts').action(() => runListLayouts());
  list.command('categories').description('List payload categories').action(() => runListCategories());
  list.command('evasions').description('List payload evasion modifiers').action(() => runListEvasions());

  const config = program.command('config').description('Manage the local CLI config (~/.xpia/config.json)');
  config.command('init').description('Create a starter config').action(() => runConfigInit());
  config.command('show').description('Print the current config').action(() => runConfigShow());
  config.command('path').description('Print the config file path').action(() => runConfigPath());

  const providers = program.command('providers').description('Configure LLM providers/integrations');
  providers.command('list').description('List configured providers').action(() => runProvidersList());
  providers
    .command('add <preset>')
    .description('Add a provider from a preset (openai, google, xai, openrouter, ollama, ...)')
    .action((preset: string) => runProvidersAdd(preset));
  providers.command('enable <id>').description('Enable a provider').action((id: string) => runProvidersEnable(id, true));
  providers.command('disable <id>').description('Disable a provider').action((id: string) => runProvidersEnable(id, false));
  providers.command('remove <id>').description('Remove a provider').action((id: string) => runProvidersRemove(id));

  const prompts = program.command('prompts').description('View and customize generation prompts (document, image, payload)');
  prompts.command('show [category]').description('Show effective prompts').action((c?: string) => runPromptsShow(c));
  prompts.command('export <dir>').description('Export prompts to editable .txt files').action((d: string) => runPromptsExport(d));
  prompts.command('import <dir>').description('Import edited prompt files as overrides').action((d: string) => runPromptsImport(d));
  prompts.command('reset [category]').description('Reset prompt override(s) to defaults').action((c?: string) => runPromptsReset(c));

  return program;
}

/* c8 ignore start -- CLI entrypoint glue, exercised via the binary rather than unit tests */
async function main(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    console.error('Error: ' + (err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  } finally {
    // The server's pino-pretty transport keeps the event loop alive; exit explicitly.
    process.exit(process.exitCode ?? 0);
  }
}

if (require.main === module) {
  void main();
}
/* c8 ignore stop */
