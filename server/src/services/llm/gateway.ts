/**
 * LLM Gateway Service
 *
 * Orchestrates: limit enforcement → provider routing → metering
 * This is the ONLY entry point for all LLM calls in the application.
 */

import { v4 as uuidv4 } from 'uuid';
import repos from '../../db/repos';
import type { ProviderDoc, ModelDoc, UsageLogDoc } from '../../db/repositories/types';
import { config } from '../../config';
import { decryptApiKey } from './encryption';
import { OpenAIAdapter } from './adapters/openai';
import { GoogleAdapter } from './adapters/google';
import { AnthropicAdapter } from './adapters/anthropic';
import { AzureOpenAIAdapter } from './adapters/azure-openai';
import {
  LLMAdapter,
  LLMMessage,
  LLMCompletionResult,
  LLMStreamChunk,
  LLMUsage,
} from './adapters/types';
import { getPrompt } from '../../config/prompts';
import logger from '../../logger';
import { recordTokenUsage } from '../metrics.service';

export type LLMPurpose = 'document_enhance' | 'image_enhance' | 'payload_enhance' | 'page_enhance' | 'custom_action';

// === Security Research System Prompts (delegated to config/prompts.ts) ===

/** Get the security research system prompt for a given provider */
export async function getResearchSystemPrompt(providerId: string): Promise<string> {
  return (await getPrompt(`research_framing.${providerId}`)) || (await getPrompt('research_framing.openai'));
}

/** Prepend research context system message to a message array */
export async function prependResearchContext(messages: LLMMessage[], providerId: string): Promise<LLMMessage[]> {
  const systemPrompt = await getResearchSystemPrompt(providerId);
  // If there's already a system message, prepend research context before it
  return [{ role: 'system', content: systemPrompt }, ...messages];
}

export interface GatewayCompletionRequest {
  userId: string;
  modelDbId: string;
  messages: LLMMessage[];
  purpose: LLMPurpose;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  requestMeta?: Record<string, unknown>;
  correlationId?: string;
}

export interface GatewayCompletionResponse extends LLMCompletionResult {
  usageLogId: string;
}

// === Adapter Registry ===

const adapterCache = new Map<string, LLMAdapter>();

function getAdapter(provider: ProviderDoc): LLMAdapter {
  if (adapterCache.has(provider.id)) {
    return adapterCache.get(provider.id)!;
  }

  let adapter: LLMAdapter;
  switch (provider.name) {
    case 'google':
      adapter = new GoogleAdapter(provider.baseUrl);
      break;
    case 'anthropic':
      adapter = new AnthropicAdapter(provider.baseUrl);
      break;
    case 'azure-openai':
      adapter = new AzureOpenAIAdapter(provider.id, provider.baseUrl);
      break;
    case 'openai':
    case 'xai':
    default:
      // OpenAI-compatible adapter works for OpenAI, xAI, and other compatible providers
      adapter = new OpenAIAdapter(provider.id, provider.baseUrl);
      break;
  }

  adapterCache.set(provider.id, adapter);
  return adapter;
}

// === Limit Enforcement ===

interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  dailyTokenLimit?: number;
}

async function getUserLimits(userId: string): Promise<{ dailyTokenLimit: number; isSuspended: boolean }> {
  const user = await repos.users.getById(userId);
  if (!user) {
    return { dailyTokenLimit: config.defaultLimits.dailyTokenLimit, isSuspended: false };
  }
  return user.limits;
}

async function checkLimits(userId: string): Promise<LimitCheckResult> {
  const limits = await getUserLimits(userId);

  // Check suspension
  if (limits.isSuspended) {
    return { allowed: false, reason: 'Account suspended. Contact administrator.' };
  }

  // Daily token limit — 0 means unlimited (BYOK users manage their own spend)
  if (limits.dailyTokenLimit > 0) {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dailyTokens = await repos.usage.getTotalTokensSince(userId, todayStart.toISOString());

    if (dailyTokens >= limits.dailyTokenLimit) {
      return { allowed: false, reason: `Daily token limit reached (${dailyTokens.toLocaleString()}/${limits.dailyTokenLimit.toLocaleString()})` };
    }
  }

  return { allowed: true, dailyTokenLimit: limits.dailyTokenLimit };
}

// === Key Resolution ===

async function getApiKey(userId: string, providerId: string): Promise<string> {
  const keyDoc = await repos.apiKeys.getActiveKey(userId, providerId);

  if (!keyDoc) {
    throw new Error(`No API key configured for this provider. Add one in Settings → API Keys.`);
  }

  return decryptApiKey(keyDoc.encryptedKey, keyDoc.keyIv, keyDoc.keyTag, keyDoc.keyFingerprint ?? undefined);
}

// === Usage Logging ===

async function logUsage(params: {
  id: string;
  userId: string;
  providerId: string;
  modelId: string;
  modelDisplayName: string;
  providerDisplayName: string;
  purpose: LLMPurpose;
  usage: LLMUsage;
  durationMs: number;
  status: 'ok' | 'error' | 'limit_hit';
  requestMeta?: Record<string, unknown>;
  errorMessage?: string;
  promptMessages?: string;
  responseText?: string;
  correlationId?: string;
}): Promise<void> {
  const metaJson = params.requestMeta ? JSON.stringify(params.requestMeta) : null;
  const log = params.correlationId ? logger.child({ correlationId: params.correlationId }) : logger;
  log.debug({ id: params.id, status: params.status, metaLen: metaJson?.length ?? 0, promptLen: params.promptMessages?.length ?? 0, responseLen: params.responseText?.length ?? 0 }, 'logUsage INSERT starting');
  try {
    const doc: UsageLogDoc = {
      id: params.id,
      userId: params.userId,
      providerId: params.providerId,
      modelDbId: params.modelId,
      modelDisplayName: params.modelDisplayName,
      providerDisplayName: params.providerDisplayName,
      purpose: params.purpose as UsageLogDoc['purpose'],
      inputTokens: params.usage.inputTokens,
      outputTokens: params.usage.outputTokens,
      durationMs: params.durationMs,
      status: params.status,
      requestMeta: metaJson,
      errorMessage: params.errorMessage ?? null,
      promptMessages: params.promptMessages ?? null,
      responseText: params.responseText ?? null,
      createdAt: new Date().toISOString(),
    };
    await Promise.race([
      repos.usage.create(doc),
      new Promise((_, reject) => setTimeout(() => reject(new Error('logUsage INSERT timed out after 10s')), 10000)),
    ]);
    log.debug('logUsage INSERT succeeded');
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : err }, 'logUsage INSERT failed');
    // Don't rethrow — usage logging failure should not block the response
  }
}

// === Public API ===

/** Non-streaming LLM completion with full metering */
export async function complete(req: GatewayCompletionRequest): Promise<GatewayCompletionResponse> {
  // Validate input length
  const totalInputLength = req.messages.reduce((acc, m) => acc + m.content.length, 0);
  if (totalInputLength > config.maxLlmInputLength) {
    throw new Error(`Input too long (${totalInputLength} chars, max ${config.maxLlmInputLength})`);
  }

  // Resolve model and provider
  const model = await repos.config.getModel(req.modelDbId);
  if (!model || !model.isEnabled) throw new Error('Model not found or disabled');

  const provider = await repos.config.getProvider(model.providerId);
  if (!provider || !provider.isEnabled) throw new Error('Provider not found or disabled');

  // Inject provider-specific security research system prompt
  const researchPrompt = await getResearchSystemPrompt(provider.id);
  const messagesWithContext = await prependResearchContext(req.messages, provider.id);
  const log = logger.child({ correlationId: req.correlationId, provider: provider.id, model: model.modelId, purpose: req.purpose, userId: req.userId });
  log.info({ researchPromptLen: researchPrompt.length }, 'LLM call starting');

  // Enforce limits
  log.debug('Checking limits');
  const limitCheck = await checkLimits(req.userId);
  log.debug({ allowed: limitCheck.allowed }, 'Limits check result');
  if (!limitCheck.allowed) {
    const logId = uuidv4();
    // Fire-and-forget
    logUsage({
      id: logId,
      userId: req.userId,
      providerId: provider.id,
      modelId: model.modelId,
      modelDisplayName: model.displayName,
      providerDisplayName: provider.displayName,
      purpose: req.purpose,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
      status: 'limit_hit',
      requestMeta: req.requestMeta,
      errorMessage: limitCheck.reason,
      correlationId: req.correlationId,
    });
    throw new Error(limitCheck.reason);
  }

  // Get API key
  log.debug('Resolving API key');
  const apiKey = await getApiKey(req.userId, provider.id);
  log.debug('Got API key, creating adapter');
  const adapter = getAdapter(provider);

  const logId = uuidv4();
  const startTime = Date.now();

  try {
    log.debug('Calling adapter.complete()');
    const result = await adapter.complete(apiKey, {
      model: model.modelId,
      messages: messagesWithContext,
      maxTokens: Math.min(req.maxTokens ?? model.maxOutputTokens, model.maxOutputTokens),
      temperature: req.temperature,
      stream: false,
      purpose: req.purpose,
    });

    const durationMs = Date.now() - startTime;
    log.info({ durationMs, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, status: 'ok' }, 'adapter.complete() succeeded');

    // Fire-and-forget — aggregate token metrics
    recordTokenUsage(result.usage.inputTokens, result.usage.outputTokens, req.userId);

    // Fire-and-forget — usage logging must never block the response
    logUsage({
      id: logId,
      userId: req.userId,
      providerId: provider.id,
      modelId: model.modelId,
      modelDisplayName: model.displayName,
      providerDisplayName: provider.displayName,
      purpose: req.purpose,
      usage: result.usage,
      durationMs,
      status: 'ok',
      requestMeta: { ...req.requestMeta, researchPromptInjected: true, researchPromptProvider: provider.id },
      promptMessages: JSON.stringify(messagesWithContext.map(m => ({ role: m.role, content: m.content }))),
      responseText: result.content,
      correlationId: req.correlationId,
    });

    return { ...result, usageLogId: logId };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // Fire-and-forget — don't let logging block error propagation
    if (!errorMessage.includes('limit') && !errorMessage.includes('budget') && !errorMessage.includes('suspended')) {
      logUsage({
        id: logId,
        userId: req.userId,
        providerId: provider.id,
        modelId: model.modelId,
        modelDisplayName: model.displayName,
        providerDisplayName: provider.displayName,
        purpose: req.purpose,
        usage: { inputTokens: 0, outputTokens: 0 },
        durationMs,
        status: 'error',
        requestMeta: req.requestMeta,
        errorMessage,
        promptMessages: JSON.stringify(messagesWithContext.map(m => ({ role: m.role, content: m.content }))),
        correlationId: req.correlationId,
      });
    }

    log.error({ durationMs, err: errorMessage }, 'adapter.complete() failed');
    throw err;
  }
}

/** Streaming LLM completion with full metering */
export async function streamComplete(
  req: GatewayCompletionRequest,
  onChunk: (chunk: LLMStreamChunk) => void,
): Promise<{ usage: LLMUsage; usageLogId: string }> {
  // Validate input length
  const totalInputLength = req.messages.reduce((acc, m) => acc + m.content.length, 0);
  if (totalInputLength > config.maxLlmInputLength) {
    throw new Error(`Input too long (${totalInputLength} chars, max ${config.maxLlmInputLength})`);
  }

  const model = await repos.config.getModel(req.modelDbId);
  if (!model || !model.isEnabled) throw new Error('Model not found or disabled');

  const provider = await repos.config.getProvider(model.providerId);
  if (!provider || !provider.isEnabled) throw new Error('Provider not found or disabled');

  // Inject provider-specific security research system prompt
  const researchPrompt = await getResearchSystemPrompt(provider.id);
  const messagesWithContext = await prependResearchContext(req.messages, provider.id);
  const log = logger.child({ correlationId: req.correlationId, provider: provider.id, model: model.modelId, purpose: req.purpose, userId: req.userId });
  log.info({ researchPromptLen: researchPrompt.length }, 'LLM stream starting');

  const limitCheck = await checkLimits(req.userId);
  if (!limitCheck.allowed) {
    const logId = uuidv4();
    // Fire-and-forget
    logUsage({
      id: logId,
      userId: req.userId,
      providerId: provider.id,
      modelId: model.modelId,
      modelDisplayName: model.displayName,
      providerDisplayName: provider.displayName,
      purpose: req.purpose,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
      status: 'limit_hit',
      requestMeta: req.requestMeta,
      errorMessage: limitCheck.reason,
      correlationId: req.correlationId,
    });
    throw new Error(limitCheck.reason);
  }

  const apiKey = await getApiKey(req.userId, provider.id);
  const adapter = getAdapter(provider);
  const logId = uuidv4();
  const startTime = Date.now();

  try {
    let streamedContent = '';
    const usage = await adapter.streamComplete(
      apiKey,
      {
        model: model.modelId,
        messages: messagesWithContext,
        maxTokens: Math.min(req.maxTokens ?? model.maxOutputTokens, model.maxOutputTokens),
        temperature: req.temperature,
        stream: true,
      },
      (chunk) => {
        if (chunk.content) streamedContent += chunk.content;
        onChunk(chunk);
      },
    );

    const durationMs = Date.now() - startTime;

    // Fire-and-forget — usage logging must never block the response
    logUsage({
      id: logId,
      userId: req.userId,
      providerId: provider.id,
      modelId: model.modelId,
      modelDisplayName: model.displayName,
      providerDisplayName: provider.displayName,
      purpose: req.purpose,
      usage,
      durationMs,
      status: 'ok',
      requestMeta: { ...req.requestMeta, researchPromptInjected: true, researchPromptProvider: provider.id },
      promptMessages: JSON.stringify(messagesWithContext.map(m => ({ role: m.role, content: m.content }))),
      responseText: streamedContent,
      correlationId: req.correlationId,
    });

    return { usage, usageLogId: logId };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    // Fire-and-forget
    logUsage({
      id: logId,
      userId: req.userId,
      providerId: provider.id,
      modelId: model.modelId,
      modelDisplayName: model.displayName,
      providerDisplayName: provider.displayName,
      purpose: req.purpose,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs,
      status: 'error',
      requestMeta: req.requestMeta,
      errorMessage: err instanceof Error ? err.message : 'Unknown error',
      promptMessages: JSON.stringify(messagesWithContext.map(m => ({ role: m.role, content: m.content }))),
      correlationId: req.correlationId,
    });
    throw err;
  }
}

// === Query Helpers ===

export async function getAvailableModels(): Promise<(ModelDoc & { providerName: string; providerDisplayName: string })[]> {
  const models = await repos.config.getModelsWithProviders(true);
  // Filter out disabled providers' models (getModelsWithProviders already checks enabled)
  return models;
}

export async function getProviders(): Promise<ProviderDoc[]> {
  const providers = await repos.config.getAllProviders(true);
  return providers.filter(p => p.id !== 'github');
}

export async function hasActiveKey(userId: string, providerId: string): Promise<boolean> {
  const count = await repos.apiKeys.countActive(userId, providerId);
  return count > 0;
}

export { getUserLimits };
