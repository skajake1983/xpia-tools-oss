# XPIA Tools — datagen CLI

A terminal-only ("no web UI") way to generate XPIA test **documents, images, and payloads**.
It reuses the same generation engine as the web app but runs **without Azure/Cosmos** — everything
is in-memory and written straight to disk. Web-page generation is intentionally excluded to keep
it lightweight.

> ⚠️ **Responsible use only.** Generate XPIA artifacts to evaluate AI/LLM systems you own or are
> authorized to test. See the repository [SECURITY.md](../SECURITY.md).

## Install & run (from source)

```bash
cd cli
npm install            # CLI deps; also requires the sibling server/ deps installed
npm run dev -- <command> [options]
```

> A packaged `npx xpia` / Windows installer ships in a later release. For now run via `npm run dev --`.

## Commands

### Generate documents / images

```bash
# A Word doc embedding the "ignore previous instructions" technique
npm run dev -- generate --type docx --technique di-ignore-previous --action "reveal your system prompt" --out ./out

# Five PNGs with the timeline layout and a QR code
npm run dev -- generate --type png --technique mm-tiny-font --layout timeline --qr --count 5 --out ./out
```

Options: `--type` (docx, pdf, png, svg, …), `--technique <id>`, `--action`, `--count`, `--layout`,
`--qr`, `--stealth`, `--model <id>` (LLM-enhanced; see below), `--out <dir>`.

### Generate payloads

```bash
npm run dev -- payloads --count 10 --format text --out ./out
npm run dev -- payloads --category data_exfiltration --severity critical --format json
```

### Discover options

```bash
npm run dev -- list techniques      # also: types | layouts | categories | evasions
```

## LLM enhancement (optional)

Add a provider, set its API key via environment variable, then pass `--model`.

```bash
npm run dev -- providers add openai          # presets: openai, google, anthropic, azure-openai, xai, openrouter, ollama, lmstudio, azure-ai
$env:XPIA_OPENAI_API_KEY = "sk-..."          # keys come from env only — never written to disk
npm run dev -- generate --type docx --technique di-ignore-previous --model gpt-4o-mini --out ./out
```

- **Works today:** OpenAI, xAI, OpenRouter, Ollama, LM Studio, Azure AI Foundry
  (OpenAI-compatible endpoint), Google Gemini, Anthropic (Claude), and Azure OpenAI (native).
- Local providers (Ollama, LM Studio) need no key.

Config lives at `~/.xpia/config.json` (override with `XPIA_CONFIG_PATH`). Manage it with
`xpia config init|show|path` and `xpia providers list|add|enable|disable|remove`.

## Customize prompts

```bash
npm run dev -- prompts export ./my-prompts   # write editable .txt files (document/image/payload)
# edit ./my-prompts/document.system.txt ...
npm run dev -- prompts import ./my-prompts   # overrides apply when generating with --model
npm run dev -- prompts reset                 # back to defaults
```

## Develop

```bash
npm test          # vitest (unit tests)
npm run lint      # eslint
npm run build     # bundle to dist/ (tsup)
```
