// ── Cosmos: Auth Repository ──────────────────────────────────────────────

import { Container } from '@azure/cosmos';
import { v4 as uuidv4 } from 'uuid';
import type { IAuthRepo, AuthDoc } from '../types';

export class CosmosAuthRepo implements IAuthRepo {
  constructor(private container: Container) {}

  async create(doc: AuthDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async getById(id: string, userId: string): Promise<AuthDoc | undefined> {
    try {
      const { resource } = await this.container.item(id, userId).read<AuthDoc>();
      return resource ?? undefined;
    } catch (e: any) {
      if (e.code === 404) return undefined;
      throw e;
    }
  }

  // ── Token blocklist ──────────────────────────────────────────────────

  async blockToken(jti: string, userId: string, expiresAt: string, ttl: number): Promise<void> {
    await this.container.items.upsert<AuthDoc>({
      id: `block:${jti}`,
      userId,
      type: 'token_block',
      jti,
      expiresAt,
      createdAt: new Date().toISOString(),
      ttl,
    });
  }

  async isTokenBlocked(jti: string): Promise<boolean> {
    const { resources } = await this.container.items
      .query<AuthDoc>({
        query: 'SELECT * FROM c WHERE c.type = "token_block" AND c.jti = @jti',
        parameters: [{ name: '@jti', value: jti }],
      })
      .fetchAll();
    return resources.length > 0;
  }

  async blockAllUserTokens(userId: string, expiresAt: string, ttl: number): Promise<void> {
    await this.container.items.upsert<AuthDoc>({
      id: `block:user:${userId}`,
      userId,
      type: 'token_block',
      jti: `user:${userId}`,
      expiresAt,
      createdAt: new Date().toISOString(),
      ttl,
    });
  }

  async isUserBlocked(userId: string): Promise<boolean> {
    try {
      const { resource } = await this.container.item(`block:user:${userId}`, userId).read<AuthDoc>();
      return !!resource;
    } catch (e: any) {
      if (e.code === 404) return false;
      throw e;
    }
  }

  async clearUserBlock(userId: string): Promise<void> {
    try {
      await this.container.item(`block:user:${userId}`, userId).delete();
    } catch (e: any) {
      if (e.code !== 404) throw e;
    }
  }

  async cleanExpiredTokens(): Promise<number> {
    // With TTL enabled, CosmosDB handles expiration automatically.
    // This is a no-op — kept for interface compatibility.
    return 0;
  }

  // ── Trusted devices ──────────────────────────────────────────────────

  async createTrustedDevice(userId: string, tokenHash: string, expiresAt: string, ttl: number): Promise<void> {
    await this.container.items.create<AuthDoc>({
      id: `device:${tokenHash}`,
      userId,
      type: 'trusted_device',
      tokenHash,
      expiresAt,
      createdAt: new Date().toISOString(),
      ttl,
    });
  }

  async getTrustedDevice(userId: string, tokenHash: string): Promise<AuthDoc | undefined> {
    try {
      const { resource } = await this.container.item(`device:${tokenHash}`, userId).read<AuthDoc>();
      if (resource && new Date(resource.expiresAt) > new Date()) return resource;
      return undefined;
    } catch (e: any) {
      if (e.code === 404) return undefined;
      throw e;
    }
  }

  async deleteExpiredDevices(userId: string): Promise<void> {
    // TTL handles this automatically
  }

  async deleteAllDevices(userId: string): Promise<void> {
    const { resources } = await this.container.items
      .query<AuthDoc>({
        query: 'SELECT * FROM c WHERE c.userId = @userId AND c.type = "trusted_device"',
        parameters: [{ name: '@userId', value: userId }],
      })
      .fetchAll();
    for (const doc of resources) {
      await this.container.item(doc.id, userId).delete();
    }
  }

  // ── Password reset tokens ────────────────────────────────────────────

  async createPasswordReset(userId: string, tokenHash: string, expiresAt: string, ttl: number): Promise<void> {
    await this.container.items.create<AuthDoc>({
      id: `reset:${uuidv4()}`,
      userId,
      type: 'password_reset',
      tokenHash2: tokenHash,
      expiresAt,
      createdAt: new Date().toISOString(),
      ttl,
    });
  }

  async getPasswordResetByHash(tokenHash: string): Promise<AuthDoc | undefined> {
    const { resources } = await this.container.items
      .query<AuthDoc>({
        query: 'SELECT * FROM c WHERE c.type = "password_reset" AND c.tokenHash2 = @h AND NOT IS_DEFINED(c.usedAt)',
        parameters: [{ name: '@h', value: tokenHash }],
      })
      .fetchAll();
    const doc = resources[0];
    if (doc && new Date(doc.expiresAt) > new Date()) return doc;
    return undefined;
  }

  async markPasswordResetUsed(id: string, userId: string): Promise<void> {
    const doc = await this.getById(id, userId);
    if (!doc) return;
    await this.container.item(id, userId).replace({ ...doc, usedAt: new Date().toISOString() });
  }

  async deleteUnusedPasswordResets(userId: string): Promise<void> {
    const { resources } = await this.container.items
      .query<AuthDoc>({
        query: 'SELECT * FROM c WHERE c.userId = @userId AND c.type = "password_reset" AND NOT IS_DEFINED(c.usedAt)',
        parameters: [{ name: '@userId', value: userId }],
      })
      .fetchAll();
    for (const doc of resources) {
      await this.container.item(doc.id, userId).delete();
    }
  }

  // ── Email verification tokens ─────────────────────────────────────────

  async createEmailVerification(userId: string, tokenHash: string, expiresAt: string, ttl: number): Promise<void> {
    await this.container.items.create<AuthDoc>({
      id: `verify:${uuidv4()}`,
      userId,
      type: 'email_verification',
      tokenHash2: tokenHash,
      expiresAt,
      createdAt: new Date().toISOString(),
      ttl,
    });
  }

  async getEmailVerificationByHash(tokenHash: string): Promise<AuthDoc | undefined> {
    const { resources } = await this.container.items
      .query<AuthDoc>({
        query: 'SELECT * FROM c WHERE c.type = "email_verification" AND c.tokenHash2 = @h AND NOT IS_DEFINED(c.usedAt)',
        parameters: [{ name: '@h', value: tokenHash }],
      })
      .fetchAll();
    const doc = resources[0];
    if (doc && new Date(doc.expiresAt) > new Date()) return doc;
    return undefined;
  }

  async markEmailVerificationUsed(id: string, userId: string): Promise<void> {
    const doc = await this.getById(id, userId);
    if (!doc) return;
    await this.container.item(id, userId).replace({ ...doc, usedAt: new Date().toISOString() });
  }

  async deleteUnusedEmailVerifications(userId: string): Promise<void> {
    const { resources } = await this.container.items
      .query<AuthDoc>({
        query: 'SELECT * FROM c WHERE c.userId = @userId AND c.type = "email_verification" AND NOT IS_DEFINED(c.usedAt)',
        parameters: [{ name: '@userId', value: userId }],
      })
      .fetchAll();
    for (const doc of resources) {
      await this.container.item(doc.id, userId).delete();
    }
  }

  // ── Cascade delete ────────────────────────────────────────────────────

  async deleteAllForUser(userId: string): Promise<void> {
    const { resources } = await this.container.items
      .query<AuthDoc>({
        query: 'SELECT * FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: userId }],
      })
      .fetchAll();
    for (const doc of resources) {
      await this.container.item(doc.id, userId).delete();
    }
  }
}
