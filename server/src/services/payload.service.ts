import { v4 as uuidv4 } from 'uuid';
import {
  PAYLOAD_TEMPLATES,
  ACTION_TARGETS,
  WRAPPER_PHRASES,
  EVASION_MODIFIERS,
  PayloadTemplate,
} from '../data/payload-templates';
import { XPIA_CATEGORIES, XPIACategory } from '../data/xpia-techniques';
import repos from '../db/repos';
import * as gateway from './llm/gateway';
import { recordPayloadsGenerated } from './metrics.service';
import { PAYLOAD_PROMPTS, SEVERITY_INSTRUCTIONS, STEALTH_INSTRUCTIONS, interpolate } from '../config/prompts';
import { getUserPrompt } from './prompt-template.service';
import logger from '../logger';

/** Seeded PRNG (mulberry32) for reproducible payload generation */
function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandom<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export interface GeneratePayloadsOptions {
  userId: string;
  categories?: XPIACategory[];
  severities?: ('low' | 'medium' | 'high' | 'critical')[];
  count: number;
  seed?: number;
  format: 'json' | 'text';
  evasionModifier?: string;
  /** LLM model DB id — when provided, LLM auto-enhances all payloads */
  modelId?: string;
  /** Custom action to inject instead of random ACTION_TARGETS */
  customAction?: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** Stealth level — controls how disguised the payload wording is */
  stealth?: 'low' | 'medium' | 'high';
}

export interface GeneratedPayload {
  id: string;
  templateId: string;
  templateName: string;
  category: string;
  categoryLabel: string;
  severity: string;
  payload: string;
  evasion: string;
}

export async function generatePayloads(options: GeneratePayloadsOptions): Promise<{
  payloads: GeneratedPayload[];
  metadata: {
    count: number;
    seed: number;
    categories: string[];
    severities: string[];
    format: string;
    evasion: string;
  };
  formatted: string;
}> {
  const seed = options.seed ?? Math.floor(Math.random() * 2147483647);
  const rng = seededRandom(seed);
  const evasionMod = EVASION_MODIFIERS.find((m) => m.id === (options.evasionModifier || 'none')) || EVASION_MODIFIERS[0];

  // Filter templates by selected categories and severities
  let templates = [...PAYLOAD_TEMPLATES];
  if (options.categories?.length) {
    templates = templates.filter((t) => options.categories!.includes(t.category as XPIACategory));
  }
  if (options.severities?.length) {
    templates = templates.filter((t) => options.severities!.includes(t.severity));
  }

  if (templates.length === 0) {
    templates = [...PAYLOAD_TEMPLATES];
  }

  const payloads: GeneratedPayload[] = [];

  for (let i = 0; i < options.count; i++) {
    const template = pickRandom(templates, rng);
    const action = options.customAction || pickRandom(ACTION_TARGETS, rng);
    const wrapper = pickRandom(WRAPPER_PHRASES, rng);

    let payload = template.template;

    // Replace variables
    payload = payload.replace(/\{\{ACTION\}\}/g, action);
    payload = payload.replace(/\{\{WRAPPER\}\}/g, wrapper);
    payload = payload.replace(/\{\{ENCODED_ACTION\}\}/g, Buffer.from(action).toString('base64'));
    payload = payload.replace(/\{\{BASE64_ACTION\}\}/g, Buffer.from(action).toString('base64'));
    payload = payload.replace(/\{\{EXFIL_DOMAIN\}\}/g, 'attacker.example');
    payload = payload.replace(/\{\{TOOL_NAME\}\}/g, 'send_message');
    payload = payload.replace(/\{\{PARAM\}\}/g, 'content');
    payload = payload.replace(/\{\{VALUE\}\}/g, action);
    payload = payload.replace(/\{\{ATTACKER_DOMAIN\}\}/g, 'attacker.example');
    payload = payload.replace(/\{\{TRIGGER_WORD\}\}/g, 'activate');

    // Apply evasion modifier
    if (evasionMod.id !== 'none') {
      payload = evasionMod.apply(payload);
    }

    const categoryInfo = XPIA_CATEGORIES[template.category as XPIACategory];

    payloads.push({
      id: uuidv4(),
      templateId: template.id,
      templateName: template.name,
      category: template.category,
      categoryLabel: categoryInfo?.label || template.category,
      severity: template.severity,
      payload,
      evasion: evasionMod.name,
    });
  }

  // Record generation — insert after formatting so we can store final content
  const genId = uuidv4();
  const cats = options.categories?.join(',') || 'all';
  const sevs = options.severities?.join(',') || 'all';

  // LLM auto-enhance all payloads when modelId is provided
  if (options.modelId) {
    const payloadSummary = payloads.map((p, i) =>
      `[${i}] Category: ${p.categoryLabel} | Severity: ${p.severity} | Evasion: ${p.evasion}\n${p.payload}`
    ).join('\n---\n');

    const result = await gateway.complete({
      userId: options.userId,
      modelDbId: options.modelId,
      messages: [
        {
          role: 'system',
          content: await getUserPrompt(options.userId, 'payload', 'system'),
        },
        { role: 'user', content: interpolate(await getUserPrompt(options.userId, 'payload', 'user'), {
          PAYLOAD_COUNT: String(payloads.length),
          PAYLOAD_SUMMARY: payloadSummary,
          SEVERITY_INSTRUCTION: SEVERITY_INSTRUCTIONS[options.severities?.[0] || 'medium'] || SEVERITY_INSTRUCTIONS.medium,
          STEALTH_INSTRUCTION: STEALTH_INSTRUCTIONS[options.stealth || 'medium'] || STEALTH_INSTRUCTIONS.medium,
        }) },
      ],
      purpose: 'payload_enhance',
      maxTokens: Math.min(payloads.length * PAYLOAD_PROMPTS.maxTokensPerPayload, PAYLOAD_PROMPTS.maxTokensCap),
      temperature: PAYLOAD_PROMPTS.temperature,
      correlationId: options.correlationId,
    });

    // Parse enhanced payloads from LLM response
    // Strip any disclaimer/preamble text before the first [0] marker
    const firstMarker = result.content.indexOf('[0]');
    const cleanContent = firstMarker > 0 ? result.content.slice(firstMarker) : result.content;
    const enhanced = cleanContent.split(/\[\d+\]\s*\n?/).filter(Boolean);

    if (enhanced.length < payloads.length) {
      logger.warn({ expected: payloads.length, got: enhanced.length, modelId: options.modelId, correlationId: options.correlationId }, 'LLM returned fewer enhanced payloads than expected');
    }

    for (let i = 0; i < Math.min(enhanced.length, payloads.length); i++) {
      const trimmed = enhanced[i].trim().replace(/\n---$/, '').trim();
      if (trimmed.length > 10) {
        payloads[i].payload = trimmed;
      }
    }
  }

  // Format output
  let formatted: string;
  if (options.format === 'json') {
    formatted = JSON.stringify({ seed, evasion: evasionMod.name, payloads }, null, 2);
  } else {
    formatted = payloads
      .map(
        (p, idx) =>
          `=== Payload ${idx + 1} ===\nTemplate: ${p.templateName}\nCategory: ${p.categoryLabel}\nSeverity: ${p.severity}\nEvasion: ${p.evasion}\n\n${p.payload}\n`,
      )
      .join('\n');
  }

  // Store finalized content in history
  await repos.content.createPayload({
    id: genId, userId: options.userId, kind: 'payload',
    category: cats, severity: sevs, payloadCount: options.count,
    seed, format: options.format, content: formatted,
    createdAt: new Date().toISOString(),
    evasionModifier: evasionMod.id,
    modelId: options.modelId,
    customAction: options.customAction,
    stealth: options.stealth,
  });

  recordPayloadsGenerated(options.count, options.format);

  return {
    payloads,
    metadata: {
      count: options.count,
      seed,
      categories: options.categories || [],
      severities: options.severities || [],
      format: options.format,
      evasion: evasionMod.name,
    },
    formatted,
  };
}

export function getAvailableCategories(): { id: string; label: string; description: string; templateCount: number }[] {
  return Object.entries(XPIA_CATEGORIES).map(([id, info]) => ({
    id,
    label: info.label,
    description: info.description,
    templateCount: PAYLOAD_TEMPLATES.filter((t) => t.category === id).length,
  }));
}

export function getAvailableEvasions(): { id: string; name: string }[] {
  return EVASION_MODIFIERS.map((m) => ({ id: m.id, name: m.name }));
}

export async function getPayloadHistory(userId: string): Promise<unknown[]> {
  const docs = await repos.content.listPayloads(userId, 50);
  return docs.map(d => ({
    id: d.id, user_id: d.userId, category: d.category, severity: d.severity,
    payload_count: d.payloadCount, seed: d.seed, format: d.format, created_at: d.createdAt,
    evasion_modifier: d.evasionModifier, model_id: d.modelId,
    custom_action: d.customAction, stealth: d.stealth,
  }));
}

export async function getPayloadById(id: string, userId: string): Promise<{ content: string; format: string; seed: number } | null> {
  const doc = await repos.content.getPayload(id, userId);
  if (!doc || !doc.content) return null;
  return { content: doc.content, format: doc.format, seed: doc.seed ?? 0 };
}

export async function cleanupOldPayloads(days: number = 7): Promise<number> {
  const before = new Date(Date.now() - days * 86400000).toISOString();
  return repos.content.deleteOldPayloads(before);
}
