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
const os = require('os');
const { app, BrowserWindow, Menu, dialog, safeStorage, shell } = require('electron');

const REPO_URL = 'https://github.com/skajake1983/xpia-tools-oss';

// Windows: claim our own taskbar identity (must match electron-builder appId) so the packaged app
// groups + shows the XPIA icon instead of the generic Electron one. In `npm run dev` the taskbar
// still shows electron.exe's icon — that's the dev runtime, not the app; the installed build is correct.
if (process.platform === 'win32') app.setAppUserModelId('com.xpiatools.desktop');

// Non-secret env, set before any server module loads. The desktop always runs
// with dev secret defaults (auth is bypassed locally) plus its own ENCRYPTION_KEY.
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'silent';
process.env.XPIA_LOCAL_MODE = '1';
// The removed-page screen links here instead of the localhost client URL (server config.publicSiteUrl).
if (!process.env.PUBLIC_SITE_URL) process.env.PUBLIC_SITE_URL = 'https://www.xpiatools.com';

// A fatal startup error has nowhere visible to go in a GUI app — record it to a file.
const STARTUP_LOG = path.join(os.tmpdir(), 'xpia-tools-startup.log');
function logFatal(where, err) {
  try {
    fs.writeFileSync(STARTUP_LOG, `[${where}] ${(err && err.stack) || err}\n`);
  } catch {
    /* ignore */
  }
}
process.on('uncaughtException', (err) => logFatal('uncaughtException', err));
process.on('unhandledRejection', (err) => logFatal('unhandledRejection', err));

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
    // The server, client, and prod node_modules ship as a single resources/payload.asar
    // (staged + packed by scripts/stage-payload.cjs). Electron reads straight through the
    // archive; sharp's native tree is unpacked to the sibling payload.asar.unpacked and
    // Electron redirects those requires there, so require() still resolves the addon.
    return require(path.join(process.resourcesPath, 'payload.asar', 'server', 'dist', 'server', 'src', 'create-local-app'));
  }
  require('tsx/cjs');
  return require('../../server/src/create-local-app');
}

function resolveClientDist() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'payload.asar', 'client', 'dist')
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
let serverPort = null; // loopback port, set once the server is listening (drives re-activation)
let mainServer = null; // the loopback app server (closed on quit)
let autoUpdater = null; // electron-updater instance (packaged only)
let manualUpdateCheck = false; // true while a user-triggered "Check for Updates" is pending

// ── LAN page server (read-only, opt-in) ──────────────────────────────────
// A second listener bound to 0.0.0.0 that serves ONLY generated page HTML by slug, so
// other devices on the network can load a page. The main app + admin API stay on
// 127.0.0.1. Off by default; the preference persists in network.json. Uses a port
// outside the loopback candidate range so the two servers never collide.
const LAN_PAGE_PORT = 43120;
let lanServer = null;
let makePublicPageApp = null;

function primaryLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return null;
}

function lanUrlBase() {
  const ip = primaryLanIp();
  return ip ? `http://${ip}:${LAN_PAGE_PORT}` : null;
}

function loadNetworkPref(dataDir) {
  try {
    const f = path.join(dataDir, 'network.json');
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    /* ignore */
  }
  return { lanEnabled: false };
}

function saveNetworkPref(dataDir, pref) {
  try {
    fs.writeFileSync(path.join(dataDir, 'network.json'), JSON.stringify(pref, null, 2));
  } catch {
    /* best effort */
  }
}

function startLanServer() {
  if (lanServer || !makePublicPageApp) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = makePublicPageApp().listen(LAN_PAGE_PORT, '0.0.0.0', () => {
      lanServer = s;
      resolve();
    });
    s.once('error', reject);
  });
}

function stopLanServer() {
  return new Promise((resolve) => {
    if (!lanServer) return resolve();
    lanServer.close(() => {
      lanServer = null;
      resolve();
    });
  });
}

async function startLocalServer() {
  process.env.ENCRYPTION_KEY = resolveEncryptionKey();

  // Persist the user's config (providers/models/keys/prompt edits) across restarts.
  const dataDir = app.getPath('userData');

  // Store generated document/image binaries under userData so the in-app History download
  // works (the prior no-store mode 404'd on re-download). History metadata is ephemeral (not
  // in the snapshot), so binaries from a previous run are unreferenceable — clear them on
  // startup to bound disk use. Must be set before the server module loads.
  const docsDir = path.join(dataDir, 'documents');
  process.env.XPIA_LOCAL_DOCS_DIR = docsDir;
  // Clear last session's generated binaries (unreferenceable — History metadata is ephemeral).
  // Async + fire-and-forget so a large prior-session docs dir never blocks the main process at
  // startup; the server recreates the dir on demand, well after this completes.
  fs.rm(docsDir, { recursive: true, force: true }, () => {});

  const serverMod = loadServerModule();
  const { bootstrapLocal, createLocalApp, dumpState } = serverMod;
  makePublicPageApp = serverMod.createPublicPageApp;
  const repos = await bootstrapLocal(undefined, { restore: loadState(dataDir) });
  const save = debounce(() => {
    Promise.resolve(dumpState(repos))
      .then((state) => saveState(dataDir, state))
      .catch(() => {});
  }, 400);

  // Opt-in, read-only LAN page serving. The client toggles it via /api/local/network.
  let netPref = loadNetworkPref(dataDir);
  const lanControl = {
    getStatus() {
      return { enabled: !!lanServer, url: lanServer ? lanUrlBase() : null };
    },
    async setEnabled(enabled) {
      if (enabled) await startLanServer();
      else await stopLanServer();
      netPref = { lanEnabled: !!lanServer };
      saveNetworkPref(dataDir, netPref);
      return this.getStatus();
    },
  };

  const expressApp = createLocalApp({ clientDistPath: resolveClientDist(), onWrite: save, lanControl });

  // Resume LAN serving if it was on last time.
  if (netPref.lanEnabled) {
    try {
      await startLanServer();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[xpia-desktop] LAN page server failed to start', err && err.message);
    }
  }

  // Prefer a stable port so copied page URLs stay valid across launches; fall back
  // to nearby ports, then any free port, if one is already in use.
  const candidates = [43110, 43111, 43112, 43113, 0];
  return new Promise((resolve, reject) => {
    const tryPort = (i) => {
      const server = expressApp.listen(candidates[i], '127.0.0.1', () => {
        mainServer = server;
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

function createWindow() {
  const winOptions = {
    width: 1440,
    height: 920,
    title: 'XPIA Tools Desktop Edition',
    backgroundColor: '#0a0a0a',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  };
  // In dev the window would otherwise show Electron's default icon; point it at the XPIA shield.
  // (The packaged app already gets its icon from the exe via electron-builder.)
  if (!app.isPackaged) winOptions.icon = path.join(__dirname, '..', 'build', 'icon.ico');
  win = new BrowserWindow(winOptions);
  // Keep our window title — the loaded page's <title> would otherwise override it.
  win.on('page-title-updated', (e) => e.preventDefault());
  // Show a local splash IMMEDIATELY so launch (and the first run right after an install) never looks
  // frozen while the loopback server boots. loadApp() swaps in the real app once the port is ready.
  win.loadFile(path.join(__dirname, 'splash.html'));
  // Open external links (docs, GitHub) in the system browser, not an Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => {
    win = null;
  });
}

/** Swap the visible window from the splash to the running local app. */
function loadApp(port) {
  if (win && !win.isDestroyed()) win.loadURL(`http://127.0.0.1:${port}/app`);
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
    if (manualUpdateCheck && win && !win.isDestroyed()) {
      manualUpdateCheck = false;
      dialog.showMessageBox(win, {
        type: 'error',
        title: 'Update check failed',
        message: 'Could not check for updates.',
        detail: String((err && err.message) || err),
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (manualUpdateCheck && win && !win.isDestroyed()) {
      manualUpdateCheck = false;
      dialog.showMessageBox(win, { type: 'info', title: 'Check for Updates', message: 'You are on the latest version.' });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    manualUpdateCheck = false;
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

/** File → Check for Updates… — gives explicit feedback (up to date / error). */
function checkForUpdatesManually() {
  if (!app.isPackaged) {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Check for Updates',
      message: 'Updates are available in the installed app only.',
    });
    return;
  }
  if (!autoUpdater) return;
  manualUpdateCheck = true;
  autoUpdater.checkForUpdates().catch(() => {
    manualUpdateCheck = false;
  });
}

/** Replace Electron's default menu with a sensible app menu (incl. Help → GitHub). */
function buildAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ label: 'Check for Updates…', click: () => checkForUpdatesManually() }, { type: 'separator' }, { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' }, // deletes the selected text in an input field
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
    {
      role: 'help',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal(`${REPO_URL}#readme`) },
        { label: 'Report an Issue…', click: () => shell.openExternal(`${REPO_URL}/issues/new`) },
        { label: 'View Releases', click: () => shell.openExternal(`${REPO_URL}/releases`) },
        { type: 'separator' },
        {
          label: 'About XPIA Tools',
          click: () =>
            dialog.showMessageBox(win, {
              type: 'info',
              title: 'About XPIA Tools',
              message: 'XPIA Tools',
              detail: `AI Security Research Toolkit\nVersion ${app.getVersion()}\n\n${REPO_URL}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  // Put the window + menu up FIRST so the app is visible immediately (a splash) while the local
  // server boots — previously nothing appeared until the whole server was up, which read as a hang.
  // The server sets `Cache-Control: no-store` on every response and Vite content-hashes assets, so
  // the old per-boot session.clearCache() was redundant and has been dropped.
  createWindow();
  buildAppMenu();
  try {
    const port = await startLocalServer();
    serverPort = port;
    // eslint-disable-next-line no-console
    console.log(`[xpia-desktop] local server ready on 127.0.0.1:${port}`);
    loadApp(port);
    setupAutoUpdates();
  } catch (err) {
    logFatal('whenReady', err);
    // eslint-disable-next-line no-console
    console.error('[xpia-desktop] startup failed', err);
    if (win && !win.isDestroyed()) {
      dialog
        .showMessageBox(win, {
          type: 'error',
          title: 'XPIA Tools failed to start',
          message: 'The local server could not start.',
          detail: String((err && err.message) || err),
        })
        .finally(() => app.quit());
    } else {
      app.quit();
    }
  }
});

app.on('activate', () => {
  // macOS re-activation (and safety elsewhere): rebuild the window, going straight to the app if the
  // server is already up, otherwise showing the splash until startup finishes.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    if (serverPort != null) loadApp(serverPort);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // Release the local servers promptly so no file handle lingers into an update
  // install (a lingering handle is the root of the "failed to uninstall" update error).
  try {
    if (mainServer) mainServer.close();
  } catch {
    /* ignore */
  }
  try {
    if (lanServer) lanServer.close();
  } catch {
    /* ignore */
  }
});
