import { configPath, configExists, loadConfig, saveConfig } from '../config-store';
import { catalogKeys } from '../catalog';

export function runConfigPath(log: (s: string) => void = console.log): void {
  log(configPath());
}

export function runConfigInit(log: (s: string) => void = console.log): string {
  const p = configPath();
  if (configExists()) {
    log(`Config already exists at ${p}`);
    return p;
  }
  saveConfig({ providers: [], models: [] });
  log(`Created ${p}`);
  log(`Add a provider with:  xpia providers add <preset>   (presets: ${catalogKeys().join(', ')})`);
  return p;
}

export function runConfigShow(log: (s: string) => void = console.log): void {
  log(JSON.stringify(loadConfig(), null, 2));
}
