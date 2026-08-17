# XPIA Tools — Desktop (Electron)

A standalone, installable Windows app of the XPIA Tools generator. Runs entirely
**locally** — no server, no account, no Azure. Pick a provider, enter an API key,
and generate documents, images, and payloads with all the techniques; edit prompts
freely. Providers/models/API keys/prompt edits **persist across restarts**, and API
keys are encrypted at rest with an OS-backed key.

This package is **additive**: it reuses the `server/` generation engine and the
`client/` React UI unchanged (through a local, auth-disabled mode) and does not
affect the Azure web deployment or the CLI.

## Run in development

```bash
cd desktop
npm install
npm run build:deps   # build the server + client it reuses (once, or after changes)
npm run dev          # launches the Electron app
```

The window opens straight to the dashboard — no login. Add a provider under
**Admin → Add Integration**, enter its API key in **Settings**, then generate on the
**Documents / Images / Payloads** pages. Edit prompts under **Prompt Templates**.

> In dev, the server's TypeScript runs directly via `tsx` (no build step). Only
> `build:deps` (the compiled server/client the packaged app ships) needs a build.

## Build the Windows installer

```bash
cd desktop
npm run dist         # compiles server + client, then builds the NSIS installer
```

Output: `desktop/release/XPIA Tools-Setup-<version>.exe`. For quicker iteration,
`npm run pack:dir` produces an unpacked app under `desktop/release/win-unpacked/`.

The installer is **unsigned** — Windows SmartScreen warns about an unknown
publisher. To sign for distribution, provide a Windows code-signing certificate to
electron-builder (`CSC_LINK` / `CSC_KEY_PASSWORD`).

## How it works

- **`electron/entry.cjs`** — the Electron main process (plain CommonJS, so Electron's
  built-in `require('electron')` resolves before any transpiler hook). In dev it
  transpiles the server's TypeScript via `tsx`; in the packaged app it requires the
  precompiled server from `resources/server/dist`. It derives a per-install AES key
  via Electron `safeStorage` (Windows DPAPI) and sets `ENCRYPTION_KEY` before the
  server loads.
- **`server/src/create-local-app.ts`** (in the server package) — assembles the same
  Express routes against in-memory repositories with `XPIA_LOCAL_MODE=1`; auth is
  bypassed for a single seeded local admin, and the built client is served on a
  random localhost port.
- **Persistence** — the user's config is snapshotted to `state.json` in the app's
  user-data directory (`%APPDATA%\XPIA Tools\`) and restored on launch.
