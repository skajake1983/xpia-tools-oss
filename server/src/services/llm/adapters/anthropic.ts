import { LLMAdapter, LLMCompletionOptions, LLMCompletionResult, LLMStreamChunk, LLMUsage, LLMMessage } from './types';
import logger from '../../../logger';

/** Anthropic Messages API version (sent as the anthropic-version header). */
const ANTHROPIC_VERSION = '2023-06-01';

/** Anthropic Claude adapter (Messages API) */
export class AnthropicAdapter implements LLMAdapter {
  readonly providerId = 'anthropic';

  constructor(private baseUrl: string) {}

  /**
   * Anthropic takes the system prompt as a top-level `system` field, not as a message.
   * Pull any system-role messages out and convert the rest into Anthropic's shape.
   */
  private toAnthropicMessages(messages: LLMMessage[]): {
    system?: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
  } {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const conversation = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }));

    return system ? { system, messages: conversation } : { messages: conversation };
  }

  async complete(apiKey: string, options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const { system, messages } = this.toAnthropicMessages(options.messages);

    // The Messages API has no simple JSON-mode toggle (structured outputs need a schema
    // we don't have here), so nudge via the system prompt for parity with the other
    // adapters' document_enhance behaviour.
    const systemText =
      options.purpose === 'document_enhance'
        ? [system, 'Respond with only valid JSON. No markdown fences, no preamble.'].filter(Boolean).join('\n\n')
        : system;

    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      messages,
      stream: false,
    };
    if (systemText) body.system = systemText;

    const url = `${this.baseUrl}/messages`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);
    const fetchStart = Date.now();

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') throw new Error('Anthropic API request timed out after 240s');
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    logger.info({ model: options.model, durationMs: Date.now() - fetchStart, httpStatus: res.status }, 'Anthropic API response');

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      model?: string;
      stop_reason?: string;
    };

    const content = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('');

    return {
      content,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
      model: data.model ?? options.model,
      finishReason: data.stop_reason ?? 'end_turn',
    };
  }

  async streamComplete(
    apiKey: string,
    options: LLMCompletionOptions,
    onChunk: (chunk: LLMStreamChunk) => void,
  ): Promise<LLMUsage> {
    const { system, messages } = this.toAnthropicMessages(options.messages);

    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      messages,
      stream: true,
    };
    if (system) body.system = system;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') throw new Error('Anthropic API stream request timed out after 240s');
      throw err;
    }

    if (!res.ok) {
      clearTimeout(timeout);
      const text = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${text}`);
    }

    let usage: LLMUsage = { inputTokens: 0, outputTokens: 0 };
    const reader = res.body?.getReader();
    if (!reader) {
      clearTimeout(timeout);
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(trimmed.indexOf(':') + 1).trim();
          if (!payload) continue;

          try {
            const parsed = JSON.parse(payload) as {
              type?: string;
              delta?: { type?: string; text?: string };
              message?: { usage?: { input_tokens?: number; output_tokens?: number } };
              usage?: { output_tokens?: number };
            };

            switch (parsed.type) {
              case 'message_start':
                usage = {
                  inputTokens: parsed.message?.usage?.input_tokens ?? usage.inputTokens,
                  outputTokens: parsed.message?.usage?.output_tokens ?? usage.outputTokens,
                };
                break;
              case 'content_block_delta':
                if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
                  onChunk({ content: parsed.delta.text, done: false });
                }
                break;
              case 'message_delta':
                if (parsed.usage?.output_tokens != null) {
                  usage = { ...usage, outputTokens: parsed.usage.output_tokens };
                }
                break;
              case 'message_stop':
                onChunk({ content: '', done: true, usage });
                break;
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    return usage;
  }
}
