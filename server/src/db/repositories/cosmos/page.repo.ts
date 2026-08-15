// ── Cosmos: Page Repository ─────────────────────────────────────────────

import { Container } from '@azure/cosmos';
import type { IPageRepo, PageDoc } from '../types';

export class CosmosPageRepo implements IPageRepo {
  constructor(private container: Container) {}

  async create(doc: PageDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async getById(id: string, userId: string): Promise<PageDoc | undefined> {
    try {
      const { resource } = await this.container.item(id, userId).read<PageDoc>();
      return resource ?? undefined;
    } catch (e: any) {
      if (e.code === 404) return undefined;
      throw e;
    }
  }

  async getBySlug(slug: string): Promise<PageDoc | undefined> {
    const { resources } = await this.container.items
      .query<PageDoc>({
        query: 'SELECT * FROM c WHERE c.slug = @slug AND c.isActive = true',
        parameters: [{ name: '@slug', value: slug }],
      })
      .fetchAll();
    return resources[0] ?? undefined;
  }

  async listByUser(userId: string): Promise<PageDoc[]> {
    const { resources } = await this.container.items
      .query<PageDoc>({
        query: 'SELECT * FROM c WHERE c.userId = @uid ORDER BY c.createdAt DESC',
        parameters: [{ name: '@uid', value: userId }],
      })
      .fetchAll();
    return resources;
  }

  async countByUser(userId: string): Promise<number> {
    const { resources } = await this.container.items
      .query<number>({
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.userId = @uid',
        parameters: [{ name: '@uid', value: userId }],
      })
      .fetchAll();
    return resources[0] ?? 0;
  }

  async update(id: string, userId: string, fields: Partial<PageDoc>): Promise<void> {
    const existing = await this.getById(id, userId);
    if (!existing) return;
    await this.container.item(id, userId).replace({ ...existing, ...fields, id, userId });
  }

  async delete(id: string, userId: string): Promise<void> {
    try {
      await this.container.item(id, userId).delete();
    } catch (e: any) {
      if (e.code !== 404) throw e;
    }
  }
}
