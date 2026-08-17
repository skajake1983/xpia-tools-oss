// Electron main process (CommonJS, on purpose).
//
// Electron's built-in `require('electron')` must resolve BEFORE the tsx require
// hook is registered — once tsx is active, esbuild resolves 'electron' to the npm
// package (a path string) and the API comes back undefined. So this file stays
// plain JS. In development it transpiles the server's TypeScript on the fly via
// tsx; in the packaged app it requires the precompiled server (server/dist),
// shipped alongside its trimmed production node_modules under resources/ — no tsx.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, BrowserWindow, dialog, safeStorage, shell } = require('electron');

// Non-secret env, set before any server module loads. The desktop always runs
// with dev secret defaults (auth is bypassed locally) plus its own ENCRYPTION_KEY.
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'silent';
process.env.XPIA_LOCAL_MODE = '1';
if (!process.env.XPIA_NO_LOCAL_DOC_STORE) process.env.XPIA_NO_LOCAL_DOC_STORE = '1';

// ── Inlined persistent store (plain JS so it works in the packaged app) ──
function loadState(dataDir) {
  try {
    const file = path.join(dataDir, 'state.json');
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* corrupt/unreadable — start fresh */
  }
  return {};
}
function saveState(dataDir, state) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, 'state.json');
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  } catch {
    /* best effort */
  }
}
function debounce(fn, ms) {
  let timer = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

/** Load the server app factory — precompiled in the packaged app, tsx in dev. */
function loadServerModule() {
  if (app.isPackaged) {
    return require(path.join(process.resourcesPath, 'server', 'dist', 'server', 'src', 'create-local-app'));
  }
  require('tsx/cjs');
  return require('../../server/src/create-local-app');
}

function resolveClientDist() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'client', 'dist')
    : path.resolve(__dirname, '../../client/dist');
}

/**
 * Per-install 32-byte hex key for the server's AES-256-GCM key encryption, kept
 * OS-encrypted on disk (Windows DPAPI via safeStorage). Generated on first run so
 * stored API keys are protected with a machine-unique secret rather than the
 * shared deterministic dev key in server/config.
 */
function resolveEncryptionKey() {
  const keyPath = path.join(app.getPath('userData'), 'enc.key');
  try {
    if (fs.existsSync(keyPath)) {
      const blob = fs.readFileSync(keyPath);
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(blob) : blob.toString('utf8');
    }
  } catch {
    // unreadable/corrupt — regenerate below
  }
  const key = crypto.randomBytes(32).toString('hex');
  const toStore = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8');
  try {
    fs.writeFileSync(keyPath, toStore);
  } catch {
    // best effort — a non-persisted key still works for this session
  }
  return key;
}

let win = null;

async function startLocalServer() {
  process.env.ENCRYPTION_KEY = resolveEncryptionKey();
  const { bootstrapLocal, createLocalApp, dumpState } = loadServerModule();

  // Persist the user's config (providers/models/keys/prompt edits) across restarts.
  const dataDir = app.getPath('userData');
  const repos = await bootstrapLocal(undefined, { restore: loadState(dataDir) });
  const save = debounce(() => {
    Promise.resolve(dumpState(repos))
      .then((state) => saveState(dataDir, state))
      .catch(() => {});
  }, 400);

  const expressApp = createLocalApp({ clientDistPath: resolveClientDist(), onWrite: save });

  // Prefer a stable port so copied page URLs stay valid across launches; fall back
  // to nearby ports, then any free port, if one is already in use.
  const candidates = [43110, 43111, 43112, 43113, 0];
  return new Promise((resolve, reject) => {
    const tryPort = (i) => {
      const server = expressApp.listen(candidates[i], '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('failed to bind a local port'));
      });
      server.once('error', (err) => {
        if (err && err.code === 'EADDRINUSE' && i < candidates.length - 1) tryPort(i + 1);
        else reject(err);
      });
    };
    tryPort(0);
  });
}

function createWindow(port) {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    title: 'XPIA Tools',
    backgroundColor: '#0a0a0a',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(`http://127.0.0.1:${port}/app`);
  // Open external links (docs, GitHub) in the system browser, not an Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => {
    win = null;
  });
}

/**
 * Auto-update via GitHub Releases (electron-updater). Packaged builds only —
 * there is no updater in dev, so this never touches the tsx dev path. The app is
 * distributed unsigned, so integrity rests on the SHA-512 in `latest.yml` over
 * GitHub HTTPS rather than a publisher signature; electron-updater proceeds
 * because there is no signature to verify. Any failure (offline, no release yet,
 * rate limit) is swallowed so an update check can never take down the app.
 */
function setupAutoUpdates() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[xpia-desktop] auto-update unavailable', err && err.message);
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: () => {},
    debug: () => {},
    // eslint-disable-next-line no-console
    warn: (m) => console.warn('[updater]', m),
    // eslint-disable-next-line no-console
    error: (m) => console.error('[updater]', m),
  };

  autoUpdater.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[xpia-desktop] update check failed', (err && err.message) || err);
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (!win || win.isDestroyed()) return;
    dialog
      .showMessageBox(win, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `XPIA Tools ${info.version} is ready to install.`,
        detail: 'Restart to finish updating. Your providers, API keys, and prompt edits are kept.',
      })
      .then(({ response }) => {
        // (isSilent, isForceRunAfter): silent is safe for our per-user install
        // (no UAC), so the update applies without the NSIS wizard, then relaunches.
        if (response === 0) autoUpdater.quitAndInstall(true, true);
      })
      .catch(() => {});
  });

  const check = () =>
    autoUpdater.checkForUpdates().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[xpia-desktop] update check error', (err && err.message) || err);
    });

  check();
  // Re-check periodically for long-lived sessions (every 6 hours).
  setInterval(check, 6 * 60 * 60 * 1000).unref();
}

app.whenReady().then(async () => {
  try {
    const port = await startLocalServer();
    // eslint-disable-next-line no-console
    console.log(`[xpia-desktop] local server ready on 127.0.0.1:${port}`);
    createWindow(port);
    setupAutoUpdates();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[xpia-desktop] startup failed', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
