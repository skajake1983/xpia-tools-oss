/** Common types for all LLM provider adapters */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  model: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  /** The calling feature — adapters use this to enable JSON mode when appropriate */
  purpose?: string;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMCompletionResult {
  content: string;
  usage: LLMUsage;
  model: string;
  finishReason: string;
}

/** Streaming chunk emitted during SSE streaming */
export interface LLMStreamChunk {
  content: string;
  done: boolean;
  usage?: LLMUsage;
}

/** Interface every provider adapter must implement */
export interface LLMAdapter {
  readonly providerId: string;

  /** Non-streaming completion */
  complete(apiKey: string, options: LLMCompletionOptions): Promise<LLMCompletionResult>;

  /** Streaming completion — yields chunks via callback */
  streamComplete(
    apiKey: string,
    options: LLMCompletionOptions,
    onChunk: (chunk: LLMStreamChunk) => void,
  ): Promise<LLMUsage>;
}

/** Provider record from the database */
export interface ProviderRecord {
  id: string;
  name: string;
  display_name: string;
  base_url: string;
  is_enabled: number;
}

/** Model record from the database */
export interface ModelRecord {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  input_price_per_million: number;
  output_price_per_million: number;
  max_context_tokens: number;
  max_output_tokens: number;
  supports_streaming: number;
  is_enabled: number;
}

/** User limit record from the database */
export interface UserLimitRecord {
  id: string;
  user_id: string;
  daily_token_limit: number;
  is_suspended: number;
  updated_by: string | null;
}

/** Usage log record from the database */
export interface UsageLogRecord {
  id: string;
  user_id: string;
  provider_id: string;
  model_id: string;
  purpose: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  status: string;
  request_meta: string | null;
  error_message: string | null;
  created_at: string;
}
