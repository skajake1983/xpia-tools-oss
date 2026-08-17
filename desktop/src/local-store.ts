// Persistent local storage for the desktop: the user's providers/models/keys/
// prompt edits, snapshotted to a JSON file in the app's data directory. Pure fs
// I/O — the actual repo <-> snapshot mapping lives in server/create-local-app
// (dumpState/restoreState) so it stays next to the repository interface.
import fs from 'fs';
import path from 'path';
import type { LocalState } from '../../server/src/create-local-app';

const FILE = 'state.json';

/** Read the persisted state from disk (empty object if none or unreadable). */
export function loadState(dataDir: string): Partial<LocalState> {
  try {
    const file = path.join(dataDir, FILE);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<LocalState>;
    }
  } catch {
    // corrupt/unreadable — start fresh
  }
  return {};
}

/** Write the state to disk atomically (tmp file + rename). */
export function saveState(dataDir: string, state: LocalState): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, FILE);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  } catch {
    // best effort — persistence failure must never crash the app
  }
}

/** Coalesce a burst of calls into a single trailing invocation. */
export function debounce(fn: () => void, ms: number): () => void {
  let timer: NodeJS.Timeout | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}
