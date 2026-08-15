import { describe, it, expect } from 'vitest';
import { OpenAIAdapter } from './openai';

describe('OpenAIAdapter.effectiveMaxTokens', () => {
  // Access private method via bracket notation for testing
  const adapter = new OpenAIAdapter('openai', 'https://api.openai.com/v1');
  const effective = (model: string, requested: number) =>
    (adapter as unknown as { effectiveMaxTokens: (m: string, r: number) => number }).effectiveMaxTokens(model, requested);

  it('multiplies by 4x for GPT-5 reasoning models', () => {
    expect(effective('gpt-5', 2048)).toBe(8192);
    expect(effective('gpt-5-mini', 2048)).toBe(8192);
    expect(effective('gpt-5.4', 2048)).toBe(8192);
  });

  it('multiplies by 4x for o-series reasoning models', () => {
    expect(effective('o3', 2048)).toBe(8192);
    expect(effective('o4-mini', 2048)).toBe(8192);
    expect(effective('o1', 1024)).toBe(4096);
  });

  it('caps at 16384 for reasoning models', () => {
    expect(effective('gpt-5', 8192)).toBe(16384);
    expect(effective('o3', 10000)).toBe(16384);
  });

  it('passes through unchanged for non-reasoning models', () => {
    expect(effective('gpt-4o', 2048)).toBe(2048);
    expect(effective('chatgpt-4o-latest', 4096)).toBe(4096);
  });

  it('does not apply to xAI/Grok models', () => {
    expect(effective('grok-3', 2048)).toBe(2048);
    expect(effective('grok-3-mini', 1024)).toBe(1024);
  });
});
