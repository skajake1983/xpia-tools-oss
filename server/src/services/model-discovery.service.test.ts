import { describe, it, expect, vi, afterEach } from 'vitest';
import { listProviderModels, isDiscoverySupported } from './model-discovery.service';

const originalFetch = global.fetch;

function mockFetch(json: unknown, ok = true, status = 200) {
  global.fetch = vi.fn(async () => ({
    ok,
    status,
    json: async () => json,
    text: async () => JSON.stringify(json),
  })) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('isDiscoverySupported', () => {
  it('supports OpenAI-compatible + google + anthropic, not azure', () => {
    for (const p of ['openai', 'xai', 'openrouter', 'google', 'anthropic']) {
      expect(isDiscoverySupported(p)).toBe(true);
    }
    expect(isDiscoverySupported('azure-openai')).toBe(false);
  });
});

describe('listProviderModels', () => {
  it('parses OpenAI-style /models and hides non-chat models', async () => {
    mockFetch({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: 'text-embedding-3-small' }, { id: 'whisper-1' }] });
    const ids = (await listProviderModels({ providerName: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'k' })).map((m) => m.modelId);
    expect(ids).toContain('gpt-4o');
    expect(ids).toContain('gpt-4o-mini');
    expect(ids).not.toContain('text-embedding-3-small');
    expect(ids).not.toContain('whisper-1');
  });

  it('parses OpenRouter metadata (name + context + max output)', async () => {
    mockFetch({ data: [{ id: 'anthropic/claude-3.5', name: 'Claude 3.5', context_length: 200000, top_provider: { max_completion_tokens: 8192 } }] });
    const [m] = await listProviderModels({ providerName: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'k' });
    expect(m.modelId).toBe('anthropic/claude-3.5');
    expect(m.displayName).toBe('Claude 3.5');
    expect(m.maxContextTokens).toBe(200000);
    expect(m.maxOutputTokens).toBe(8192);
  });

  it('parses Google models, strips the models/ prefix, honors generateContent', async () => {
    mockFetch({
      models: [
        { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', inputTokenLimit: 2000000, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
      ],
    });
    const models = await listProviderModels({ providerName: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'k' });
    expect(models.map((m) => m.modelId)).toEqual(['gemini-1.5-pro']);
    expect(models[0].maxContextTokens).toBe(2000000);
  });

  it('parses Anthropic models (id + display_name)', async () => {
    mockFetch({ data: [{ id: 'claude-opus-4', display_name: 'Claude Opus 4' }] });
    const [m] = await listProviderModels({ providerName: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'k' });
    expect(m.modelId).toBe('claude-opus-4');
    expect(m.displayName).toBe('Claude Opus 4');
  });

  it('throws for Azure (deployments cannot be listed)', async () => {
    await expect(
      listProviderModels({ providerName: 'azure-openai', baseUrl: 'https://x.openai.azure.com', apiKey: 'k' }),
    ).rejects.toThrow(/deployment/i);
  });

  it('throws with the provider status on an HTTP error', async () => {
    mockFetch({ error: 'bad key' }, false, 401);
    await expect(
      listProviderModels({ providerName: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'bad' }),
    ).rejects.toThrow(/401/);
  });
});
