// ── Mock: User Repository ───────────────────────────────────────────────

import type { IUserRepo, UserDoc } from '../types';

export class MockUserRepo implements IUserRepo {
  private docs: UserDoc[] = [];

  async getById(id: string): Promise<UserDoc | undefined> {
    return this.docs.find(d => d.id === id);
  }

  async getByEmail(email: string): Promise<UserDoc | undefined> {
    return this.docs.find(d => d.email === email);
  }

  async create(user: UserDoc): Promise<void> {
    this.docs.push({ ...user });
  }

  async update(id: string, fields: Partial<UserDoc>): Promise<void> {
    const idx = this.docs.findIndex(d => d.id === id);
    if (idx >= 0) this.docs[idx] = { ...this.docs[idx], ...fields, id };
  }

  async delete(id: string): Promise<void> {
    this.docs = this.docs.filter(d => d.id !== id);
  }

  async count(): Promise<number> {
    return this.docs.length;
  }

  async list(opts?: { search?: string; limit?: number }): Promise<UserDoc[]> {
    let result = [...this.docs];
    if (opts?.search) {
      const s = opts.search.toLowerCase();
      result = result.filter(d =>
        d.email.toLowerCase().includes(s) ||
        (d.firstName?.toLowerCase().includes(s)) ||
        (d.lastName?.toLowerCase().includes(s)) ||
        (d.organization?.toLowerCase().includes(s))
      );
    }
    result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return opts?.limit ? result.slice(0, opts.limit) : result;
  }

  async getFoundingSuperadmin(): Promise<UserDoc | undefined> {
    return this.docs
      .filter(d => d.isSuperadmin)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  }

  /** Test helper: reset all data */
  reset(): void { this.docs = []; }
}
