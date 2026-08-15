import { describe, it, expect } from 'vitest';
import { buildProgram } from './index';

describe('buildProgram', () => {
  it('registers the expected top-level commands', () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('generate');
    expect(names).toContain('payloads');
    expect(names).toContain('list');
  });

  it('exposes list subcommands', () => {
    const program = buildProgram();
    const list = program.commands.find((c) => c.name() === 'list');
    const subs = list?.commands.map((c) => c.name()) ?? [];
    expect(subs).toEqual(expect.arrayContaining(['techniques', 'types', 'layouts', 'categories', 'evasions']));
  });

  it('runs a command action via parseAsync', async () => {
    const program = buildProgram();
    program.exitOverride();
    await program.parseAsync(['node', 'xpia', 'list', 'types']);
  });
});
