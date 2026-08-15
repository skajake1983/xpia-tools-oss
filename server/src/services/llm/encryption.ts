import crypto from 'crypto';
import { config } from '../../config';
import repos from '../../db/repos';
import logger from '../../logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(config.encryptionKey, 'hex');
}

/**
 * SHA-256 fingerprint of the current encryption key.
 * Stored alongside ciphertext so we can detect key mismatches
 * without attempting (and failing) decryption.
 */
export function getKeyFingerprint(): string {
  return crypto.createHash('sha256').update(getKey()).digest('hex').slice(0, 16);
}

export function encryptApiKey(plaintext: string): { encrypted: string; iv: string; tag: string; keyFingerprint: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag,
    keyFingerprint: getKeyFingerprint(),
  };
}

export class EncryptionKeyMismatchError extends Error {
  constructor() {
    super('API key was encrypted with a different encryption key. Please re-enter your API key in Settings → API Keys.');
    this.name = 'EncryptionKeyMismatchError';
  }
}

export function decryptApiKey(encrypted: string, iv: string, tag: string, storedFingerprint?: string): string {
  // Fast-fail if the key fingerprint doesn't match (avoids cryptic GCM auth error)
  if (storedFingerprint && storedFingerprint !== getKeyFingerprint()) {
    throw new EncryptionKeyMismatchError();
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // Wrap the cryptic Node.js GCM auth error with a clear message
    if (err instanceof EncryptionKeyMismatchError) throw err;
    throw new EncryptionKeyMismatchError();
  }
}

/**
 * Startup check: warns about and deactivates API keys that were encrypted
 * with a different encryption key (they can never be decrypted).
 */
export async function validateEncryptionKeys(): Promise<void> {
  const fingerprint = getKeyFingerprint();
  const keys = await repos.apiKeys.getAllActive();

  const stale = keys.filter((k) => k.keyFingerprint !== null && k.keyFingerprint !== fingerprint);

  if (stale.length > 0) {
    logger.warn({ count: stale.length }, 'API keys encrypted with different key — deactivating');

    for (const key of stale) {
      await repos.apiKeys.update(key.id, key.userId, { isActive: false });
      logger.warn({ providerId: key.providerId, keyId: key.id }, 'Deactivated stale API key');
    }
  }

  // Keys without a fingerprint (legacy) — attempt a trial decryption
  const legacy = keys.filter((k) => k.keyFingerprint === null);
  if (legacy.length > 0) {
    for (const key of legacy) {
      try {
        decryptApiKey(key.encryptedKey, key.keyIv, key.keyTag);
        // Decryption succeeded — backfill the fingerprint
        await repos.apiKeys.update(key.id, key.userId, { keyFingerprint: fingerprint });
      } catch {
        logger.warn({ providerId: key.providerId, keyId: key.id }, 'Legacy API key cannot be decrypted — deactivating');
        await repos.apiKeys.update(key.id, key.userId, { isActive: false });
      }
    }
  }

  // Validate encrypted TOTP secrets — reset TOTP for users whose secrets can't be decrypted
  const ENC_PREFIX = 'enc:v1:';
  const allUsers = await repos.users.list();
  const totpUsers = allUsers.filter((u) => u.totpEnabled && u.totpSecret !== null);

  for (const user of totpUsers) {
    if (!user.totpSecret!.startsWith(ENC_PREFIX)) continue; // plaintext (pre-migration) — fine
    const parts = user.totpSecret!.slice(ENC_PREFIX.length).split(':');
    try {
      decryptApiKey(parts[0], parts[1], parts[2]);
    } catch {
      logger.warn({ email: user.email }, 'TOTP secret cannot be decrypted — resetting 2FA');
      await repos.users.update(user.id, { totpSecret: null, totpEnabled: false });
    }
  }
}
