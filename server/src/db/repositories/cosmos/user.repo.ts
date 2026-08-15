// ── Cosmos: User Repository ─────────────────────────────────────────────

import { Container } from '@azure/cosmos';
import type { IUserRepo, UserDoc } from '../types';

export class CosmosUserRepo implements IUserRepo {
  constructor(private container: Container) {}

  async getById(id: string): Promise<UserDoc | undefined> {
    try {
      const { resource } = await this.container.item(id, id).read<UserDoc>();
      return resource ?? undefined;
    } catch (e: any) {
      if (e.code === 404) return undefined;
      throw e;
    }
  }

  async getByEmail(email: string): Promise<UserDoc | undefined> {
    const { resources } = await this.container.items
      .query<UserDoc>({
        query: 'SELECT * FROM c WHERE c.email = @email',
        parameters: [{ name: '@email', value: email }],
      })
      .fetchAll();
    return resources[0] ?? undefined;
  }

  async create(user: UserDoc): Promise<void> {
    await this.container.items.create(user);
  }

  async update(id: string, fields: Partial<UserDoc>): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) return;
    await this.container.item(id, id).replace({ ...existing, ...fields, id });
  }

  async delete(id: string): Promise<void> {
    try {
      await this.container.item(id, id).delete();
    } catch (e: any) {
      if (e.code !== 404) throw e;
    }
  }

  async count(): Promise<number> {
    const { resources } = await this.container.items
      .query<number>({ query: 'SELECT VALUE COUNT(1) FROM c' })
      .fetchAll();
    return resources[0] ?? 0;
  }

  async list(opts?: { search?: string; limit?: number }): Promise<UserDoc[]> {
    let query = 'SELECT * FROM c';
    const parameters: { name: string; value: any }[] = [];

    if (opts?.search) {
      query += ' WHERE CONTAINS(LOWER(c.email), @s) OR CONTAINS(LOWER(c.firstName), @s) OR CONTAINS(LOWER(c.lastName), @s) OR CONTAINS(LOWER(c.organization), @s)';
      parameters.push({ name: '@s', value: opts.search.toLowerCase() });
    }

    query += ' ORDER BY c.createdAt DESC';

    const { resources } = await this.container.items
      .query<UserDoc>({ query, parameters })
      .fetchAll();
    return opts?.limit ? resources.slice(0, opts.limit) : resources;
  }

  async getFoundingSuperadmin(): Promise<UserDoc | undefined> {
    const { resources } = await this.container.items
      .query<UserDoc>({
        query: 'SELECT TOP 1 * FROM c WHERE c.isSuperadmin = true ORDER BY c.createdAt ASC',
      })
      .fetchAll();
    return resources[0] ?? undefined;
  }
}
