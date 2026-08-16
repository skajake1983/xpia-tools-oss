import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AzureOpenAIAdapter } from './azure-openai';

// Keep test output quiet; the inherited OpenAI adapter logs on every completion.
vi.mock('../../../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function jsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
  } as unknown as Response;
}

function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
    body: {
      getReader: () => ({
        read: () =>
          i < chunks.length
            ? Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) })
            : Promise.resolve({ done: true, value: undefined }),
      }),
    },
  } as unknown as Response;
}

const BASE = 'https://my-resource.openai.azure.com';

describe('AzureOpenAIAdapter', () => {
  describe('buildChatUrl', () => {
    const url = (a: AzureOpenAIAdapter, model: string) =>
      (a as unknown as { buildChatUrl: (m: string) => string }).buildChatUrl(model);

    it('builds a deployment-based URL with the default api-version', () => {
      const a = new AzureOpenAIAdapter('azure-openai', BASE, '2024-10-21');
      expect(url(a, 'gpt-4o-mini')).toBe(
        'https://my-resource.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21',
      );
    });

    it('strips a trailing slash from the base URL', () => {
      const a = new AzureOpenAIAdapter('azure-openai', BASE + '/', '2024-10-21');
      expect(url(a, 'dep')).toBe(
        'https://my-resource.openai.azure.com/openai/deployments/dep/chat/completions?api-version=2024-10-21',
      );
    });

    it('respects a constructor-provided api-version', () => {
      const a = new AzureOpenAIAdapter('azure-openai', BASE, '2025-01-01-preview');
      expect(url(a, 'dep')).toContain('api-version=2025-01-01-preview');
    });
  });

  describe('buildHeaders', () => {
    it('uses the api-key header, not a bearer token', () => {
      const a = new AzureOpenAIAdapter('azure-openai', BASE);
      const headers = (a as unknown as { buildHeaders: (k: string) => Record<string, string> }).buildHeaders('secret');
      expect(headers['api-key']).toBe('secret');
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('effectiveMaxTokens (inherited)', () => {
    it('applies the reasoning multiplier from OpenAIAdapter', () => {
      const a = new AzureOpenAIAdapter('azure-openai', BASE);
      const eff = (a as unknown as { effectiveMaxTokens: (m: string, r: number) => number }).effectiveMaxTokens('o3', 2048);
      expect(eff).toBe(8192);
    });
  });

  describe('complete', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.clearAllMocks();
    });

    it('calls the deployment URL with api-key auth and an OpenAI-shaped body', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 4 },
          model: 'gpt-4o-mini',
        }),
      );

      const a = new AzureOpenAIAdapter('azure-openai', BASE, '2024-10-21');
      const result = await a.complete('secret', {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
        maxTokens: 500,
      });

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://my-resource.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21',
      );
      expect(opts.headers['api-key']).toBe('secret');
      expect(opts.headers.Authorization).toBeUndefined();

      const body = JSON.parse(opts.body);
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.max_completion_tokens).toBe(500);

      expect(result.content).toBe('hi');
      expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 4 });
    });

    it('surfaces errors with the Azure OpenAI label', async () => {
      fetchMock.mockResolvedValue(jsonResponse('nope', { ok: false, status: 404 }));
      const a = new AzureOpenAIAdapter('azure-openai', BASE);
      await expect(
        a.complete('k', { model: 'dep', messages: [{ role: 'user', content: 'x' }] }),
      ).rejects.toThrow(/Azure OpenAI API error \(404\)/);
    });
  });

  describe('streamComplete (inherited loop, Azure overrides)', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.clearAllMocks();
    });

    it('streams through the deployment URL with api-key auth', async () => {
      fetchMock.mockResolvedValue(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}\n',
          'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":null}]}\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n',
          'data: [DONE]\n',
        ]),
      );

      const a = new AzureOpenAIAdapter('azure-openai', BASE, '2024-10-21');
      const chunks: string[] = [];
      const usage = await a.streamComplete(
        'secret',
        { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }], stream: true },
        (c) => {
          if (c.content) chunks.push(c.content);
        },
      );

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toContain('/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21');
      expect(opts.headers['api-key']).toBe('secret');
      expect(chunks.join('')).toBe('Hello');
      expect(usage).toEqual({ inputTokens: 3, outputTokens: 2 });
    });
  });
});
