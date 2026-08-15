import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Replicated from admin.ts to unit-test validation independently
const createModelSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1).max(100).regex(
    /^[a-zA-Z][a-zA-Z0-9._:-]*$/,
    'Model ID must start with a letter and contain only letters, digits, hyphens, dots, underscores, or colons',
  ),
  displayName: z.string().min(1),
  inputPricePerMillion: z.number().min(0),
  outputPricePerMillion: z.number().min(0),
  maxContextTokens: z.number().int().min(1).default(128000),
  maxOutputTokens: z.number().int().min(1).default(4096),
});

// Replicated from admin.ts
const PROVIDER_MODEL_PREFIXES: Record<string, string[]> = {
  openai: ['gpt-', 'o1', 'o2', 'o3', 'o4', 'chatgpt-', 'dall-e-', 'text-', 'tts-', 'whisper-'],
  google: ['gemini-'],
  xai: ['grok-'],
};

function checkModelPrefix(providerId: string, modelId: string): string | undefined {
  const knownPrefixes = PROVIDER_MODEL_PREFIXES[providerId];
  if (knownPrefixes && !knownPrefixes.some((p) => modelId.startsWith(p))) {
    return `Model ID "${modelId}" doesn't match known ${providerId} model patterns (${knownPrefixes.join(', ')}). It will be saved, but verify it's correct.`;
  }
  return undefined;
}

const updateModelSchema = z.object({
  inputPricePerMillion: z.number().min(0).optional(),
  outputPricePerMillion: z.number().min(0).optional(),
  maxOutputTokens: z.number().int().min(1).optional(),
  isEnabled: z.boolean().optional(),
});

describe('admin model routes — createModelSchema', () => {
  it('accepts a valid create payload', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      modelId: 'gpt-6',
      displayName: 'GPT-6',
      inputPricePerMillion: 5.0,
      outputPricePerMillion: 20.0,
      maxContextTokens: 200000,
      maxOutputTokens: 8192,
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults for context and output tokens', () => {
    const result = createModelSchema.safeParse({
      providerId: 'google',
      modelId: 'gemini-next',
      displayName: 'Gemini Next',
      inputPricePerMillion: 3.0,
      outputPricePerMillion: 15.0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxContextTokens).toBe(128000);
      expect(result.data.maxOutputTokens).toBe(4096);
    }
  });

  it('rejects missing providerId', () => {
    const result = createModelSchema.safeParse({
      modelId: 'gpt-6',
      displayName: 'GPT-6',
      inputPricePerMillion: 5.0,
      outputPricePerMillion: 20.0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing modelId', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      displayName: 'GPT-6',
      inputPricePerMillion: 5.0,
      outputPricePerMillion: 20.0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty displayName', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      modelId: 'gpt-6',
      displayName: '',
      inputPricePerMillion: 5.0,
      outputPricePerMillion: 20.0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative prices', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      modelId: 'gpt-6',
      displayName: 'GPT-6',
      inputPricePerMillion: -1,
      outputPricePerMillion: 20.0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer maxOutputTokens', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      modelId: 'gpt-6',
      displayName: 'GPT-6',
      inputPricePerMillion: 5.0,
      outputPricePerMillion: 20.0,
      maxOutputTokens: 4096.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero maxOutputTokens', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      modelId: 'gpt-6',
      displayName: 'GPT-6',
      inputPricePerMillion: 5.0,
      outputPricePerMillion: 20.0,
      maxOutputTokens: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects model ID starting with a digit', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      modelId: '4-gpt',
      displayName: 'Bad Model',
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects model ID with spaces', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      modelId: 'gpt 6',
      displayName: 'Bad Model',
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects model ID with special characters', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      modelId: 'gpt-6@latest',
      displayName: 'Bad Model',
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects model ID longer than 100 chars', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      modelId: 'g' + '-x'.repeat(51),
      displayName: 'Bad Model',
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
    });
    expect(result.success).toBe(false);
  });

  it('accepts model IDs with dots (version separators)', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      modelId: 'gpt-4.1-mini',
      displayName: 'GPT-4.1 Mini',
      inputPricePerMillion: 0.40,
      outputPricePerMillion: 1.60,
    });
    expect(result.success).toBe(true);
  });

  it('accepts model IDs with colons', () => {
    const result = createModelSchema.safeParse({
      providerId: 'openai',
      modelId: 'ft:gpt-4o:my-org:custom:id-1234',
      displayName: 'Fine-tuned GPT-4',
      inputPricePerMillion: 10.0,
      outputPricePerMillion: 30.0,
    });
    expect(result.success).toBe(true);
  });

  it('accepts date-suffixed model IDs', () => {
    const result = createModelSchema.safeParse({
      providerId: 'google',
      modelId: 'gemini-2.5-pro-preview-05-06',
      displayName: 'Gemini 2.5 Pro Preview',
      inputPricePerMillion: 3.0,
      outputPricePerMillion: 15.0,
    });
    expect(result.success).toBe(true);
  });
});

describe('admin model routes — updateModelSchema', () => {
  it('accepts partial updates', () => {
    const result = updateModelSchema.safeParse({ inputPricePerMillion: 10.0 });
    expect(result.success).toBe(true);
  });

  it('accepts isEnabled toggle', () => {
    const result = updateModelSchema.safeParse({ isEnabled: false });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (no updates)', () => {
    const result = updateModelSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects negative price', () => {
    const result = updateModelSchema.safeParse({ outputPricePerMillion: -5 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer maxOutputTokens', () => {
    const result = updateModelSchema.safeParse({ maxOutputTokens: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe('admin model routes — provider prefix warnings', () => {
  it('returns no warning for valid OpenAI model', () => {
    expect(checkModelPrefix('openai', 'gpt-5-turbo')).toBeUndefined();
  });

  it('returns no warning for OpenAI reasoning models (o3, o4)', () => {
    expect(checkModelPrefix('openai', 'o3')).toBeUndefined();
    expect(checkModelPrefix('openai', 'o4-mini')).toBeUndefined();
  });

  it('returns warning for wrong prefix on OpenAI', () => {
    const warning = checkModelPrefix('openai', 'claude-3');
    expect(warning).toBeDefined();
    expect(warning).toContain('doesn\'t match known openai model patterns');
  });

  it('returns no warning for valid Google model', () => {
    expect(checkModelPrefix('google', 'gemini-2.0-flash')).toBeUndefined();
  });

  it('returns no warning for valid xAI model', () => {
    expect(checkModelPrefix('xai', 'grok-3-mini')).toBeUndefined();
  });

  it('returns no warning for unknown provider (no prefix rules)', () => {
    expect(checkModelPrefix('custom-provider', 'any-model')).toBeUndefined();
  });
});
