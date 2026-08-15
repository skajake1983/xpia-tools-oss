import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { encryptApiKey, decryptApiKey } from '../services/llm/encryption';

// Replicating the schema from keys.ts to unit-test validation independently
const addKeySchema = z.object({
  providerId: z.string().min(1).max(50),
  apiKey: z.string().min(10).max(500),
  label: z.string().min(1).max(100).optional(),
});

describe('keys route — addKeySchema validation', () => {
  it('accepts a valid payload', () => {
    const result = addKeySchema.safeParse({
      providerId: 'openai',
      apiKey: 'sk-1234567890abcdef',
    });
    expect(result.success).toBe(true);
  });

  it('accepts payload with optional label', () => {
    const result = addKeySchema.safeParse({
      providerId: 'google',
      apiKey: 'sk-ant-1234567890',
      label: 'Work key',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.label).toBe('Work key');
    }
  });

  it('rejects missing providerId', () => {
    const result = addKeySchema.safeParse({
      apiKey: 'sk-1234567890abcdef',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty providerId', () => {
    const result = addKeySchema.safeParse({
      providerId: '',
      apiKey: 'sk-1234567890abcdef',
    });
    expect(result.success).toBe(false);
  });

  it('rejects api key shorter than 10 chars', () => {
    const result = addKeySchema.safeParse({
      providerId: 'openai',
      apiKey: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('rejects api key longer than 500 chars', () => {
    const result = addKeySchema.safeParse({
      providerId: 'openai',
      apiKey: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects label longer than 100 chars', () => {
    const result = addKeySchema.safeParse({
      providerId: 'openai',
      apiKey: 'sk-1234567890abcdef',
      label: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe('keys route — encryption round-trip for stored keys', () => {
  it('encrypts and decrypts a realistic API key', () => {
    const apiKey = 'sk-proj-abc123def456ghi789jkl012mno345pqr678';
    const { encrypted, iv, tag } = encryptApiKey(apiKey);
    const decrypted = decryptApiKey(encrypted, iv, tag);
    expect(decrypted).toBe(apiKey);
  });

  it('produces unique ciphertext per encryption', () => {
    const apiKey = 'sk-test-0000000000000000';
    const first = encryptApiKey(apiKey);
    const second = encryptApiKey(apiKey);
    expect(first.encrypted).not.toBe(second.encrypted);
    // Both should decrypt to same value
    expect(decryptApiKey(first.encrypted, first.iv, first.tag)).toBe(apiKey);
    expect(decryptApiKey(second.encrypted, second.iv, second.tag)).toBe(apiKey);
  });

  it('handles keys with special characters', () => {
    const apiKey = 'AIzaSyB-test/key+with=special&chars!@#$%';
    const { encrypted, iv, tag } = encryptApiKey(apiKey);
    expect(decryptApiKey(encrypted, iv, tag)).toBe(apiKey);
  });
});
