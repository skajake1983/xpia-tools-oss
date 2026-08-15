// ── Cosmos: Usage Repository ────────────────────────────────────────────

import { Container } from '@azure/cosmos';
import type { IUsageRepo, UsageLogDoc, UsageSummary, DailyUsage, ModelUsage } from '../types';

export class CosmosUsageRepo implements IUsageRepo {
  constructor(private container: Container) {}

  async create(doc: UsageLogDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async getById(id: string, userId: string): Promise<UsageLogDoc | undefined> {
    try {
      const { resource } = await this.container.item(id, userId).read<UsageLogDoc>();
      return resource ?? undefined;
    } catch (e: any) {
      if (e.code === 404) return undefined;
      throw e;
    }
  }

  async getSummary(userId: string, startDate: string, endDate: string): Promise<UsageSummary> {
    const { resources } = await this.container.items
      .query<{ totalCalls: number; totalInputTokens: number; totalOutputTokens: number }>({
        query: `SELECT
          COUNT(1) AS totalCalls,
          SUM(c.inputTokens) AS totalInputTokens,
          SUM(c.outputTokens) AS totalOutputTokens
        FROM c
        WHERE c.userId = @uid AND c.createdAt >= @start AND c.createdAt <= @end`,
        parameters: [
          { name: '@uid', value: userId },
          { name: '@start', value: startDate },
          { name: '@end', value: endDate },
        ],
      })
      .fetchAll();
    const r = resources[0];
    return {
      totalCalls: r?.totalCalls ?? 0,
      totalInputTokens: r?.totalInputTokens ?? 0,
      totalOutputTokens: r?.totalOutputTokens ?? 0,
    };
  }

  async getSystemSummary(startDate: string, endDate: string): Promise<UsageSummary> {
    const { resources } = await this.container.items
      .query<{ totalCalls: number; totalInputTokens: number; totalOutputTokens: number }>({
        query: `SELECT
          COUNT(1) AS totalCalls,
          SUM(c.inputTokens) AS totalInputTokens,
          SUM(c.outputTokens) AS totalOutputTokens
        FROM c
        WHERE c.createdAt >= @start AND c.createdAt <= @end`,
        parameters: [
          { name: '@start', value: startDate },
          { name: '@end', value: endDate },
        ],
      })
      .fetchAll();
    const r = resources[0];
    return {
      totalCalls: r?.totalCalls ?? 0,
      totalInputTokens: r?.totalInputTokens ?? 0,
      totalOutputTokens: r?.totalOutputTokens ?? 0,
    };
  }

  async getDailyUsage(userId: string, startDate: string): Promise<DailyUsage[]> {
    // CosmosDB doesn't have DATE extract — use SUBSTRING on ISO string (YYYY-MM-DD)
    const { resources } = await this.container.items
      .query<DailyUsage>({
        query: `SELECT
          SUBSTRING(c.createdAt, 0, 10) AS date,
          COUNT(1) AS calls,
          SUM(c.inputTokens) AS inputTokens,
          SUM(c.outputTokens) AS outputTokens
        FROM c
        WHERE c.userId = @uid AND c.createdAt >= @start
        GROUP BY SUBSTRING(c.createdAt, 0, 10)`,
        parameters: [
          { name: '@uid', value: userId },
          { name: '@start', value: startDate },
        ],
      })
      .fetchAll();
    return resources.sort((a, b) => a.date.localeCompare(b.date));
  }

  async getModelUsage(userId: string, startDate: string, endDate: string): Promise<ModelUsage[]> {
    const { resources } = await this.container.items
      .query<ModelUsage>({
        query: `SELECT
          c.modelDbId,
          c.modelDisplayName,
          c.providerDisplayName,
          COUNT(1) AS calls,
          SUM(c.inputTokens) AS inputTokens,
          SUM(c.outputTokens) AS outputTokens
        FROM c
        WHERE c.userId = @uid AND c.createdAt >= @start AND c.createdAt <= @end
        GROUP BY c.modelDbId, c.modelDisplayName, c.providerDisplayName`,
        parameters: [
          { name: '@uid', value: userId },
          { name: '@start', value: startDate },
          { name: '@end', value: endDate },
        ],
      })
      .fetchAll();
    return resources;
  }

  async getRecent(userId: string, limit = 50): Promise<UsageLogDoc[]> {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { resources } = await this.container.items
      .query<UsageLogDoc>({
        query: `SELECT TOP @limit * FROM c WHERE c.userId = @uid AND c.createdAt >= @since ORDER BY c.createdAt DESC`,
        parameters: [
          { name: '@uid', value: userId },
          { name: '@limit', value: limit },
          { name: '@since', value: since },
        ],
      })
      .fetchAll();
    return resources;
  }

  async getAllUsersSummary(startDate: string, endDate: string): Promise<{ userId: string; email: string; totalCalls: number; totalInputTokens: number; totalOutputTokens: number }[]> {
    // Cross-partition aggregate — email is not on usage docs.
    // Return userId only; the admin service layer joins with user repo.
    const { resources } = await this.container.items
      .query<{ userId: string; totalCalls: number; totalInputTokens: number; totalOutputTokens: number }>({
        query: `SELECT
          c.userId,
          COUNT(1) AS totalCalls,
          SUM(c.inputTokens) AS totalInputTokens,
          SUM(c.outputTokens) AS totalOutputTokens
        FROM c
        WHERE c.createdAt >= @start AND c.createdAt <= @end
        GROUP BY c.userId`,
        parameters: [
          { name: '@start', value: startDate },
          { name: '@end', value: endDate },
        ],
      })
      .fetchAll();
    return resources.map(r => ({ ...r, email: '' }));
  }

  async getTotalTokensSince(userId: string, since: string): Promise<number> {
    const { resources } = await this.container.items
      .query<number>({
        query: `SELECT VALUE SUM(c.inputTokens + c.outputTokens) FROM c WHERE c.userId = @uid AND c.createdAt >= @since`,
        parameters: [
          { name: '@uid', value: userId },
          { name: '@since', value: since },
        ],
      })
      .fetchAll();
    return resources[0] ?? 0;
  }

  async countByModel(modelDbId: string): Promise<number> {
    const { resources } = await this.container.items
      .query<number>({
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.modelDbId = @mid',
        parameters: [{ name: '@mid', value: modelDbId }],
      })
      .fetchAll();
    return resources[0] ?? 0;
  }

  async deleteOlderThan(before: string): Promise<number> {
    // Find old entries (cross-partition) then delete individually
    const { resources } = await this.container.items
      .query<{ id: string; userId: string }>({
        query: 'SELECT c.id, c.userId FROM c WHERE c.createdAt < @before',
        parameters: [{ name: '@before', value: before }],
      })
      .fetchAll();
    let deleted = 0;
    for (const doc of resources) {
      try {
        await this.container.item(doc.id, doc.userId).delete();
        deleted++;
      } catch { /* skip if already deleted */ }
    }
    return deleted;
  }
}
