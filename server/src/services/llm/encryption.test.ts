import { describe, it, expect } from 'vitest';
import { encryptApiKey, decryptApiKey, getKeyFingerprint, EncryptionKeyMismatchError } from './encryption';

describe('LLM API Key Encryption', () => {
  it('encrypts and decrypts a standard API key', () => {
    const key = 'sk-1234567890abcdef';
    const { encrypted, iv, tag } = encryptApiKey(key);

    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(key);
    expect(iv).toBeDefined();
    expect(tag).toBeDefined();

    const decrypted = decryptApiKey(encrypted, iv, tag);
    expect(decrypted).toBe(key);
  });

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const key = 'sk-same-key-twice';
    const result1 = encryptApiKey(key);
    const result2 = encryptApiKey(key);

    expect(result1.encrypted).not.toBe(result2.encrypted);
    expect(result1.iv).not.toBe(result2.iv);

    // Both decrypt correctly
    expect(decryptApiKey(result1.encrypted, result1.iv, result1.tag)).toBe(key);
    expect(decryptApiKey(result2.encrypted, result2.iv, result2.tag)).toBe(key);
  });

  it('rejects tampered ciphertext', () => {
    const key = 'sk-test-tamper';
    const { encrypted, iv, tag } = encryptApiKey(key);

    // Tamper with the encrypted data
    const tampered = encrypted.slice(0, -2) + 'ff';
    expect(() => decryptApiKey(tampered, iv, tag)).toThrow(EncryptionKeyMismatchError);
  });

  it('rejects wrong auth tag', () => {
    const key = 'sk-test-wrong-tag';
    const { encrypted, iv } = encryptApiKey(key);

    const wrongTag = '0'.repeat(32);
    expect(() => decryptApiKey(encrypted, iv, wrongTag)).toThrow(EncryptionKeyMismatchError);
  });

  it('handles empty string', () => {
    const { encrypted, iv, tag } = encryptApiKey('');
    expect(decryptApiKey(encrypted, iv, tag)).toBe('');
  });

  it('handles long API keys', () => {
    const longKey = 'sk-' + 'a'.repeat(200);
    const { encrypted, iv, tag } = encryptApiKey(longKey);
    expect(decryptApiKey(encrypted, iv, tag)).toBe(longKey);
  });

  it('handles special characters in keys', () => {
    const specialKey = 'sk-test/key+with=special&chars!@#$%';
    const { encrypted, iv, tag } = encryptApiKey(specialKey);
    expect(decryptApiKey(encrypted, iv, tag)).toBe(specialKey);
  });

  describe('key fingerprint', () => {
    it('returns a deterministic 16-char hex fingerprint', () => {
      const fp1 = getKeyFingerprint();
      const fp2 = getKeyFingerprint();
      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^[0-9a-f]{16}$/);
    });

    it('encryptApiKey includes keyFingerprint in output', () => {
      const { keyFingerprint } = encryptApiKey('sk-test');
      expect(keyFingerprint).toBe(getKeyFingerprint());
    });

    it('decrypts successfully when fingerprint matches', () => {
      const key = 'sk-fingerprint-match';
      const { encrypted, iv, tag, keyFingerprint } = encryptApiKey(key);
      expect(decryptApiKey(encrypted, iv, tag, keyFingerprint)).toBe(key);
    });

    it('decrypts successfully when no fingerprint stored (legacy)', () => {
      const key = 'sk-no-fingerprint';
      const { encrypted, iv, tag } = encryptApiKey(key);
      expect(decryptApiKey(encrypted, iv, tag, undefined)).toBe(key);
    });

    it('throws EncryptionKeyMismatchError when fingerprint does not match', () => {
      const key = 'sk-wrong-fingerprint';
      const { encrypted, iv, tag } = encryptApiKey(key);
      const wrongFingerprint = '0'.repeat(16);
      expect(() => decryptApiKey(encrypted, iv, tag, wrongFingerprint)).toThrow(EncryptionKeyMismatchError);
      expect(() => decryptApiKey(encrypted, iv, tag, wrongFingerprint)).toThrow(
        /re-enter your API key/,
      );
    });

    it('throws EncryptionKeyMismatchError (not raw crypto error) on GCM auth failure', () => {
      const key = 'sk-gcm-fail';
      const { encrypted, iv, tag } = encryptApiKey(key);
      const tampered = encrypted.slice(0, -4) + 'dead';
      // No fingerprint — falls through to actual decryption which fails
      expect(() => decryptApiKey(tampered, iv, tag)).toThrow(EncryptionKeyMismatchError);
      expect(() => decryptApiKey(tampered, iv, tag)).toThrow(
        /re-enter your API key/,
      );
    });
  });
});
