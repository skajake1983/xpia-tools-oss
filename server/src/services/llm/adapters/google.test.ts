import { describe, it, expect } from 'vitest';
import { GoogleAdapter } from './google';

describe('GoogleAdapter.toGeminiMessages', () => {
  const adapter = new GoogleAdapter('https://generativelanguage.googleapis.com/v1beta');
  // Access private method via bracket notation for testing
  const convert = (messages: { role: string; content: string }[]) =>
    (adapter as unknown as { toGeminiMessages: (m: { role: string; content: string }[]) => unknown }).toGeminiMessages(messages);

  it('consolidates multiple system messages into a single systemInstruction', () => {
    const result = convert([
      { role: 'system', content: 'Research framing prompt' },
      { role: 'system', content: 'Payload enhancement instructions' },
      { role: 'user', content: 'Here are the payloads' },
    ]) as { systemInstruction?: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[] };

    expect(result.systemInstruction).toBeDefined();
    expect(result.systemInstruction!.parts).toHaveLength(2);
    expect(result.systemInstruction!.parts[0].text).toBe('Research framing prompt');
    expect(result.systemInstruction!.parts[1].text).toBe('Payload enhancement instructions');
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].role).toBe('user');
  });

  it('handles a single system message', () => {
    const result = convert([
      { role: 'system', content: 'Only system' },
      { role: 'user', content: 'Hello' },
    ]) as { systemInstruction?: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[] };

    expect(result.systemInstruction!.parts).toHaveLength(1);
    expect(result.systemInstruction!.parts[0].text).toBe('Only system');
    expect(result.contents).toHaveLength(1);
  });

  it('omits systemInstruction when no system messages', () => {
    const result = convert([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]) as { systemInstruction?: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[] };

    expect(result.systemInstruction).toBeUndefined();
    expect(result.contents).toHaveLength(2);
    expect(result.contents[0].role).toBe('user');
    expect(result.contents[1].role).toBe('model');
  });

  it('maps assistant role to model', () => {
    const result = convert([
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Answer' },
    ]) as { contents: { role: string; parts: { text: string }[] }[] };

    expect(result.contents[1].role).toBe('model');
    expect(result.contents[1].parts[0].text).toBe('Answer');
  });
});
