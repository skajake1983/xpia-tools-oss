// ── Mock: Usage Repository ──────────────────────────────────────────────

import type { IUsageRepo, UsageLogDoc, UsageSummary, DailyUsage, ModelUsage } from '../types';

export class MockUsageRepo implements IUsageRepo {
  private docs: UsageLogDoc[] = [];

  async create(doc: UsageLogDoc): Promise<void> {
    this.docs.push({ ...doc });
  }

  async getById(id: string, userId: string): Promise<UsageLogDoc | undefined> {
    return this.docs.find(d => d.id === id && d.userId === userId);
  }

  private inRange(docs: UsageLogDoc[], startDate: string, endDate: string): UsageLogDoc[] {
    return docs.filter(d => d.createdAt >= startDate && d.createdAt <= endDate);
  }

  async getSummary(userId: string, startDate: string, endDate: string): Promise<UsageSummary> {
    const filtered = this.inRange(this.docs.filter(d => d.userId === userId), startDate, endDate);
    return {
      totalCalls: filtered.length,
      totalInputTokens: filtered.reduce((s, d) => s + d.inputTokens, 0),
      totalOutputTokens: filtered.reduce((s, d) => s + d.outputTokens, 0),
    };
  }

  async getSystemSummary(startDate: string, endDate: string): Promise<UsageSummary> {
    const filtered = this.inRange(this.docs, startDate, endDate);
    return {
      totalCalls: filtered.length,
      totalInputTokens: filtered.reduce((s, d) => s + d.inputTokens, 0),
      totalOutputTokens: filtered.reduce((s, d) => s + d.outputTokens, 0),
    };
  }

  async getDailyUsage(userId: string, startDate: string): Promise<DailyUsage[]> {
    const filtered = this.docs.filter(d => d.userId === userId && d.createdAt >= startDate);
    const map = new Map<string, DailyUsage>();
    for (const d of filtered) {
      const date = d.createdAt.slice(0, 10);
      const existing = map.get(date) ?? { date, calls: 0, inputTokens: 0, outputTokens: 0 };
      existing.calls++;
      existing.inputTokens += d.inputTokens;
      existing.outputTokens += d.outputTokens;
      map.set(date, existing);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async getModelUsage(userId: string, startDate: string, endDate: string): Promise<ModelUsage[]> {
    const filtered = this.inRange(this.docs.filter(d => d.userId === userId), startDate, endDate);
    const map = new Map<string, ModelUsage>();
    for (const d of filtered) {
      const existing = map.get(d.modelDbId) ?? { modelDbId: d.modelDbId, modelDisplayName: d.modelDisplayName, providerDisplayName: d.providerDisplayName, calls: 0, inputTokens: 0, outputTokens: 0 };
      existing.calls++;
      existing.inputTokens += d.inputTokens;
      existing.outputTokens += d.outputTokens;
      map.set(d.modelDbId, existing);
    }
    return [...map.values()];
  }

  async getRecent(userId: string, limit = 50): Promise<UsageLogDoc[]> {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    return this.docs
      .filter(d => d.userId === userId && d.createdAt >= since)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async getAllUsersSummary(startDate: string, endDate: string): Promise<{ userId: string; email: string; totalCalls: number; totalInputTokens: number; totalOutputTokens: number }[]> {
    const filtered = this.inRange(this.docs, startDate, endDate);
    const map = new Map<string, { userId: string; totalCalls: number; totalInputTokens: number; totalOutputTokens: number }>();
    for (const d of filtered) {
      const ex = map.get(d.userId) ?? { userId: d.userId, totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0 };
      ex.totalCalls++;
      ex.totalInputTokens += d.inputTokens;
      ex.totalOutputTokens += d.outputTokens;
      map.set(d.userId, ex);
    }
    return [...map.values()].map(r => ({ ...r, email: '' }));
  }

  async getTotalTokensSince(userId: string, since: string): Promise<number> {
    return this.docs
      .filter(d => d.userId === userId && d.createdAt >= since)
      .reduce((s, d) => s + d.inputTokens + d.outputTokens, 0);
  }

  async countByModel(modelDbId: string): Promise<number> {
    return this.docs.filter(d => d.modelDbId === modelDbId).length;
  }

  async deleteOlderThan(before: string): Promise<number> {
    const len = this.docs.length;
    this.docs = this.docs.filter(d => d.createdAt >= before);
    return len - this.docs.length;
  }

  /** Test helper */
  reset(): void { this.docs = []; }
}
