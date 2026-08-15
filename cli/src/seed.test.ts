import { describe, it, expect, beforeEach } from 'vitest';
import { setRepos, getRepos } from '../../server/src/db/repos';
import { createMockRepositories } from '../../server/src/db/repositories';
import { getUserPrompt } from '../../server/src/services/prompt-template.service';
import { seedFromConfig, CLI_USER } from './seed';

describe('seedFromConfig', () => {
  beforeEach(() => setRepos(createMockRepositories()));

  it('seeds providers and models into the repos', async () => {
    const res = await seedFromConfig({
      providers: [{ id: 'openai', name: 'openai', displayName: 'OpenAI', baseUrl: 'https://api.openai.com/v1', isEnabled: true }],
      models: [
        { id: 'gpt-4o-mini', providerId: 'openai', modelId: 'gpt-4o-mini', displayName: 'GPT-4o mini', maxOutputTokens: 4096, maxContextTokens: 128000 },
      ],
    });
    expect(res.providers).toBe(1);
    expect(res.models).toBe(1);
    const provider = await getRepos().config.getProvider('openai');
    expect(provider?.baseUrl).toBe('https://api.openai.com/v1');
    const model = await getRepos().config.getModel('gpt-4o-mini');
    expect(model?.modelId).toBe('gpt-4o-mini');
  });

  it('seeds an encrypted key from the provider env var', async () => {
    process.env.XPIA_OPENAI_API_KEY = 'sk-test-123';
    try {
      const res = await seedFromConfig({
        providers: [{ id: 'openai', name: 'openai', displayName: 'OpenAI', baseUrl: 'u', isEnabled: true }],
        models: [],
      });
      expect(res.keys).toBe(1);
      const key = await getRepos().apiKeys.getActiveKey(CLI_USER, 'openai');
      expect(key?.encryptedKey).toBeTruthy();
    } finally {
      delete process.env.XPIA_OPENAI_API_KEY;
    }
  });

  it('seeds a placeholder key for keyless providers', async () => {
    const res = await seedFromConfig({
      providers: [{ id: 'ollama', name: 'ollama', displayName: 'Ollama', baseUrl: 'http://localhost:11434/v1', isEnabled: true, keyless: true }],
      models: [],
    });
    expect(res.keys).toBe(1);
  });

  it('does not seed a key when the provider is disabled', async () => {
    const res = await seedFromConfig({
      providers: [{ id: 'openai', name: 'openai', displayName: 'OpenAI', baseUrl: 'u', isEnabled: false }],
      models: [],
    });
    expect(res.keys).toBe(0);
  });

  it('seeds prompt overrides as the effective prompt', async () => {
    const res = await seedFromConfig({
      providers: [],
      models: [],
      prompts: [{ category: 'document', systemPrompt: 'CUSTOM SYS', userPrompt: 'CUSTOM USER' }],
    });
    expect(res.prompts).toBe(1);
    expect(await getUserPrompt(CLI_USER, 'document', 'system')).toBe('CUSTOM SYS');
    expect(await getUserPrompt(CLI_USER, 'document', 'user')).toBe('CUSTOM USER');
  });
});
