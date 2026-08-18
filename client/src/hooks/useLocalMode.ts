import { useEffect, useState } from 'react';
import { api } from '../lib/api';

// Cached across the app: the mode never changes within a session.
let cached: boolean | null = null;

/**
 * True when running in the standalone desktop (local) build, false on the web app.
 * Feature-detected via /api/health (`mode: 'local'`). Used to hide multi-user / cloud
 * UI (login, invites, 2FA, feedback, etc.) that has no meaning in the single-user app.
 */
export function useLocalMode(): boolean {
  const [isLocal, setIsLocal] = useState<boolean>(cached ?? false);
  useEffect(() => {
    if (cached !== null) return;
    let alive = true;
    api
      .health()
      .then((h) => {
        cached = h?.mode === 'local';
        if (alive) setIsLocal(cached);
      })
      .catch(() => {
        cached = false;
      });
    return () => {
      alive = false;
    };
  }, []);
  return isLocal;
}
