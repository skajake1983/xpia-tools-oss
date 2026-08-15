import { LLMAdapter, LLMCompletionOptions, LLMCompletionResult, LLMStreamChunk, LLMUsage, LLMMessage } from './types';

/** Google Gemini adapter */
export class GoogleAdapter implements LLMAdapter {
  readonly providerId = 'google';

  constructor(private baseUrl: string) {}

  private toGeminiMessages(messages: LLMMessage[]): { systemInstruction?: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[] } {
    const systemMsgs = messages.filter((m) => m.role === 'system');
    const others = messages.filter((m) => m.role !== 'system');

    const contents = others.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const result: { systemInstruction?: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[] } = { contents };
    if (systemMsgs.length > 0) {
      result.systemInstruction = { parts: systemMsgs.map((m) => ({ text: m.content })) };
    }
    return result;
  }

  async complete(apiKey: string, options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const { systemInstruction, contents } = this.toGeminiMessages(options.messages);

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
    };
    if (options.purpose === 'document_enhance') {
      generationConfig.responseMimeType = 'application/json';
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig,
    };
    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const url = `${this.baseUrl}/models/${options.model}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') throw new Error('Google API request timed out after 240s');
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google API error (${res.status}): ${text}`);
    }

    const data = await res.json() as {
      candidates: { content: { parts: { text: string }[] }; finishReason: string }[];
      usageMetadata: { promptTokenCount: number; candidatesTokenCount: number };
    };

    return {
      content: data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '',
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
      model: options.model,
      finishReason: data.candidates?.[0]?.finishReason ?? 'STOP',
    };
  }

  async streamComplete(
    apiKey: string,
    options: LLMCompletionOptions,
    onChunk: (chunk: LLMStreamChunk) => void,
  ): Promise<LLMUsage> {
    const { systemInstruction, contents } = this.toGeminiMessages(options.messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
      },
    };
    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    const url = `${this.baseUrl}/models/${options.model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') throw new Error('Google API stream request timed out after 240s');
      throw err;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google API error (${res.status}): ${text}`);
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
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);

        try {
          const parsed = JSON.parse(payload) as {
            candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
          };

          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          if (text) {
            onChunk({ content: text, done: false });
          }

          if (parsed.usageMetadata) {
            usage = {
              inputTokens: parsed.usageMetadata.promptTokenCount ?? usage.inputTokens,
              outputTokens: parsed.usageMetadata.candidatesTokenCount ?? usage.outputTokens,
            };
          }

          if (parsed.candidates?.[0]?.finishReason && parsed.candidates[0].finishReason !== 'STOP') {
            // Non-stop finishReason (safety, etc.)
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
    } finally {
      clearTimeout(timeout);
    }

    onChunk({ content: '', done: true, usage });
    return usage;
  }
}
