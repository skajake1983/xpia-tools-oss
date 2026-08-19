/**
 * Integration catalog — presets an admin can install from the Admin Console
 * with one click. Each preset expands into one provider record plus its default
 * model(s). Model prices default to 0; the admin sets them afterwards on the
 * Models tab, and adds the API key in Settings.
 *
 * The provider `key` doubles as the provider id AND name — and `name` is what the
 * gateway's getAdapter() switch routes on (see services/llm/gateway.ts). Keep the
 * keys here in sync with that switch.
 *
 * This is the web equivalent of the CLI's integration catalog (cli/src/catalog.ts);
 * the two are intentionally separate because the CLI persists to an on-disk config
 * with env-var keys while the web app writes provider/model docs to the config repo.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ProviderDoc, ModelDoc } from '../db/repositories/types';

export interface IntegrationModelPreset {
  modelId: string;
  displayName: string;
  maxContextTokens: number;
  maxOutputTokens: number;
}

export interface IntegrationPreset {
  /** Catalog key — also the provider id/name and the gateway adapter key. */
  key: string;
  displayName: string;
  baseUrl: string;
  models: IntegrationModelPreset[];
  /** Optional setup guidance shown next to the preset in the picker. */
  note?: string;
}

export const INTEGRATION_CATALOG: IntegrationPreset[] = [
  {
    key: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [{ modelId: 'gpt-4o-mini', displayName: 'GPT-4o mini', maxContextTokens: 128000, maxOutputTokens: 4096 }],
  },
  {
    key: 'anthropic',
    displayName: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [{ modelId: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5', maxContextTokens: 200000, maxOutputTokens: 8192 }],
  },
  {
    key: 'google',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [{ modelId: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', maxContextTokens: 1000000, maxOutputTokens: 4096 }],
  },
  {
    key: 'xai',
    displayName: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    models: [{ modelId: 'grok-2-latest', displayName: 'Grok 2', maxContextTokens: 131072, maxOutputTokens: 4096 }],
  },
  {
    key: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [{ modelId: 'openrouter/auto', displayName: 'OpenRouter Auto', maxContextTokens: 128000, maxOutputTokens: 4096 }],
  },
  {
    key: 'azure-openai',
    displayName: 'Azure OpenAI (native)',
    baseUrl: 'https://YOUR-RESOURCE.openai.azure.com',
    models: [],
    note: 'After adding, open Settings → API Keys, add your Azure OpenAI key, and enter your resource endpoint (and optional API version) right there. Then add a model on the Models tab whose model ID is your deployment name.',
  },
];

export function getIntegrationPreset(key: string): IntegrationPreset | undefined {
  return INTEGRATION_CATALOG.find((p) => p.key === key);
}

/**
 * Expand a preset into the provider + model docs to persist. Pure: the caller
 * writes the provider via config.upsert() and each model via config.createModel().
 * Prices default to 0 (edited later on the Models tab), matching the CLI seed flow.
 */
export function presetToRecords(preset: IntegrationPreset, now: string): { provider: ProviderDoc; models: ModelDoc[] } {
  const provider: ProviderDoc = {
    id: preset.key,
    type: 'provider',
    name: preset.key,
    displayName: preset.displayName,
    baseUrl: preset.baseUrl,
    isEnabled: true,
    createdAt: now,
  };

  const models: ModelDoc[] = preset.models.map((m) => ({
    id: uuidv4(),
    type: 'model',
    providerId: preset.key,
    modelId: m.modelId,
    displayName: m.displayName,
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    maxContextTokens: m.maxContextTokens,
    maxOutputTokens: m.maxOutputTokens,
    supportsStreaming: true,
    isEnabled: true,
    createdAt: now,
  }));

  return { provider, models };
}
