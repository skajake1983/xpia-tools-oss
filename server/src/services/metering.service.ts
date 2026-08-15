/**
 * Metering Service
 *
 * Provides usage aggregation and admin usage queries.
 */

import repos from '../db/repos';
import type { UsageSummary, DailyUsage, ModelUsage } from '../db/repositories/types';

export { UsageSummary, DailyUsage, ModelUsage };

/** Delete usage log entries older than the given number of days. */
export async function cleanupOldUsageLogs(days: number = 30): Promise<number> {
  const before = new Date(Date.now() - days * 86_400_000).toISOString();
  return repos.usage.deleteOlderThan(before);
}

// === User-facing usage queries ===

export async function getUserUsageSummary(userId: string, periodStart: string, periodEnd: string): Promise<UsageSummary> {
  return repos.usage.getSummary(userId, periodStart, periodEnd);
}

export async function getUserDailyUsage(userId: string, days: number = 30): Promise<DailyUsage[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  return repos.usage.getDailyUsage(userId, since.toISOString());
}

export async function getUserModelUsage(userId: string, periodStart: string, periodEnd: string): Promise<unknown[]> {
  const models = await repos.usage.getModelUsage(userId, periodStart, periodEnd);
  return models.map(m => ({
    modelId: m.modelDbId,
    displayName: m.modelDisplayName || m.modelDbId,
    providerDisplayName: m.providerDisplayName,
    calls: m.calls,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
  }));
}

export async function getUserRecentUsage(userId: string, limit: number = 50): Promise<unknown[]> {
  const logs = await repos.usage.getRecent(userId, limit);
  return logs.map(l => ({
    ...l,
    created_at: l.createdAt,
    input_tokens: l.inputTokens,
    output_tokens: l.outputTokens,
    duration_ms: l.durationMs,
    model_display_name: l.modelDisplayName,
    provider_display_name: l.providerDisplayName,
    model_db_id: l.modelDbId,
    model_id: l.modelDbId,
    provider_id: l.providerId,
    error_message: l.errorMessage,
    prompt_messages: l.promptMessages,
    response_text: l.responseText,
    request_meta: l.requestMeta,
  }));
}

export async function getUsageLogDetail(userId: string, logId: string): Promise<unknown | undefined> {
  const log = await repos.usage.getById(logId, userId);
  if (!log) return undefined;
  return {
    ...log,
    created_at: log.createdAt,
    input_tokens: log.inputTokens,
    output_tokens: log.outputTokens,
    duration_ms: log.durationMs,
    model_display_name: log.modelDisplayName,
    provider_display_name: log.providerDisplayName,
    model_db_id: log.modelDbId,
    model_id: log.modelDbId,
    provider_id: log.providerId,
    error_message: log.errorMessage,
    prompt_messages: log.promptMessages,
    response_text: log.responseText,
    request_meta: log.requestMeta,
  };
}

export async function getUserCurrentPeriod(userId: string): Promise<{ daily: UsageSummary; monthly: UsageSummary }> {
  const today = new Date();
  const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1));

  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));

  return {
    daily: await repos.usage.getSummary(userId, dayStart.toISOString(), dayEnd.toISOString()),
    monthly: await repos.usage.getSummary(userId, monthStart.toISOString(), monthEnd.toISOString()),
  };
}

// === Admin-facing usage queries ===

export async function getAllUsersUsageSummary(periodStart: string, periodEnd: string): Promise<(UsageSummary & { userId: string; email: string })[]> {
  const summaries = await repos.usage.getAllUsersSummary(periodStart, periodEnd);
  const users = await repos.users.list();
  const userMap = new Map(users.map(u => [u.id, u.email]));
  return summaries.map(s => ({ ...s, email: userMap.get(s.userId) || s.email }));
}

export async function getSystemWideSummary(periodStart: string, periodEnd: string): Promise<UsageSummary> {
  return repos.usage.getSystemSummary(periodStart, periodEnd);
}
