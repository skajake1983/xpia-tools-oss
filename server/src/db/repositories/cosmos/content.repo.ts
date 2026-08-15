// ── Cosmos: Content Repository ──────────────────────────────────────────
// Handles generated documents and generated payloads in the "content" container.

import { Container } from '@azure/cosmos';
import type { IContentRepo, GeneratedDocDoc, GeneratedPayloadDoc } from '../types';

export class CosmosContentRepo implements IContentRepo {
  constructor(private container: Container) {}

  // ── Documents ────────────────────────────────────────────────────────

  async createDocument(doc: GeneratedDocDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async getDocument(id: string, userId: string): Promise<GeneratedDocDoc | undefined> {
    try {
      const { resource } = await this.container.item(id, userId).read<GeneratedDocDoc>();
      if (resource?.kind !== 'document') return undefined;
      return resource;
    } catch (e: any) {
      if (e.code === 404) return undefined;
      throw e;
    }
  }

  async listDocuments(userId: string, limit = 50): Promise<GeneratedDocDoc[]> {
    const { resources } = await this.container.items
      .query<GeneratedDocDoc>({
        query: 'SELECT TOP @limit * FROM c WHERE c.userId = @uid AND c.kind = "document" ORDER BY c.createdAt DESC',
        parameters: [
          { name: '@uid', value: userId },
          { name: '@limit', value: limit },
        ],
      })
      .fetchAll();
    return resources;
  }

  async deleteOldDocuments(before: string): Promise<number> {
    const { resources } = await this.container.items
      .query<{ id: string; userId: string }>({
        query: 'SELECT c.id, c.userId FROM c WHERE c.kind = "document" AND c.createdAt < @before',
        parameters: [{ name: '@before', value: before }],
      })
      .fetchAll();
    for (const doc of resources) {
      await this.container.item(doc.id, doc.userId).delete();
    }
    return resources.length;
  }

  // ── Payloads ─────────────────────────────────────────────────────────

  async createPayload(doc: GeneratedPayloadDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async getPayload(id: string, userId: string): Promise<GeneratedPayloadDoc | undefined> {
    try {
      const { resource } = await this.container.item(id, userId).read<GeneratedPayloadDoc>();
      if (resource?.kind !== 'payload') return undefined;
      return resource;
    } catch (e: any) {
      if (e.code === 404) return undefined;
      throw e;
    }
  }

  async listPayloads(userId: string, limit = 50): Promise<GeneratedPayloadDoc[]> {
    const { resources } = await this.container.items
      .query<GeneratedPayloadDoc>({
        query: 'SELECT TOP @limit * FROM c WHERE c.userId = @uid AND c.kind = "payload" ORDER BY c.createdAt DESC',
        parameters: [
          { name: '@uid', value: userId },
          { name: '@limit', value: limit },
        ],
      })
      .fetchAll();
    return resources;
  }

  async deleteOldPayloads(before: string): Promise<number> {
    const { resources } = await this.container.items
      .query<{ id: string; userId: string }>({
        query: 'SELECT c.id, c.userId FROM c WHERE c.kind = "payload" AND c.createdAt < @before',
        parameters: [{ name: '@before', value: before }],
      })
      .fetchAll();
    for (const doc of resources) {
      await this.container.item(doc.id, doc.userId).delete();
    }
    return resources.length;
  }
}
