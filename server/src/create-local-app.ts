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
import type {
  Repositories,
  UserDoc,
  ProviderDoc,
  ModelDoc,
  ApiKeyDoc,
  PromptOverrideDoc,
  PromptTemplateDoc,
  UserActivePromptDoc,
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
// The user's configuration that must survive restarts. Users/auth/usage/
// content are intentionally ephemeral (the local admin is re-seeded each run).

export interface LocalState {
  providers: ProviderDoc[];
  models: ModelDoc[];
  apiKeys: ApiKeyDoc[];
  overrides: PromptOverrideDoc[];
  templates: PromptTemplateDoc[];
  activePrompts: UserActivePromptDoc[];
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

export interface LocalAppOptions {
  /** Absolute path to the built React client (client/dist). Omit to serve API only. */
  clientDistPath?: string;
  /** Invoked after each successful mutating (non-GET) /api request, for persistence. */
  onWrite?: () => void;
}

/** Build the Express app for local/desktop use (no Cosmos, telemetry, or blob). */
export function createLocalApp(opts: LocalAppOptions = {}): express.Express {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
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

  // Serve the built client and fall back to index.html for SPA routes.
  if (opts.clientDistPath && fs.existsSync(opts.clientDistPath)) {
    const dist = opts.clientDistPath;
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  return app;
}
