import { describe, it, expect } from 'vitest';
import { getResearchSystemPrompt, prependResearchContext } from './gateway';
import type { LLMMessage } from './adapters/types';

const KNOWN_PROVIDERS = ['openai', 'google', 'xai', 'anthropic'];

describe('Research System Prompts', () => {
  for (const provider of KNOWN_PROVIDERS) {
    it(`returns a non-empty prompt for provider: ${provider}`, async () => {
      const prompt = await getResearchSystemPrompt(provider);
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(50);
    });
  }

  it('returns a default prompt for unknown providers', async () => {
    const prompt = await getResearchSystemPrompt('unknown_provider');
    expect(prompt).toBeTruthy();
    expect(prompt.length).toBeGreaterThan(50);
    // Default falls back to openai
    const openaiPrompt = await getResearchSystemPrompt('openai');
    expect(prompt).toBe(openaiPrompt);
  });

  it('each provider prompt mentions security research', async () => {
    for (const provider of KNOWN_PROVIDERS) {
      const prompt = (await getResearchSystemPrompt(provider)).toLowerCase();
      expect(prompt).toContain('security research');
    }
  });

  it('each provider prompt mentions controlled/lab/sandboxed environment', async () => {
    for (const provider of KNOWN_PROVIDERS) {
      const prompt = (await getResearchSystemPrompt(provider)).toLowerCase();
      const hasEnvironmentRef = prompt.includes('controlled') || prompt.includes('lab') || prompt.includes('sandboxed');
      expect(hasEnvironmentRef, `Provider "${provider}" prompt should reference a controlled environment`).toBe(true);
    }
  });

  it('all known providers have unique prompts', async () => {
    const prompts = new Set(await Promise.all(KNOWN_PROVIDERS.map(p => getResearchSystemPrompt(p))));
    expect(prompts.size).toBe(KNOWN_PROVIDERS.length);
  });
});

describe('prependResearchContext', () => {
  it('adds a system message as the first element', async () => {
    const messages: LLMMessage[] = [
      { role: 'user', content: 'Generate a test payload' },
    ];
    const result = await prependResearchContext(messages, 'openai');
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toBe(await getResearchSystemPrompt('openai'));
    expect(result[1]).toEqual(messages[0]);
  });

  it('preserves existing messages in order', async () => {
    const messages: LLMMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'Generate payload' },
    ];
    const result = await prependResearchContext(messages, 'google');
    expect(result).toHaveLength(5);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toBe(await getResearchSystemPrompt('google'));
    // Original messages preserved
    expect(result[1]).toEqual(messages[0]);
    expect(result[2]).toEqual(messages[1]);
    expect(result[3]).toEqual(messages[2]);
    expect(result[4]).toEqual(messages[3]);
  });

  it('does not mutate the original messages array', async () => {
    const messages: LLMMessage[] = [
      { role: 'user', content: 'test' },
    ];
    const originalLength = messages.length;
    await prependResearchContext(messages, 'google');
    expect(messages).toHaveLength(originalLength);
  });

  it('works with an empty messages array', async () => {
    const result = await prependResearchContext([], 'xai');
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('system');
  });

  it('uses provider-specific prompts', async () => {
    const openaiResult = await prependResearchContext([{ role: 'user', content: 'x' }], 'openai');
    const googleResult = await prependResearchContext([{ role: 'user', content: 'x' }], 'google');
    expect(openaiResult[0].content).not.toBe(googleResult[0].content);
  });
});
