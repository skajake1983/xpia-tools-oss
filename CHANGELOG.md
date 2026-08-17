# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release notes are also generated automatically on each `vX.Y.Z` tag — see the
[Releases](https://github.com/skajake1983/xpia-tools-oss/releases) page.

## [Unreleased]

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

[Unreleased]: https://github.com/skajake1983/xpia-tools-oss/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/skajake1983/xpia-tools-oss/releases/tag/v1.1.0
[1.0.0]: https://github.com/skajake1983/xpia-tools-oss/releases/tag/v1.0.0
