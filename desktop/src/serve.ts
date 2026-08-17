// Headless local server — runs the desktop core WITHOUT Electron, for testing
// (and as the code the Electron main reuses). `npm run serve` then curl the API.
import './preload';
import path from 'path';
import { bootstrapLocal, createLocalApp, dumpState } from '../../server/src/create-local-app';
import { loadState, saveState, debounce } from './local-store';

async function main(): Promise<void> {
  const dataDir = process.env.XPIA_DATA_DIR || path.resolve(__dirname, '../.local-data');
  const repos = await bootstrapLocal(undefined, { restore: loadState(dataDir) });
  const save = debounce(() => {
    void dumpState(repos).then((state) => saveState(dataDir, state));
  }, 400);

  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  const app = createLocalApp({ clientDistPath, onWrite: save });
  const port = Number(process.env.PORT) || 4599;
  app.listen(port, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log(`[xpia-desktop] local server on http://127.0.0.1:${port} (data: ${dataDir})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[xpia-desktop] failed to start', err);
  process.exit(1);
});
