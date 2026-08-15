// ── Mock: Auth Repository ───────────────────────────────────────────────

import type { IAuthRepo, AuthDoc } from '../types';

export class MockAuthRepo implements IAuthRepo {
  private docs: AuthDoc[] = [];
  private nextId = 0;

  async create(doc: AuthDoc): Promise<void> {
    this.docs.push({ ...doc });
  }

  async getById(id: string, userId: string): Promise<AuthDoc | undefined> {
    return this.docs.find(d => d.id === id && d.userId === userId);
  }

  async blockToken(jti: string, userId: string, expiresAt: string, _ttl: number): Promise<void> {
    const id = `block:${jti}`;
    this.docs = this.docs.filter(d => d.id !== id);
    this.docs.push({ id, userId, type: 'token_block', jti, expiresAt, createdAt: new Date().toISOString() });
  }

  async isTokenBlocked(jti: string): Promise<boolean> {
    return this.docs.some(d => d.type === 'token_block' && d.jti === jti);
  }

  async blockAllUserTokens(userId: string, expiresAt: string, _ttl: number): Promise<void> {
    const id = `block:user:${userId}`;
    this.docs = this.docs.filter(d => d.id !== id);
    this.docs.push({ id, userId, type: 'token_block', jti: `user:${userId}`, expiresAt, createdAt: new Date().toISOString() });
  }

  async isUserBlocked(userId: string): Promise<boolean> {
    return this.docs.some(d => d.id === `block:user:${userId}`);
  }

  async clearUserBlock(userId: string): Promise<void> {
    this.docs = this.docs.filter(d => d.id !== `block:user:${userId}`);
  }

  async cleanExpiredTokens(): Promise<number> {
    const now = new Date();
    const before = this.docs.length;
    this.docs = this.docs.filter(d => d.type !== 'token_block' || new Date(d.expiresAt) > now);
    return before - this.docs.length;
  }

  async createTrustedDevice(userId: string, tokenHash: string, expiresAt: string, _ttl: number): Promise<void> {
    this.docs.push({ id: `device:${tokenHash}`, userId, type: 'trusted_device', tokenHash, expiresAt, createdAt: new Date().toISOString() });
  }

  async getTrustedDevice(userId: string, tokenHash: string): Promise<AuthDoc | undefined> {
    const doc = this.docs.find(d => d.userId === userId && d.type === 'trusted_device' && d.tokenHash === tokenHash);
    if (doc && new Date(doc.expiresAt) > new Date()) return doc;
    return undefined;
  }

  async deleteExpiredDevices(userId: string): Promise<void> {
    const now = new Date();
    this.docs = this.docs.filter(d => !(d.userId === userId && d.type === 'trusted_device' && new Date(d.expiresAt) <= now));
  }

  async deleteAllDevices(userId: string): Promise<void> {
    this.docs = this.docs.filter(d => !(d.userId === userId && d.type === 'trusted_device'));
  }

  async createPasswordReset(userId: string, tokenHash: string, expiresAt: string, _ttl: number): Promise<void> {
    this.docs.push({ id: `reset:${++this.nextId}`, userId, type: 'password_reset', tokenHash2: tokenHash, expiresAt, createdAt: new Date().toISOString() });
  }

  async getPasswordResetByHash(tokenHash: string): Promise<AuthDoc | undefined> {
    const doc = this.docs.find(d => d.type === 'password_reset' && d.tokenHash2 === tokenHash);
    if (doc && new Date(doc.expiresAt) > new Date()) return doc;
    return undefined;
  }

  async markPasswordResetUsed(id: string, userId: string): Promise<void> {
    const idx = this.docs.findIndex(d => d.id === id && d.userId === userId);
    if (idx >= 0) this.docs[idx] = { ...this.docs[idx], usedAt: new Date().toISOString() };
  }

  async deleteUnusedPasswordResets(userId: string): Promise<void> {
    this.docs = this.docs.filter(d => !(d.userId === userId && d.type === 'password_reset' && !d.usedAt));
  }

  async createEmailVerification(userId: string, tokenHash: string, expiresAt: string, _ttl: number): Promise<void> {
    this.docs.push({ id: `verify:${++this.nextId}`, userId, type: 'email_verification', tokenHash2: tokenHash, expiresAt, createdAt: new Date().toISOString() });
  }

  async getEmailVerificationByHash(tokenHash: string): Promise<AuthDoc | undefined> {
    const doc = this.docs.find(d => d.type === 'email_verification' && d.tokenHash2 === tokenHash);
    if (doc && new Date(doc.expiresAt) > new Date()) return doc;
    return undefined;
  }

  async markEmailVerificationUsed(id: string, userId: string): Promise<void> {
    const idx = this.docs.findIndex(d => d.id === id && d.userId === userId);
    if (idx >= 0) this.docs[idx] = { ...this.docs[idx], usedAt: new Date().toISOString() };
  }

  async deleteUnusedEmailVerifications(userId: string): Promise<void> {
    this.docs = this.docs.filter(d => !(d.userId === userId && d.type === 'email_verification' && !d.usedAt));
  }

  async deleteAllForUser(userId: string): Promise<void> {
    this.docs = this.docs.filter(d => d.userId !== userId);
  }

  /** Test helper */
  reset(): void { this.docs = []; }
}
