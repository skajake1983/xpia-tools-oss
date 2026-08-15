// ── Cosmos: API Key Repository ──────────────────────────────────────────

import { Container } from '@azure/cosmos';
import type { IApiKeyRepo, ApiKeyDoc } from '../types';

export class CosmosApiKeyRepo implements IApiKeyRepo {
  constructor(private container: Container) {}

  async getById(id: string, userId: string): Promise<ApiKeyDoc | undefined> {
    try {
      const { resource } = await this.container.item(id, userId).read<ApiKeyDoc>();
      return resource ?? undefined;
    } catch (e: any) {
      if (e.code === 404) return undefined;
      throw e;
    }
  }

  async getActiveKey(userId: string, providerId: string): Promise<ApiKeyDoc | undefined> {
    const { resources } = await this.container.items
      .query<ApiKeyDoc>({
        query: 'SELECT * FROM c WHERE c.userId = @uid AND c.providerId = @pid AND c.isActive = true',
        parameters: [
          { name: '@uid', value: userId },
          { name: '@pid', value: providerId },
        ],
      })
      .fetchAll();
    return resources[0] ?? undefined;
  }

  async listByUser(userId: string): Promise<(ApiKeyDoc & { providerName?: string; providerIsEnabled?: boolean })[]> {
    const { resources } = await this.container.items
      .query<ApiKeyDoc>({
        query: 'SELECT * FROM c WHERE c.userId = @uid AND c.isActive = true ORDER BY c.createdAt DESC',
        parameters: [{ name: '@uid', value: userId }],
      })
      .fetchAll();
    return resources;
  }

  async create(doc: ApiKeyDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async deleteByUserProvider(userId: string, providerId: string): Promise<void> {
    const { resources } = await this.container.items
      .query<ApiKeyDoc>({
        query: 'SELECT * FROM c WHERE c.userId = @uid AND c.providerId = @pid',
        parameters: [
          { name: '@uid', value: userId },
          { name: '@pid', value: providerId },
        ],
      })
      .fetchAll();

    for (const key of resources) {
      try { await this.container.item(key.id, userId).delete(); } catch (e: any) { if (e.code !== 404) throw e; }
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    try {
      await this.container.item(id, userId).delete();
    } catch (e: any) {
      if (e.code !== 404) throw e;
    }
  }

  async countActive(userId: string, providerId: string): Promise<number> {
    const { resources } = await this.container.items
      .query<number>({
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.userId = @uid AND c.providerId = @pid AND c.isActive = true',
        parameters: [
          { name: '@uid', value: userId },
          { name: '@pid', value: providerId },
        ],
      })
      .fetchAll();
    return resources[0] ?? 0;
  }

  async getAllActive(): Promise<ApiKeyDoc[]> {
    const { resources } = await this.container.items
      .query<ApiKeyDoc>({ query: 'SELECT * FROM c WHERE c.isActive = true' })
      .fetchAll();
    return resources;
  }

  async update(id: string, userId: string, fields: Partial<ApiKeyDoc>): Promise<void> {
    const existing = await this.getById(id, userId);
    if (!existing) return;
    await this.container.item(id, userId).replace({ ...existing, ...fields, id, userId });
  }
}
