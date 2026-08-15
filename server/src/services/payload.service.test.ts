import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB
vi.mock('../db', () => ({
  default: {
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(() => []),
  },
}));

// Mock prompt-template service to return code defaults
vi.mock('./prompt-template.service', () => ({
  getUserPrompt: vi.fn((_userId: string, _category: string, type: string) =>
    type === 'system'
      ? 'You are an AI security researcher specializing in prompt injection.'
      : 'Enhance these {{PAYLOAD_COUNT}} XPIA payloads:\n\n{{PAYLOAD_SUMMARY}}'
  ),
}));

// Mock LLM gateway
vi.mock('./llm/gateway', () => ({
  complete: vi.fn(),
}));

import { generatePayloads } from './payload.service';
import * as gateway from './llm/gateway';

const USER_ID = 'test-user-id';
const mockComplete = vi.mocked(gateway.complete);

describe('Payload Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates payloads without LLM when no modelId', async () => {
    const result = await generatePayloads({
      userId: USER_ID,
      count: 3,
      format: 'json',
    });

    expect(result.payloads).toHaveLength(3);
    expect(result.metadata.count).toBe(3);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('produces deterministic output with same seed', async () => {
    const a = await generatePayloads({ userId: USER_ID, count: 5, format: 'json', seed: 42 });
    const b = await generatePayloads({ userId: USER_ID, count: 5, format: 'json', seed: 42 });

    expect(a.payloads.map(p => p.templateId)).toEqual(b.payloads.map(p => p.templateId));
    expect(a.metadata.seed).toBe(42);
  });

  it('calls gateway.complete when modelId is provided', async () => {
    mockComplete.mockResolvedValueOnce({
      content: '[0]\nEnhanced payload zero\n[1]\nEnhanced payload one\n[2]\nEnhanced payload two',
      usage: { inputTokens: 200, outputTokens: 400, totalTokens: 600 },
      model: 'gpt-5',
      finishReason: 'stop',
    } as any);

    const result = await generatePayloads({
      userId: USER_ID,
      count: 3,
      format: 'json',
      modelId: 'model-123',
    });

    expect(mockComplete).toHaveBeenCalledOnce();
    expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      modelDbId: 'model-123',
      purpose: 'payload_enhance',
    }));
    expect(result.payloads).toHaveLength(3);
    // Enhanced payloads should replace originals
    expect(result.payloads[0].payload).toBe('Enhanced payload zero');
    expect(result.payloads[1].payload).toBe('Enhanced payload one');
  });

  it('throws when gateway rejects during LLM enhancement', async () => {
    mockComplete.mockRejectedValueOnce(new Error('Service unavailable'));

    await expect(generatePayloads({
      userId: USER_ID,
      count: 3,
      format: 'json',
      modelId: 'model-bad',
    })).rejects.toThrow('Service unavailable');
  });

  it('ignores LLM chunks shorter than 10 chars', async () => {
    mockComplete.mockResolvedValueOnce({
      content: '[0]\nShort\n[1]\nThis is a properly enhanced payload that should replace the original',
      usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
      model: 'gpt-5',
      finishReason: 'stop',
    } as any);

    const templateResult = await generatePayloads({
      userId: USER_ID,
      count: 2,
      format: 'json',
      seed: 99,
    });
    const originalPayload0 = templateResult.payloads[0].payload;

    mockComplete.mockResolvedValueOnce({
      content: '[0]\nShort\n[1]\nThis is a properly enhanced payload that should replace the original',
      usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
      model: 'gpt-5',
      finishReason: 'stop',
    } as any);

    const enhancedResult = await generatePayloads({
      userId: USER_ID,
      count: 2,
      format: 'json',
      seed: 99,
      modelId: 'model-123',
    });

    // Payload 0 should NOT be replaced (too short)
    expect(enhancedResult.payloads[0].payload).toBe(originalPayload0);
    // Payload 1 SHOULD be replaced
    expect(enhancedResult.payloads[1].payload).toBe('This is a properly enhanced payload that should replace the original');
  });

  it('formats output as text when requested', async () => {
    const result = await generatePayloads({
      userId: USER_ID,
      count: 2,
      format: 'text',
    });

    expect(result.payloads).toHaveLength(2);
    expect(result.metadata.format).toBe('text');
  });

  it('filters by category', async () => {
    const result = await generatePayloads({
      userId: USER_ID,
      count: 5,
      format: 'json',
      categories: ['direct_instruction'],
    });

    for (const p of result.payloads) {
      expect(p.category).toBe('direct_instruction');
    }
  });

  it('filters by severity', async () => {
    const result = await generatePayloads({
      userId: USER_ID,
      count: 5,
      format: 'json',
      severities: ['critical'],
    });

    for (const p of result.payloads) {
      expect(p.severity).toBe('critical');
    }
  });
});
