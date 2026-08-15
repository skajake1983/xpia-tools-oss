// ── Platform Metrics Service ────────────────────────────────────────────
// Maintains running aggregate counters across all users.
// Stored as a single MetricsDoc in the config container (id: 'platform_metrics').
// All increments are fire-and-forget to avoid impacting request latency.

import repos from '../db/repos';
import type { MetricsDoc, MonthlyMetricsSnapshot } from '../db/repositories/types';
import logger from '../logger';

const METRICS_ID = 'platform_metrics';

function emptyMonthlySnapshot(): MonthlyMetricsSnapshot {
  return {
    tokensIn: 0,
    tokensOut: 0,
    documents: 0,
    images: 0,
    qrCodes: 0,
    payloads: 0,
    webPages: 0,
    customActions: 0,
    newUsers: 0,
    activeUserIds: [],
  };
}

function emptyMetrics(): MetricsDoc {
  return {
    id: METRICS_ID,
    type: 'metrics',
    totalPages: 0,
    totalDocuments: 0,
    documentsByType: {},
    totalPayloads: 0,
    payloadsByFormat: {},
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalQrCodes: 0,
    totalImages: 0,
    totalCustomActions: 0,
    monthly: {},
    updatedAt: new Date().toISOString(),
  };
}

async function load(): Promise<MetricsDoc> {
  const doc = await repos.config.getById<MetricsDoc>(METRICS_ID);
  if (!doc) return emptyMetrics();
  // Backfill fields added after initial schema
  doc.totalTokensIn ??= 0;
  doc.totalTokensOut ??= 0;
  doc.totalQrCodes ??= 0;
  doc.totalImages ??= 0;
  doc.totalCustomActions ??= 0;
  doc.monthly ??= {};
  return doc;
}

async function save(doc: MetricsDoc): Promise<void> {
  doc.updatedAt = new Date().toISOString();
  await repos.config.upsert(doc);
}

function monthKey(date?: Date): string {
  const d = date ?? new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function ensureMonth(doc: MetricsDoc, key: string): MonthlyMetricsSnapshot {
  if (!doc.monthly[key]) doc.monthly[key] = emptyMonthlySnapshot();
  return doc.monthly[key];
}

/** Fire-and-forget wrapper that swallows errors */
function fireAndForget(label: string, fn: (m: MetricsDoc) => void): void {
  (async () => {
    try {
      const m = await load();
      fn(m);
      await save(m);
    } catch (err) {
      logger.error({ err }, `Failed to record metric: ${label}`);
    }
  })();
}

// ── Recording Functions ──────────────────────────────────────────────

/** Increment total pages counter by 1 */
export function recordPageCreated(): void {
  fireAndForget('page', (m) => {
    m.totalPages += 1;
    ensureMonth(m, monthKey()).webPages += 1;
  });
}

/** Increment total documents counter and per-docType counter */
export function recordDocumentGenerated(docType: string): void {
  fireAndForget('document', (m) => {
    m.totalDocuments += 1;
    m.documentsByType[docType] = (m.documentsByType[docType] || 0) + 1;
    const mo = ensureMonth(m, monthKey());
    if (docType === 'png' || docType === 'svg' || docType === 'jpg' || docType === 'webp' || docType === 'gif') {
      m.totalImages += 1;
      mo.images += 1;
    } else if (docType === 'qr') {
      m.totalQrCodes += 1;
      mo.qrCodes += 1;
    } else {
      mo.documents += 1;
    }
  });
}

/** Increment total payloads counter and per-format counter */
export function recordPayloadsGenerated(count: number, format: string): void {
  fireAndForget('payload', (m) => {
    m.totalPayloads += count;
    m.payloadsByFormat[format] = (m.payloadsByFormat[format] || 0) + count;
    ensureMonth(m, monthKey()).payloads += count;
  });
}

/** Record LLM token usage and mark the user as active this month */
export function recordTokenUsage(tokensIn: number, tokensOut: number, userId: string): void {
  fireAndForget('tokens', (m) => {
    m.totalTokensIn += tokensIn;
    m.totalTokensOut += tokensOut;
    const mo = ensureMonth(m, monthKey());
    mo.tokensIn += tokensIn;
    mo.tokensOut += tokensOut;
    if (!mo.activeUserIds.includes(userId)) {
      mo.activeUserIds.push(userId);
    }
  });
}

/** Record a custom action execution */
export function recordCustomAction(): void {
  fireAndForget('customAction', (m) => {
    m.totalCustomActions += 1;
    ensureMonth(m, monthKey()).customActions += 1;
  });
}

/** Record a new user registration */
export function recordNewUser(): void {
  fireAndForget('newUser', (m) => {
    ensureMonth(m, monthKey()).newUsers += 1;
  });
}

// ── Read ─────────────────────────────────────────────────────────────

/** Read current metrics */
export async function getMetrics(): Promise<MetricsDoc> {
  return load();
}
