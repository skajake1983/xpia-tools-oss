// ── Mock: API Key Repository ────────────────────────────────────────────

import type { IApiKeyRepo, ApiKeyDoc } from '../types';

export class MockApiKeyRepo implements IApiKeyRepo {
  private docs: ApiKeyDoc[] = [];

  async getById(id: string, userId: string): Promise<ApiKeyDoc | undefined> {
    return this.docs.find(d => d.id === id && d.userId === userId);
  }

  async getActiveKey(userId: string, providerId: string): Promise<ApiKeyDoc | undefined> {
    return this.docs.find(d => d.userId === userId && d.providerId === providerId && d.isActive);
  }

  async listByUser(userId: string): Promise<(ApiKeyDoc & { providerName?: string; providerIsEnabled?: boolean })[]> {
    return this.docs
      .filter(d => d.userId === userId && d.isActive)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(doc: ApiKeyDoc): Promise<void> {
    this.docs.push({ ...doc });
  }

  async deleteByUserProvider(userId: string, providerId: string): Promise<void> {
    this.docs = this.docs.filter(d => !(d.userId === userId && d.providerId === providerId));
  }

  async delete(id: string, userId: string): Promise<void> {
    this.docs = this.docs.filter(d => !(d.id === id && d.userId === userId));
  }

  async countActive(userId: string, providerId: string): Promise<number> {
    return this.docs.filter(d => d.userId === userId && d.providerId === providerId && d.isActive).length;
  }

  async getAllActive(): Promise<ApiKeyDoc[]> {
    return this.docs.filter(d => d.isActive);
  }

  async update(id: string, userId: string, fields: Partial<ApiKeyDoc>): Promise<void> {
    const idx = this.docs.findIndex(d => d.id === id && d.userId === userId);
    if (idx >= 0) this.docs[idx] = { ...this.docs[idx], ...fields, id, userId };
  }

  /** Test helper */
  reset(): void { this.docs = []; }
}
