# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release notes are also generated automatically on each `vX.Y.Z` tag — see the
[Releases](https://github.com/skajake1983/xpia-tools-oss/releases) page.

## [Unreleased]

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

[Unreleased]: https://github.com/skajake1983/xpia-tools-oss/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/skajake1983/xpia-tools-oss/releases/tag/v1.0.0
