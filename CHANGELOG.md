# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release notes are also generated automatically on each `vX.Y.Z` tag — see the
[Releases](https://github.com/skajake1983/xpia-tools-oss/releases) page.

## [Unreleased]

## [1.5.1] - 2026-08-20

### Changed

- **Desktop:** the window now appears immediately with a loading splash on launch, instead of staying hidden until the local server finished booting — so startup (and the first run right after an install) no longer looks frozen.
- **Desktop:** the Windows installer packs the app payload into a single asar, cutting the installed file count from ~17,500 loose files to ~50, so the one-click installer no longer stalls mid-unpack.

### Fixed

- **Desktop:** hide the account email and "2FA Enabled" badge in the local build (the desktop tool has no auth, so they were misleading).
- **CI:** build and test on Node 22 (the client test toolchain — jsdom 30 / undici 8 — requires it, and Node 20 is end-of-life).

## [1.5.0] - 2026-08-19

### Added

- **Vary from an example** — upload a real XPIA document (.docx/.pdf/.rtf/.txt/.md) or paste a
  payload; the selected model detects the embedded technique and generates variants of it —
  reworded, re-embedded, or re-targeted per the axes you choose. Consent-gated before anything is
  sent to your provider. Available on the Document and Payload generators.
- **Import models from a provider** — Admin → Models → "Import from provider" pulls a provider's
  live model list using your API key and lets you pick which to add (OpenAI, Google, xAI,
  OpenRouter, Anthropic). Azure is excluded — deployments aren't listable with a data-plane key.
- **Per-key Azure OpenAI endpoint** — the Azure resource endpoint (and optional API version) now
  live on the API key in Settings → API Keys, instead of a provider base URL plus an env var.
- In-app Help for "Vary an example", and Rules of Engagement policy sections for Anthropic (Claude)
  and Microsoft Copilot.

### Fixed

- The desktop app now reliably saves generated documents, images, and payload variants to History
  and keeps them across navigation; generation no longer opens a Save As dialog — download from
  History instead. (Root cause: a dynamic import that failed to resolve under Electron's runtime.)
- Sets the Windows taskbar identity/icon so the installed app shows the XPIA shield.

## [1.4.0] - 2026-08-17

### Added

- **Application menu** for the desktop app — File (Check for Updates…), Edit, View, Window,
  and a Help menu linking to the GitHub documentation, issue tracker, and releases.
- The desktop app tailors itself to single-user local use: multi-user and cloud-only UI is
  hidden (admin Requests / Invite Codes / Users & Roles / Usage tabs; Two-Factor and Change
  Password in Settings; Send Feedback and Logout; and the matching in-app Help sections).
  Detected via `/api/health`, so the web deployment is unaffected.

### Fixed

- The desktop app now uses the XPIA shield as its Windows icon instead of the default
  Electron icon.
- Reliable auto-updates: the installer is now one-click per-user, resolving the intermittent
  "Failed to uninstall old application files" error when applying an update. Because the fix
  ships in the installer, the current build must be updated to this one manually once;
  subsequent updates are automatic.

## [1.3.0] - 2026-08-17

### Added

- **Export a generated web page's HTML** — new "Copy page HTML" and "Download .html"
  actions on the Web Pages screen, so a page can be hosted anywhere the target can reach
  (your own server, a static host, or a tunnel), not just the local preview URL.
- **Serve pages on your local network** — an opt-in, off-by-default toggle starts a
  read-only listener so another device (or a local / self-hosted AI you're testing) can
  load a generated page at `http://<your-lan-ip>:43120/<id>`. The listener serves page
  HTML only; the app's admin, API keys, and generation endpoints stay bound to localhost.

### Changed

- The desktop's local server now uses a stable port, so copied page URLs stay valid across
  app restarts.

## [1.2.1] - 2026-08-17

### Added

- Generated web pages now persist across desktop restarts (previously they were cleared on
  exit), alongside providers, models, API keys, and prompt edits.

### Fixed

- Much smaller, faster Windows installer — the desktop build no longer bundles the Cosmos
  and Application Insights / OpenTelemetry SDKs it never loads, cutting the shipped file
  count by ~64% (46,916 → 16,751 files) and the installer from 156 MB to 115 MB. This fixes
  the installer appearing to stall near the end while unpacking tens of thousands of files.
- Desktop installer filename is now space-free (`XPIA-Tools-Setup-<version>.exe`) so the
  auto-update asset name matches the generated `latest.yml`, keeping GitHub-hosted updates
  reliable.

## [1.2.0] - 2026-08-17

### Added

- **Automatic updates for the Windows desktop app** — the installed app checks GitHub
  Releases on launch (and every 6 hours), downloads new versions in the background, and
  prompts to restart to apply them (via `electron-updater`). Downloads are verified by
  SHA-512 over HTTPS; on our per-user install, updates apply silently with no UAC
  prompt. Additive and desktop-only — the CLI and the Azure web deployment are
  unaffected.

## [1.1.0] - 2026-08-17

### Added

- **Standalone Windows desktop app (Electron)** — a local, no-account build of the generator with
  a one-click installer. Reuses the existing generation engine and React UI unchanged (a local,
  auth-disabled mode); providers/models/API keys/prompt edits persist locally, and API keys are
  encrypted at rest with an OS-backed key. Ships as `desktop/`.
- Dependency upgrades across the client and server: React 19, Vitest 4 (+ coverage-v8), jsdom 30,
  and other minor/patch bumps, plus GitHub Actions v7.

### Fixed

- The server no longer deletes the Anthropic provider on startup (a stale seed-cleanup list was
  removing it), so an Anthropic integration added from the catalog now persists — on the web app
  and the desktop app alike.

## [1.0.0] - 2026-08-16

### Added

- Initial public release of XPIA Tools — an AI security research toolkit for cross-prompt
  injection (XPIA) testing.
- Document, image, payload, and web-page generation with embedded XPIA techniques.
- Multi-provider LLM gateway with per-user API key management: OpenAI (and OpenAI-compatible
  endpoints), Google Gemini, Anthropic (Claude), and Azure OpenAI (native).
- Admin console: user management, provider/model config with a one-click integration catalog,
  invite codes, usage metrics, prompt templates, and audit log.
- Authentication: JWT + refresh tokens, 2FA (TOTP), rate limiting, AES-256-GCM key
  encryption, and email verification.
- CLI datagen tool for generating documents, images, and payloads locally (no Azure required).
- Developer tooling: ESLint + Prettier, test coverage reporting with regression thresholds, and
  CI that lints, builds, and tests the server, client, and CLI.

[Unreleased]: https://github.com/skajake1983/xpia-tools-oss/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/skajake1983/xpia-tools-oss/releases/tag/v1.5.0
[1.4.0]: https://github.com/skajake1983/xpia-tools-oss/releases/tag/v1.4.0
[1.3.0]: https://github.com/skajake1983/xpia-tools-oss/releases/tag/v1.3.0
[1.2.1]: https://github.com/skajake1983/xpia-tools-oss/releases/tag/v1.2.1
[1.2.0]: https://github.com/skajake1983/xpia-tools-oss/releases/tag/v1.2.0
[1.1.0]: https://github.com/skajake1983/xpia-tools-oss/releases/tag/v1.1.0
[1.0.0]: https://github.com/skajake1983/xpia-tools-oss/releases/tag/v1.0.0
