import { describe, it, expect } from 'vitest';
import { CATALOG, getPreset, catalogKeys } from './catalog';

describe('catalog', () => {
  it('exposes openai and google presets', () => {
    expect(getPreset('openai')).toBeDefined();
    expect(getPreset('google')?.provider.name).toBe('google');
  });

  it('returns undefined for an unknown preset', () => {
    expect(getPreset('nope')).toBeUndefined();
  });

  it('catalogKeys lists every preset', () => {
    expect(catalogKeys()).toEqual(CATALOG.map((c) => c.key));
    expect(catalogKeys()).toContain('anthropic');
  });

  it('marks adapter-dependent presets', () => {
    expect(getPreset('anthropic')?.needsAdapter).toBe(true);
    expect(getPreset('azure-openai')?.needsAdapter).toBe(true);
  });

  it('marks local providers keyless', () => {
    expect(getPreset('ollama')?.provider.keyless).toBe(true);
    expect(getPreset('lmstudio')?.provider.keyless).toBe(true);
  });
});
