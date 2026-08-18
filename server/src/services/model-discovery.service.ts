/**
 * Discover the models a provider currently offers, using the user's own key. Powers the
 * "Import from provider" model picker (Admin → Models). Azure OpenAI is unsupported — a
 * data-plane key can list base models but not the deployments you actually call, so Azure
 * models are added manually with the deployment name. For authorized use with your own key.
 */

export interface DiscoveredModel {
  modelId: string;
  displayName: string;
  maxContextTokens?: number;
  maxOutputTokens?: number;
}

/** Providers whose model list we can fetch live. */
const DISCOVERABLE = ['openai', 'xai', 'openrouter', 'google', 'anthropic'];

/** Model-id fragments that aren't chat models — hidden from the picker. */
const NON_CHAT = /embed|whisper|tts|audio|realtime|dall-?e|moderation|transcribe|rerank/i;

export function isDiscoverySupported(providerName: string): boolean {
  return DISCOVERABLE.includes(providerName);
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJson(url: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Provider returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

/**
 * List the chat-capable models for a provider using the supplied key. Throws on Azure (not
 * discoverable) or on a provider/network error.
 */
export async function listProviderModels(opts: {
  providerName: string;
  baseUrl: string;
  apiKey: string;
}): Promise<DiscoveredModel[]> {
  const base = trimBase(opts.baseUrl);
  const name = opts.providerName;

  if (name === 'azure-openai') {
    throw new Error('Azure OpenAI deployments cannot be listed automatically — add a model with your deployment name.');
  }

  if (name === 'google') {
    const data = await fetchJson(`${base}/models?key=${encodeURIComponent(opts.apiKey)}&pageSize=1000`, {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const models: any[] = data.models ?? [];
    return models
      .filter((m) => (Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods.includes('generateContent') : true))
      .map((m) => {
        const id = String(m.name || '').replace(/^models\//, '');
        return { modelId: id, displayName: m.displayName || id, maxContextTokens: m.inputTokenLimit, maxOutputTokens: m.outputTokenLimit };
      })
      .filter((m) => m.modelId && !NON_CHAT.test(m.modelId));
  }

  if (name === 'anthropic') {
    const data = await fetchJson(`${base}/v1/models?limit=100`, {
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const models: any[] = data.data ?? [];
    return models.map((m) => ({ modelId: String(m.id), displayName: m.display_name || String(m.id) }));
  }

  // openai / xai / openrouter / other OpenAI-compatible endpoints
  const data = await fetchJson(`${base}/models`, { Authorization: `Bearer ${opts.apiKey}` });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const models: any[] = data.data ?? [];
  return models
    .map((m) => ({
      modelId: String(m.id),
      displayName: m.name || String(m.id), // OpenRouter provides a friendly `name`
      maxContextTokens: m.context_length ?? m.top_provider?.context_length,
      maxOutputTokens: m.top_provider?.max_completion_tokens,
    }))
    .filter((m) => m.modelId && !NON_CHAT.test(m.modelId));
}
