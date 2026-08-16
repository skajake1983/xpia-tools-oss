import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicAdapter } from './anthropic';

// Keep test output quiet; the adapter logs on every completion.
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

function sseResponse(chunks: string[], init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok,
    status,
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

describe('AnthropicAdapter', () => {
  const adapter = new AnthropicAdapter('https://api.anthropic.com/v1');
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('toAnthropicMessages', () => {
    const convert = (messages: { role: string; content: string }[]) =>
      (
        adapter as unknown as {
          toAnthropicMessages: (m: { role: string; content: string }[]) => {
            system?: string;
            messages: { role: string; content: string }[];
          };
        }
      ).toAnthropicMessages(messages);

    it('extracts system messages into a separate system field', () => {
      const result = convert([
        { role: 'system', content: 'Research framing' },
        { role: 'user', content: 'Do the thing' },
      ]);
      expect(result.system).toBe('Research framing');
      expect(result.messages).toEqual([{ role: 'user', content: 'Do the thing' }]);
    });

    it('joins multiple system messages with a blank line', () => {
      const result = convert([
        { role: 'system', content: 'A' },
        { role: 'system', content: 'B' },
        { role: 'user', content: 'go' },
      ]);
      expect(result.system).toBe('A\n\nB');
    });

    it('maps assistant role and omits system when absent', () => {
      const result = convert([
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a' },
      ]);
      expect(result.system).toBeUndefined();
      expect(result.messages).toEqual([
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a' },
      ]);
    });
  });

  describe('complete', () => {
    it('sends the correct URL, headers, and body and parses the response', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          content: [{ type: 'text', text: 'Hello there' }],
          usage: { input_tokens: 12, output_tokens: 5 },
          model: 'claude-sonnet-4-5',
          stop_reason: 'end_turn',
        }),
      );

      const result = await adapter.complete('sk-ant-123', {
        model: 'claude-sonnet-4-5',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hi' },
        ],
        maxTokens: 1000,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(opts.headers['x-api-key']).toBe('sk-ant-123');
      expect(opts.headers['anthropic-version']).toBe('2023-06-01');
      expect(opts.headers.Authorization).toBeUndefined();

      const body = JSON.parse(opts.body);
      expect(body.model).toBe('claude-sonnet-4-5');
      expect(body.max_tokens).toBe(1000);
      expect(body.system).toBe('You are helpful');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
      expect(body.stream).toBe(false);

      expect(result.content).toBe('Hello there');
      expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 5 });
      expect(result.model).toBe('claude-sonnet-4-5');
      expect(result.finishReason).toBe('end_turn');
    });

    it('concatenates text blocks and ignores non-text blocks', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          content: [
            { type: 'thinking', thinking: 'hmm' },
            { type: 'text', text: 'part 1 ' },
            { type: 'text', text: 'part 2' },
          ],
          usage: { input_tokens: 1, output_tokens: 2 },
        }),
      );
      const result = await adapter.complete('k', { model: 'm', messages: [{ role: 'user', content: 'x' }] });
      expect(result.content).toBe('part 1 part 2');
    });

    it('appends a JSON instruction for document_enhance', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: '{}' }], usage: {} }));
      await adapter.complete('k', {
        model: 'm',
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'x' },
        ],
        purpose: 'document_enhance',
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.system).toContain('sys');
      expect(body.system.toLowerCase()).toContain('json');
    });

    it('falls back to defaults when usage and model are absent', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'x' }] }));
      const result = await adapter.complete('k', { model: 'claude-x', messages: [{ role: 'user', content: 'x' }] });
      expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
      expect(result.model).toBe('claude-x');
      expect(result.finishReason).toBe('end_turn');
    });

    it('throws on a non-OK response', async () => {
      fetchMock.mockResolvedValue(jsonResponse('rate limited', { ok: false, status: 429 }));
      await expect(
        adapter.complete('k', { model: 'm', messages: [{ role: 'user', content: 'x' }] }),
      ).rejects.toThrow(/Anthropic API error \(429\)/);
    });
  });

  describe('streamComplete', () => {
    it('emits text deltas and accumulates usage', async () => {
      fetchMock.mockResolvedValue(
        sseResponse([
          'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}\n\n',
          'data: {"type":"message_stop"}\n\n',
        ]),
      );

      const chunks: string[] = [];
      let doneUsage: unknown;
      const usage = await adapter.streamComplete(
        'k',
        { model: 'm', messages: [{ role: 'user', content: 'hi' }], stream: true },
        (c) => {
          if (c.content) chunks.push(c.content);
          if (c.done) doneUsage = c.usage;
        },
      );

      expect(chunks.join('')).toBe('Hello');
      expect(usage).toEqual({ inputTokens: 10, outputTokens: 7 });
      expect(doneUsage).toEqual({ inputTokens: 10, outputTokens: 7 });
    });

    it('handles SSE payloads split across read() boundaries', async () => {
      fetchMock.mockResolvedValue(
        sseResponse([
          'data: {"type":"content_block_delta","delta":{"type":"te',
          'xt_delta","text":"OK"}}\n\ndata: {"type":"message_stop"}\n\n',
        ]),
      );
      const chunks: string[] = [];
      await adapter.streamComplete(
        'k',
        { model: 'm', messages: [{ role: 'user', content: 'x' }], stream: true },
        (c) => {
          if (c.content) chunks.push(c.content);
        },
      );
      expect(chunks.join('')).toBe('OK');
    });

    it('throws on a non-OK stream response', async () => {
      fetchMock.mockResolvedValue(jsonResponse('bad', { ok: false, status: 400 }));
      await expect(
        adapter.streamComplete('k', { model: 'm', messages: [{ role: 'user', content: 'x' }], stream: true }, () => {}),
      ).rejects.toThrow(/Anthropic API error \(400\)/);
    });
  });
});
