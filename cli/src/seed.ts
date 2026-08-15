import repos from '../../server/src/db/repos';
import { encryptApiKey } from '../../server/src/services/llm/encryption';
import { createTemplate, setActiveTemplate, type PromptCategory } from '../../server/src/services/prompt-template.service';
import { loadConfig, keyEnvVar, type CliConfig } from './config-store';

export const CLI_USER = 'cli-user';

export interface SeedResult {
  providers: number;
  models: number;
  keys: number;
  prompts: number;
}

/** Seed the in-memory repos with providers, models, and (env-sourced) API keys from local config. */
export async function seedFromConfig(cfg: CliConfig = loadConfig()): Promise<SeedResult> {
  const now = new Date().toISOString();
  let keys = 0;

  for (const p of cfg.providers) {
    await repos.config.upsert({
      id: p.id,
      type: 'provider',
      name: p.name,
      displayName: p.displayName,
      baseUrl: p.baseUrl,
      isEnabled: p.isEnabled,
      createdAt: now,
    });

    const key = process.env[keyEnvVar(p)] ?? (p.keyless ? 'local' : undefined);
    if (p.isEnabled && key) {
      const enc = encryptApiKey(key);
      await repos.apiKeys.create({
        id: `key-${p.id}`,
        userId: CLI_USER,
        providerId: p.id,
        encryptedKey: enc.encrypted,
        keyIv: enc.iv,
        keyTag: enc.tag,
        keyFingerprint: enc.keyFingerprint,
        keyLabel: 'cli',
        isActive: true,
        createdAt: now,
      });
      keys++;
    }
  }

  for (const m of cfg.models) {
    await repos.config.createModel({
      id: m.id,
      type: 'model',
      providerId: m.providerId,
      modelId: m.modelId,
      displayName: m.displayName,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
      maxContextTokens: m.maxContextTokens,
      maxOutputTokens: m.maxOutputTokens,
      supportsStreaming: true,
      isEnabled: true,
      createdAt: now,
    });
  }

  for (const pr of cfg.prompts ?? []) {
    const tpl = await createTemplate(CLI_USER, {
      category: pr.category as PromptCategory,
      name: 'cli-custom',
      systemPrompt: pr.systemPrompt,
      userPrompt: pr.userPrompt,
    });
    await setActiveTemplate(CLI_USER, pr.category as PromptCategory, tpl.id);
  }

  return { providers: cfg.providers.length, models: cfg.models.length, keys, prompts: (cfg.prompts ?? []).length };
}
