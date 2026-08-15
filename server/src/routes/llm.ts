/**
 * LLM routes — enhance endpoints, model listing
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as gateway from '../services/llm/gateway';
import { LLMMessage } from '../services/llm/adapters/types';
import { ACTION_MAX_TOKENS, ACTION_TEMPERATURE, getPrompt } from '../config/prompts';
import { recordCustomAction } from '../services/metrics.service';

const router = Router();
router.use(authMiddleware);

// === List available models ===

router.get('/models', async (req: AuthRequest, res: Response) => {
  const models = await gateway.getAvailableModels();
  // Only return models whose providers the requesting user has a key for
  const withKeys: typeof models = [];
  for (const m of models) {
    if (await gateway.hasActiveKey(req.user!.userId, m.providerId)) {
      withKeys.push(m);
    }
  }
  res.json({
    models: withKeys.map(m => ({
      id: m.id,
      provider_id: m.providerId,
      model_id: m.modelId,
      display_name: m.displayName,
      max_output_tokens: m.maxOutputTokens,
      is_enabled: m.isEnabled,
      provider_name: m.providerName,
      provider_display_name: m.providerDisplayName,
    })),
  });
});

// === Non-streaming completion ===

const completionSchema = z.object({
  modelId: z.string().min(1).max(100),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1).max(50000),
  })).min(1).max(100),
  purpose: z.enum(['document_enhance', 'payload_enhance', 'page_enhance', 'custom_action']),
  maxTokens: z.number().int().min(1).max(100000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

router.post('/complete', async (req: AuthRequest, res: Response) => {
  try {
    const { modelId, messages, purpose, maxTokens, temperature } = completionSchema.parse(req.body);

    const result = await gateway.complete({
      userId: req.user!.userId,
      modelDbId: modelId,
      messages: messages as LLMMessage[],
      purpose,
      maxTokens,
      temperature,
      correlationId: req.correlationId,
    });

    res.json({
      content: result.content,
      model: result.model,
      usage: result.usage,
      finishReason: result.finishReason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Completion failed';
    const status = message.includes('limit') || message.includes('budget') || message.includes('suspended') ? 429 : 400;
    res.status(status).json({ error: message });
  }
});

// === Streaming completion (SSE) ===

const streamSchema = z.object({
  modelId: z.string().min(1).max(100),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1).max(50000),
  })).min(1).max(100),
  purpose: z.enum(['document_enhance', 'payload_enhance', 'page_enhance', 'custom_action']),
  maxTokens: z.number().int().min(1).max(100000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

router.post('/stream', async (req: AuthRequest, res: Response) => {
  try {
    const { modelId, messages, purpose, maxTokens, temperature } = streamSchema.parse(req.body);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const result = await gateway.streamComplete(
      {
        userId: req.user!.userId,
        modelDbId: modelId,
        messages: messages as LLMMessage[],
        purpose,
        maxTokens,
        temperature,
        correlationId: req.correlationId,
      },
      (chunk) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      },
    );

    // Send final usage summary
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: 'usage', usage: result.usage })}\n\n`);
      res.end();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stream failed';
    if (!res.headersSent) {
      const status = message.includes('limit') || message.includes('budget') || message.includes('suspended') ? 429 : 400;
      res.status(status).json({ error: message });
    } else if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: message, done: true })}\n\n`);
      res.end();
    }
  }
});

// === Quick AI action — used by document generator, payload generator, etc. ===

const aiActionSchema = z.object({
  modelId: z.string().min(1).max(100),
  prompt: z.string().min(1).max(5000),
  purpose: z.enum(['document_enhance', 'payload_enhance', 'page_enhance', 'custom_action']),
  context: z.string().max(10000).optional(),
});

router.post('/action', async (req: AuthRequest, res: Response) => {
  try {
    const { modelId, prompt, purpose, context } = aiActionSchema.parse(req.body);

    const messages: LLMMessage[] = [];
    // Purpose-specific system prompts (research framing is injected automatically by the gateway)
    messages.push({
      role: 'system',
      content: (await getPrompt(`action.${purpose}`)) || (await getPrompt('action.page_enhance')),
    });

    if (context) {
      messages.push({ role: 'user', content: `Context: ${context}\n\n${prompt}` });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    const result = await gateway.complete({
      userId: req.user!.userId,
      modelDbId: modelId,
      messages,
      purpose,
      maxTokens: ACTION_MAX_TOKENS,
      temperature: ACTION_TEMPERATURE,
      correlationId: req.correlationId,
    });

    if (purpose === 'custom_action') recordCustomAction();

    res.json({
      content: result.content,
      usage: result.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Action failed';
    const status = message.includes('limit') || message.includes('budget') || message.includes('suspended') ? 429 : 400;
    res.status(status).json({ error: message });
  }
});

export default router;
