import { loadConfig, saveConfig, keyEnvVar } from '../config-store';
import { getPreset, catalogKeys } from '../catalog';

export function runProvidersList(log: (s: string) => void = console.log): void {
  const cfg = loadConfig();
  if (!cfg.providers.length) {
    log('No providers configured. Add one:  xpia providers add <preset>');
    log('Presets: ' + catalogKeys().join(', '));
    return;
  }
  for (const p of cfg.providers) {
    const env = keyEnvVar(p);
    const hasKey = !!process.env[env];
    log(`${p.id.padEnd(14)} ${p.isEnabled ? 'on ' : 'off'}  key:${hasKey ? 'set' : 'unset (' + env + ')'}  ${p.baseUrl}`);
  }
}

export function runProvidersAdd(key: string, log: (s: string) => void = console.log): void {
  const preset = getPreset(key);
  if (!preset) throw new Error(`Unknown preset "${key}". Available: ${catalogKeys().join(', ')}`);
  const cfg = loadConfig();
  if (cfg.providers.some((p) => p.id === preset.provider.id)) {
    throw new Error(`Provider "${preset.provider.id}" is already configured.`);
  }
  cfg.providers.push({ ...preset.provider, isEnabled: true });
  for (const m of preset.models) {
    if (!cfg.models.some((x) => x.id === m.id)) cfg.models.push(m);
  }
  saveConfig(cfg);
  const modelNote = preset.models.length ? ` with model(s): ${preset.models.map((m) => m.id).join(', ')}` : '';
  log(`Added provider "${preset.provider.id}"${modelNote}.`);
  if (preset.note) log('Note: ' + preset.note);
  log(`Set the API key via env var:  ${keyEnvVar(preset.provider)}`);
}

export function runProvidersEnable(id: string, enabled: boolean, log: (s: string) => void = console.log): void {
  const cfg = loadConfig();
  const p = cfg.providers.find((x) => x.id === id);
  if (!p) throw new Error(`Provider "${id}" not found.`);
  p.isEnabled = enabled;
  saveConfig(cfg);
  log(`Provider "${id}" ${enabled ? 'enabled' : 'disabled'}.`);
}

export function runProvidersRemove(id: string, log: (s: string) => void = console.log): void {
  const cfg = loadConfig();
  const before = cfg.providers.length;
  cfg.providers = cfg.providers.filter((x) => x.id !== id);
  cfg.models = cfg.models.filter((m) => m.providerId !== id);
  if (cfg.providers.length === before) throw new Error(`Provider "${id}" not found.`);
  saveConfig(cfg);
  log(`Removed provider "${id}".`);
}
