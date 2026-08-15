// ── Mock: Page Repository ───────────────────────────────────────────────

import type { IPageRepo, PageDoc } from '../types';

export class MockPageRepo implements IPageRepo {
  private docs: PageDoc[] = [];

  async create(doc: PageDoc): Promise<void> {
    this.docs.push({ ...doc });
  }

  async getById(id: string, userId: string): Promise<PageDoc | undefined> {
    return this.docs.find(d => d.id === id && d.userId === userId);
  }

  async getBySlug(slug: string): Promise<PageDoc | undefined> {
    return this.docs.find(d => d.slug === slug && d.isActive);
  }

  async listByUser(userId: string): Promise<PageDoc[]> {
    return this.docs
      .filter(d => d.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async countByUser(userId: string): Promise<number> {
    return this.docs.filter(d => d.userId === userId).length;
  }

  async update(id: string, userId: string, fields: Partial<PageDoc>): Promise<void> {
    const idx = this.docs.findIndex(d => d.id === id && d.userId === userId);
    if (idx >= 0) this.docs[idx] = { ...this.docs[idx], ...fields, id, userId };
  }

  async delete(id: string, userId: string): Promise<void> {
    this.docs = this.docs.filter(d => !(d.id === id && d.userId === userId));
  }

  /** Test helper */
  reset(): void { this.docs = []; }
}
