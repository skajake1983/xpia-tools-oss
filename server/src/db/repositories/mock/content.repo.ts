// ── Mock: Content Repository ────────────────────────────────────────────

import type { IContentRepo, GeneratedDocDoc, GeneratedPayloadDoc } from '../types';

export class MockContentRepo implements IContentRepo {
  private docDocs: GeneratedDocDoc[] = [];
  private payloadDocs: GeneratedPayloadDoc[] = [];

  async createDocument(doc: GeneratedDocDoc): Promise<void> {
    this.docDocs.push({ ...doc });
  }

  async getDocument(id: string, userId: string): Promise<GeneratedDocDoc | undefined> {
    return this.docDocs.find(d => d.id === id && d.userId === userId);
  }

  async listDocuments(userId: string, limit = 50): Promise<GeneratedDocDoc[]> {
    return this.docDocs
      .filter(d => d.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async deleteOldDocuments(before: string): Promise<number> {
    const len = this.docDocs.length;
    this.docDocs = this.docDocs.filter(d => d.createdAt >= before);
    return len - this.docDocs.length;
  }

  async createPayload(doc: GeneratedPayloadDoc): Promise<void> {
    this.payloadDocs.push({ ...doc });
  }

  async getPayload(id: string, userId: string): Promise<GeneratedPayloadDoc | undefined> {
    return this.payloadDocs.find(d => d.id === id && d.userId === userId);
  }

  async listPayloads(userId: string, limit = 50): Promise<GeneratedPayloadDoc[]> {
    return this.payloadDocs
      .filter(d => d.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async deleteOldPayloads(before: string): Promise<number> {
    const len = this.payloadDocs.length;
    this.payloadDocs = this.payloadDocs.filter(d => d.createdAt >= before);
    return len - this.payloadDocs.length;
  }

  /** Test helper */
  reset(): void { this.docDocs = []; this.payloadDocs = []; }
}
