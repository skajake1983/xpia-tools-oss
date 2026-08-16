import type { CliProvider, CliModel } from './config-store';

export interface CatalogPreset {
  key: string;
  provider: Omit<CliProvider, 'isEnabled'>;
  models: CliModel[];
  note?: string;
}

/**
 * Built-in integration presets. OpenAI-compatible providers work via the gateway's
 * baseUrl handling; Anthropic and Azure OpenAI have dedicated adapters.
 */
export const CATALOG: CatalogPreset[] = [
  {
    key: 'openai',
    provider: { id: 'openai', name: 'openai', displayName: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
    models: [
      { id: 'gpt-4o-mini', providerId: 'openai', modelId: 'gpt-4o-mini', displayName: 'GPT-4o mini', maxOutputTokens: 4096, maxContextTokens: 128000 },
    ],
  },
  {
    key: 'google',
    provider: { id: 'google', name: 'google', displayName: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    models: [
      { id: 'gemini-1.5-flash', providerId: 'google', modelId: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash', maxOutputTokens: 4096, maxContextTokens: 1000000 },
    ],
  },
  {
    key: 'xai',
    provider: { id: 'xai', name: 'xai', displayName: 'xAI Grok', baseUrl: 'https://api.x.ai/v1' },
    models: [
      { id: 'grok-2', providerId: 'xai', modelId: 'grok-2-latest', displayName: 'Grok 2', maxOutputTokens: 4096, maxContextTokens: 131072 },
    ],
  },
  {
    key: 'openrouter',
    provider: { id: 'openrouter', name: 'openrouter', displayName: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
    models: [
      { id: 'openrouter-auto', providerId: 'openrouter', modelId: 'openrouter/auto', displayName: 'OpenRouter Auto', maxOutputTokens: 4096, maxContextTokens: 128000 },
    ],
  },
  {
    key: 'ollama',
    provider: { id: 'ollama', name: 'ollama', displayName: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', keyless: true },
    models: [
      { id: 'llama3.1', providerId: 'ollama', modelId: 'llama3.1', displayName: 'Llama 3.1', maxOutputTokens: 4096, maxContextTokens: 128000 },
    ],
  },
  {
    key: 'lmstudio',
    provider: { id: 'lmstudio', name: 'lmstudio', displayName: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', keyless: true },
    models: [],
    note: 'Add a model whose modelId matches the model loaded in LM Studio.',
  },
  {
    key: 'azure-ai',
    provider: { id: 'azure-ai', name: 'azure-ai', displayName: 'Azure AI Foundry (OpenAI-compatible)', baseUrl: 'https://YOUR-RESOURCE.services.ai.azure.com/models' },
    models: [],
    note: 'Set baseUrl to your Foundry OpenAI-compatible endpoint and add your deployment as a model.',
  },
  {
    key: 'anthropic',
    provider: { id: 'anthropic', name: 'anthropic', displayName: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com/v1' },
    models: [
      { id: 'claude-sonnet-4-5', providerId: 'anthropic', modelId: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5', maxOutputTokens: 8192, maxContextTokens: 200000 },
    ],
  },
  {
    key: 'azure-openai',
    provider: { id: 'azure-openai', name: 'azure-openai', displayName: 'Azure OpenAI (native)', baseUrl: 'https://YOUR-RESOURCE.openai.azure.com' },
    models: [],
    note: 'Set baseUrl to your Azure OpenAI resource endpoint and add a model whose modelId is the deployment name. Override the REST API version with AZURE_OPENAI_API_VERSION (default 2024-10-21).',
  },
];

export function getPreset(key: string): CatalogPreset | undefined {
  return CATALOG.find((p) => p.key === key);
}

export function catalogKeys(): string[] {
  return CATALOG.map((p) => p.key);
}
