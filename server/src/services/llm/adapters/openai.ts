import { LLMAdapter, LLMCompletionOptions, LLMCompletionResult, LLMStreamChunk, LLMUsage } from './types';
import logger from '../../../logger';

/**
 * Models that use internal reasoning tokens which count against max_completion_tokens.
 * These need a higher token budget so reasoning doesn't consume the entire allocation.
 */
const REASONING_MODELS = /^(o[1-4]|gpt-5)/;

/** OpenAI-compatible adapter (works for OpenAI, xAI/Grok, and other compatible providers) */
export class OpenAIAdapter implements LLMAdapter {
  /** Human-readable label used in errors and logs; overridden by subclasses. */
  protected readonly label: string = 'OpenAI';

  constructor(
    public readonly providerId: string,
    protected baseUrl: string,
  ) {}

  /** Build the chat-completions URL. Overridden by Azure OpenAI (deployment-based). */
  protected buildChatUrl(_model: string): string {
    return `${this.baseUrl}/chat/completions`;
  }

  /** Build request headers. Overridden by Azure OpenAI (api-key header). */
  protected buildHeaders(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  /**
   * For reasoning models, the requested maxTokens is the desired OUTPUT size.
   * We multiply by 4× to give the model headroom for internal reasoning.
   */
  protected effectiveMaxTokens(model: string, requested: number): number {
    if (REASONING_MODELS.test(model)) {
      return Math.min(requested * 4, 16384);
    }
    return requested;
  }

  async complete(apiKey: string, options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);

    const url = this.buildChatUrl(options.model);
    const effectiveMax = this.effectiveMaxTokens(options.model, options.maxTokens ?? 4096);
    const fetchStart = Date.now();

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          max_completion_tokens: effectiveMax,
          stream: false,
          ...(options.purpose === 'document_enhance' ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') throw new Error(`${this.label} API request timed out after 240s`);
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    logger.info({ model: options.model, durationMs: Date.now() - fetchStart, httpStatus: res.status }, `${this.label} API response`);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${this.label} API error (${res.status}): ${body}`);
    }

    const data = await res.json() as Record<string, unknown>;
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const firstChoice = choices?.[0] as Record<string, unknown> | undefined;
    const message = firstChoice?.message as Record<string, unknown> | undefined;
    const rawContent = message?.content;
    const content = typeof rawContent === 'string' && rawContent.length > 0 ? rawContent : '';

    const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } | undefined;
    const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens ?? 0;

    if (!content && (usage?.completion_tokens ?? 0) > 0) {
      logger.warn({ model: options.model, completionTokens: usage!.completion_tokens, reasoningTokens }, 'Model consumed tokens but returned empty content');
    }

    return {
      content,
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
      },
      model: data.model as string,
      finishReason: (firstChoice?.finish_reason as string) ?? 'stop',
    };
  }

  async streamComplete(
    apiKey: string,
    options: LLMCompletionOptions,
    onChunk: (chunk: LLMStreamChunk) => void,
  ): Promise<LLMUsage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);

    let res: Response;
    try {
      res = await fetch(this.buildChatUrl(options.model), {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify({
          model: options.model,
          messages: options.messages,
          max_completion_tokens: this.effectiveMaxTokens(options.model, options.maxTokens ?? 4096),
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') throw new Error(`${this.label} API stream request timed out after 240s`);
      throw err;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${this.label} API error (${res.status}): ${body}`);
    }

    let usage: LLMUsage = { inputTokens: 0, outputTokens: 0 };
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

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
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          onChunk({ content: '', done: true, usage });
          continue;
        }

        try {
          const parsed = JSON.parse(payload) as {
            choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };

          if (parsed.usage) {
            usage = {
              inputTokens: parsed.usage.prompt_tokens ?? usage.inputTokens,
              outputTokens: parsed.usage.completion_tokens ?? usage.outputTokens,
            };
          }

          const content = parsed.choices?.[0]?.delta?.content ?? '';
          const isDone = parsed.choices?.[0]?.finish_reason != null;
          if (content) {
            onChunk({ content, done: false });
          }
          if (isDone) {
            onChunk({ content: '', done: true, usage });
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
