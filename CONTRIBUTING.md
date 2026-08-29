# Contributing to XPIA Tools

Thanks for your interest in contributing! XPIA Tools is an AI security research toolkit,
and contributions of all kinds — bug fixes, features, docs, and tests — are welcome.

> **Responsible use:** This project generates cross-prompt injection (XPIA) test artifacts
> intended for evaluating the resilience of AI/LLM systems **you own or are explicitly
> authorized to test**. Do not use it to attack systems without authorization. See
> [SECURITY.md](./SECURITY.md).

## Prerequisites

- **Node.js 22.x**
- An **Azure Cosmos DB emulator** (local) or a Cosmos DB account
- At least one LLM API key (OpenAI or Google AI) for exercising generation features

## Getting started

```bash
# Install dependencies for root, server, and client
npm run install:all

# Copy environment templates and fill in values
cp server/.env.example server/.env
cp client/.env.example client/.env   # optional; only VITE_PUBLIC_SITE_URL

# Run server (3001) + client (5173) in dev mode
npm run dev
```

## Development standards

- **TypeScript strict** — no `any`, no unchecked casts.
- **Validate at boundaries** — every API endpoint uses a Zod schema.
- **Tests are required** — new logic ships with unit tests. The full suite must pass:
  ```bash
  npm test          # server + client
  ```
- Keep changes focused; avoid unrelated refactors in the same PR.
- Never commit secrets. `.env` files are gitignored — keep them that way.

## Pull request flow

1. Fork the repo and create a feature branch off `main`.
2. Make your change with tests and a clear description.
3. Ensure `npm test` and the build pass locally:
   ```bash
   npm run build
   ```
4. Open a PR against `main`. CI runs linting and the full test suite on every PR.
5. A maintainer reviews and merges. Deployment is handled separately by the project owner.

## Commit messages

Use clear, imperative messages (e.g. `fix: correct 2FA lockout window`). Conventional
Commit prefixes (`feat`, `fix`, `docs`, `test`, `chore`) are appreciated but not required.

## Reporting bugs / requesting features

Use the GitHub issue templates. For security vulnerabilities, **do not** open a public
issue — follow [SECURITY.md](./SECURITY.md).
