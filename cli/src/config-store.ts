import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

export interface CliProvider {
  id: string;
  name: string;
  displayName: string;
  baseUrl: string;
  isEnabled: boolean;
  /** Env var holding the API key; defaults to XPIA_<ID>_API_KEY. */
  apiKeyEnv?: string;
  /** Local/keyless endpoints (Ollama, LM Studio) that don't require an API key. */
  keyless?: boolean;
}

export interface CliModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  maxOutputTokens: number;
  maxContextTokens: number;
}

export interface CliPromptOverride {
  category: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface CliConfig {
  providers: CliProvider[];
  models: CliModel[];
  prompts?: CliPromptOverride[];
}

/** Path to the local CLI config (override with XPIA_CONFIG_PATH). */
export function configPath(): string {
  return process.env.XPIA_CONFIG_PATH || join(homedir(), '.xpia', 'config.json');
}

export function configExists(): boolean {
  return existsSync(configPath());
}

export function loadConfig(): CliConfig {
  const p = configPath();
  if (!existsSync(p)) return { providers: [], models: [], prompts: [] };
  const raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<CliConfig>;
  return { providers: raw.providers ?? [], models: raw.models ?? [], prompts: raw.prompts ?? [] };
}

export function saveConfig(cfg: CliConfig): string {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf-8');
  return p;
}

/** Name of the env var that holds a provider's API key (keys are never stored on disk). */
export function keyEnvVar(provider: Pick<CliProvider, 'id' | 'apiKeyEnv'>): string {
  return provider.apiKeyEnv || `XPIA_${provider.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
}
