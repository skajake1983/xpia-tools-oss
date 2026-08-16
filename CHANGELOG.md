# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release notes are also generated automatically on each `vX.Y.Z` tag — see the
[Releases](https://github.com/skajake1983/xpia-tools-oss/releases) page.

## [Unreleased]

### Added

- Anthropic (Claude) and Azure OpenAI (native) LLM provider adapters, registered in the gateway.
- Admin console "Add Integration" catalog picker to install a provider and its default model(s)
  in one click.
- Anthropic-specific research-framing system prompt.
- Test coverage reporting (`@vitest/coverage-v8`) with regression-floor thresholds for the server
  and client (`npm run test:coverage`).
- "Versioning & Releases" section in the README.

### Changed

- CI now lints the server and client and enforces coverage thresholds.
- Pinned `@eslint/js` to `^9` in the server and client to match the ESLint 9 runtime.

## [1.0.0] - 2026-08-15

### Added

- Initial public release of XPIA Tools — an AI security research toolkit for cross-prompt
  injection (XPIA) testing.
- Document, image, payload, and web-page generation with embedded XPIA techniques.
- Multi-provider LLM gateway (OpenAI, Google Gemini) with per-user API key management.
- Admin console: user management, provider/model config, invite codes, usage metrics,
  prompt templates, and audit log.
- Authentication: JWT + refresh tokens, 2FA (TOTP), rate limiting, AES-256-GCM key
  encryption, and email verification.

[Unreleased]: https://github.com/skajake1983/xpia-tools-oss/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/skajake1983/xpia-tools-oss/releases/tag/v1.0.0
