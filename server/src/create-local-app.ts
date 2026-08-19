// ── Standalone / Local (Desktop) App Factory ────────────────────────────
// ADDITIVE: this file is NOT imported by the Azure cloud entrypoint (index.ts).
// It assembles the same Express routes against an injected local data layer,
// with no CosmosDB, telemetry, or Blob Storage dependencies — for the CLI's
// sibling desktop build. Reuses the server's own express + route modules so all
// runtime deps resolve from server/node_modules (a desktop package can't reach
// them directly). Cloud behaviour is unchanged.

import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';

import { setRepos } from './db/repos';
import { createMockRepositories } from './db/repositories';
import { seedDatabase } from './db/seed';
import { LOCAL_USER_ID } from './middleware/auth';
import { correlationIdMiddleware } from './middleware/correlationId';
import * as pageService from './services/page.service';
import type {
  Repositories,
  UserDoc,
  ProviderDoc,
  ModelDoc,
  ApiKeyDoc,
  PromptOverrideDoc,
  PromptTemplateDoc,
  UserActivePromptDoc,
  PageDoc,
} from './db/repositories/types';

import authRoutes from './routes/auth';
import documentRoutes from './routes/documents';
import imageRoutes from './routes/images';
import payloadRoutes from './routes/payloads';
import pageRoutes from './routes/pages';
import llmRoutes from './routes/llm';
import adminRoutes from './routes/admin';
import usageRoutes from './routes/usage';
import keysRoutes from './routes/keys';
import inviteRoutes from './routes/invites';
import inviteRequestRoutes from './routes/invite-requests';
import feedbackRoutes from './routes/feedback';
import promptTemplateRoutes from './routes/prompt-templates';

// ── Local persistence snapshot ──────────────────────────────────────────
// The user's configuration and generated web pages that must survive restarts.
// Users/auth/usage and generated documents remain ephemeral (the local admin
// is re-seeded each run).

export interface LocalState {
  providers: ProviderDoc[];
  models: ModelDoc[];
  apiKeys: ApiKeyDoc[];
  overrides: PromptOverrideDoc[];
  templates: PromptTemplateDoc[];
  activePrompts: UserActivePromptDoc[];
  pages: PageDoc[];
}

/** Read the persistable state out of the repositories. */
export async function dumpState(repos: Repositories): Promise<LocalState> {
  return {
    providers: await repos.config.getAllProviders(true),
    models: await repos.config.getAllModels(false),
    apiKeys: await repos.apiKeys.getAllActive(),
    overrides: await repos.config.getAllOverrides(),
    // Only user-created templates — system defaults are re-seeded each run.
    templates: (await repos.config.getTemplatesForUser(LOCAL_USER_ID)).filter((t) => !t.isSystem),
    activePrompts: await repos.config.getActivePrompts(LOCAL_USER_ID),
    pages: await repos.pages.listByUser(LOCAL_USER_ID),
  };
}

/** Write a previously-dumped state back into fresh repositories. */
export async function restoreState(repos: Repositories, state: Partial<LocalState>): Promise<void> {
  for (const p of state.providers ?? []) await repos.config.upsert(p);
  for (const m of state.models ?? []) await repos.config.createModel(m);
  for (const o of state.overrides ?? []) await repos.config.upsertOverride(o);
  for (const t of state.templates ?? []) await repos.config.createTemplate(t);
  for (const a of state.activePrompts ?? []) await repos.config.setActivePrompt(a);
  for (const k of state.apiKeys ?? []) await repos.apiKeys.create(k);
  for (const p of state.pages ?? []) await repos.pages.create(p);
}

// ── Bootstrap ───────────────────────────────────────────────────────────

/** Seed the single local admin user (idempotent). This is the identity that
 *  `authMiddleware` injects when XPIA_LOCAL_MODE=1. */
async function seedLocalUser(repos: Repositories): Promise<void> {
  const existing = await repos.users.getById(LOCAL_USER_ID);
  if (existing) return;
  const now = new Date().toISOString();
  const user: UserDoc = {
    id: LOCAL_USER_ID,
    email: 'local@localhost',
    passwordHash: 'local-no-login', // never used — the desktop has no login flow
    totpSecret: null,
    totpEnabled: true,
    isAdmin: true,
    isSuperadmin: true,
    forcePasswordChange: false,
    firstName: 'Local',
    lastName: 'User',
    organization: null,
    jobTitle: null,
    linkedinUrl: null,
    termsAcceptedAt: now,
    canGenerateInvites: true,
    emailVerified: true,
    limits: { dailyTokenLimit: 0, isSuspended: false, updatedBy: null }, // 0 = unlimited (BYOK)
    createdAt: now,
    updatedAt: now,
  };
  await repos.users.create(user);
}

export interface BootstrapOptions {
  /** A previously-dumped state to restore (persistent local storage). */
  restore?: Partial<LocalState>;
}

/**
 * Wire the local data layer and seed baseline data. Call once before serving.
 * Pass a persistent `Repositories` implementation, or (simpler) the in-memory
 * mock repositories plus a `restore` snapshot for JSON-file persistence.
 */
export async function bootstrapLocal(repos?: Repositories, opts: BootstrapOptions = {}): Promise<Repositories> {
  const r = repos ?? createMockRepositories();
  setRepos(r);
  await seedDatabase(r); // system prompt templates
  if (opts.restore) await restoreState(r, opts.restore); // user's saved config
  await seedLocalUser(r);
  return r;
}

// ── App factory ─────────────────────────────────────────────────────────

/** Host-provided control for the opt-in, read-only LAN page server (desktop only). */
export interface LanControl {
  getStatus(): { enabled: boolean; url: string | null };
  setEnabled(enabled: boolean): Promise<{ enabled: boolean; url: string | null }>;
}

export interface LocalAppOptions {
  /** Absolute path to the built React client (client/dist). Omit to serve API only. */
  clientDistPath?: string;
  /** Invoked after each successful mutating (non-GET) /api request, for persistence. */
  onWrite?: () => void;
  /** When provided (desktop), mounts /api/local/network to toggle LAN page serving. */
  lanControl?: LanControl;
}

/** Build the Express app for local/desktop use (no Cosmos, telemetry, or blob). */
export function createLocalApp(opts: LocalAppOptions = {}): express.Express {
  const app = express();

  // The desktop runs inside Electron/Chromium, which caches GET responses (the SPA bundle and API
  // reads like /documents/history) and serves stale copies — the cause of History not refreshing
  // after a generate. Force no-store on every response so reads are always fresh.
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    next();
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  // Example uploads (base64 files) for "vary from an example" need headroom; mount a raised limit
  // on just those paths before the global 1 MB parser (which then skips the already-parsed body).
  app.use(['/api/documents/analyze-example', '/api/payloads/analyze-example'], express.json({ limit: '15mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(correlationIdMiddleware);

  // Persistence hook: after any successful mutating API request, notify the host.
  if (opts.onWrite) {
    const onWrite = opts.onWrite;
    app.use('/api', (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.on('finish', () => {
          if (res.statusCode < 400) onWrite();
        });
      }
      next();
    });
  }

  // Same route surface as the cloud app (index.ts), minus maintenance middleware.
  app.use('/api/auth', authRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/images', imageRoutes);
  app.use('/api/payloads', payloadRoutes);
  app.use('/api/pages', pageRoutes);
  app.use('/api/llm', llmRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/usage', usageRoutes);
  app.use('/api/keys', keysRoutes);
  app.use('/api/invites', inviteRoutes);
  app.use('/api/invite-requests', inviteRequestRoutes);
  app.use('/api/feedback', feedbackRoutes);
  app.use('/api/prompt-templates', promptTemplateRoutes);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', mode: 'local', maintenance: false, timestamp: new Date().toISOString() });
  });

  // Desktop-only: read/toggle the opt-in LAN page server. Mounted only when the host
  // provides a control hook, so it 404s on the cloud app and the client feature-detects.
  if (opts.lanControl) {
    const lanControl = opts.lanControl;
    app.get('/api/local/network', (_req, res) => res.json(lanControl.getStatus()));
    app.post('/api/local/network', async (req, res) => {
      try {
        const status = await lanControl.setEnabled(!!(req.body && req.body.enabled));
        res.json(status);
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to toggle network serving' });
      }
    });
  }

  // Serve the built client and fall back to index.html for SPA routes.
  if (opts.clientDistPath && fs.existsSync(opts.clientDistPath)) {
    const dist = opts.clientDistPath;
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  return app;
}

// ── LAN page server (read-only) ─────────────────────────────────────────
// A separate, minimal app that serves ONLY generated page HTML by slug. The desktop
// binds it to 0.0.0.0 (opt-in) so other devices on the LAN can load a page — while the
// full app + admin/keys/generation API above stay on 127.0.0.1. Because local mode
// bypasses auth, that isolation is what keeps LAN exposure safe: nothing here mounts
// the authenticated routes.

const PUBLIC_SLUG_RE = /^[a-f0-9-]{8}$/;

export function createPublicPageApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/:slug', async (req, res) => {
    const slug = req.params.slug;
    if (!PUBLIC_SLUG_RE.test(slug)) {
      res.status(400).type('text/plain').send('Invalid page identifier');
      return;
    }
    const page = await pageService.getPageBySlug(slug);
    if (!page) {
      res
        .status(404)
        .type('text/html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>Not found</title>' +
            '<body style="font-family:system-ui;padding:2rem;color:#334155">This page is not available.</body>',
        );
      return;
    }
    // Same strict CSP as the in-app public route, so the page renders identically.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'none'; script-src 'none'; frame-ancestors 'none'",
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.type('text/html; charset=utf-8').send(page.content);
  });

  // Everything else is refused — this listener serves page HTML only.
  app.use((_req, res) => res.status(404).type('text/plain').send('Not found'));

  return app;
}
