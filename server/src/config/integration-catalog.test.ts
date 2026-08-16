import { describe, it, expect } from 'vitest';
import { INTEGRATION_CATALOG, getIntegrationPreset, presetToRecords } from './integration-catalog';

describe('integration catalog', () => {
  it('every preset has a unique key, a display name, and an http base url', () => {
    const keys = INTEGRATION_CATALOG.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of INTEGRATION_CATALOG) {
      expect(p.displayName.length).toBeGreaterThan(0);
      expect(p.baseUrl).toMatch(/^https?:\/\//);
    }
  });

  it('includes the adapter-backed providers', () => {
    for (const key of ['openai', 'anthropic', 'google', 'xai', 'azure-openai']) {
      expect(getIntegrationPreset(key)).toBeDefined();
    }
  });

  it('returns undefined for an unknown key', () => {
    expect(getIntegrationPreset('nope')).toBeUndefined();
  });

  describe('presetToRecords', () => {
    const NOW = '2026-01-01T00:00:00.000Z';

    it('maps a preset into a provider doc plus model docs with sane defaults', () => {
      const preset = getIntegrationPreset('anthropic')!;
      const { provider, models } = presetToRecords(preset, NOW);

      expect(provider).toMatchObject({
        id: 'anthropic',
        type: 'provider',
        name: 'anthropic', // gateway getAdapter() routes on provider.name
        displayName: 'Anthropic (Claude)',
        isEnabled: true,
        createdAt: NOW,
      });
      expect(provider.baseUrl).toBe(preset.baseUrl);

      expect(models).toHaveLength(preset.models.length);
      expect(models[0]).toMatchObject({
        type: 'model',
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-5',
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        supportsStreaming: true,
        isEnabled: true,
        createdAt: NOW,
      });
      expect(models[0].id).toBeTruthy();
    });

    it('gives each model a distinct id', () => {
      const preset = getIntegrationPreset('openai')!;
      const { models } = presetToRecords(preset, NOW);
      const ids = models.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('handles a preset with no default models (azure-openai)', () => {
      const preset = getIntegrationPreset('azure-openai')!;
      const { provider, models } = presetToRecords(preset, NOW);
      expect(provider.name).toBe('azure-openai');
      expect(models).toEqual([]);
    });
  });
});
