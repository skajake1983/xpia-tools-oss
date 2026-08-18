// Telemetry must be loaded before all other imports
import './telemetry';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { config } from './config';
import { initCosmos, getDatabase } from './db/cosmos-client';
import { createCosmosRepositories } from './db/repositories';
import { setRepos, getRepos } from './db/repos';
import { seedDatabase } from './db/seed';
import { validateEncryptionKeys } from './services/llm/encryption';

import { correlationIdMiddleware } from './middleware/correlationId';
import pinoHttp from 'pino-http';
import logger from './logger';
import { cleanupOldDocuments } from './services/document.service';
import { cleanupOldPayloads } from './services/payload.service';
import { cleanupOldUsageLogs } from './services/metering.service';
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
import { isMaintenanceMode, getMaintenanceMessage, getMaintenanceEndsAt } from './services/settings.service';

const app = express();

// Trust Azure App Service reverse proxy (required for express-rate-limit + X-Forwarded-For)
if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false,
}));
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));
app.use(cookieParser());
// Example uploads (base64 files) for "vary from an example" need headroom; mount a raised limit
// on just those paths before the global 1 MB parser (which then skips the already-parsed body).
app.use(['/api/documents/analyze-example', '/api/payloads/analyze-example'], express.json({ limit: '15mb' }));
app.use(express.json({ limit: '1mb' }));

// Correlation ID + structured request logging
app.use(correlationIdMiddleware);
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => (req as { url?: string }).url === '/api/health' },
  customProps: (req) => ({ correlationId: (req as unknown as Record<string, unknown>).correlationId }),
}));


// Initialize CosmosDB and repos (async — must complete before serving requests)
async function startServer(): Promise<void> {
  await initCosmos();
  const db = getDatabase();
  const repos = createCosmosRepositories(db);
  setRepos(repos);
  await seedDatabase(repos);
  await validateEncryptionKeys();

  // Ensure the Blob Storage 'documents' container exists for document history
  const { ensureDocumentsContainer, uploadStaticAssets } = await import('./services/blob-storage.service');
  await ensureDocumentsContainer();
  await uploadStaticAssets();

  // Maintenance mode — blocks non-admin requests when enabled
  const { maintenanceMiddleware } = await import('./middleware/maintenance');
  app.use(maintenanceMiddleware);

  // API routes
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

  // Health check — verifies CosmosDB connectivity and returns maintenance status
  app.get('/api/health', async (_req, res) => {
    try {
      const r = getRepos();
      const count = await r.users.count();
      const maintenance = await isMaintenanceMode();
      const maintenanceMessage = maintenance ? await getMaintenanceMessage() : undefined;
      const maintenanceEndsAt = maintenance ? await getMaintenanceEndsAt() : undefined;
      res.json({
        status: 'ok', db: 'connected', users: count, timestamp: new Date().toISOString(),
        maintenance, ...(maintenanceMessage ? { maintenanceMessage } : {}), ...(maintenanceEndsAt ? { maintenanceEndsAt } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      logger.error({ err: message }, 'Health check DB query failed');
      res.status(503).json({ status: 'degraded', db: 'error', error: message, timestamp: new Date().toISOString() });
    }
  });

  // Serve static frontend in production
  if (config.nodeEnv === 'production') {
    const clientDist = path.join(__dirname, '..', '..', '..', '..', 'client', 'dist');
    logger.info({ clientDist, exists: require('fs').existsSync(clientDist) }, 'Serving static files');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'XPIA Tools server started');

    // Clean up generated content older than 7 days on startup and every 6 hours
    const runCleanup = async () => {
      const docs = await cleanupOldDocuments(7);
      const payloads = await cleanupOldPayloads(7);
      const usageLogs = await cleanupOldUsageLogs(30);
      if (docs + payloads + usageLogs > 0) {
        logger.info({ docs, payloads, usageLogs }, 'Cleanup: removed old content');
      }
    };
    runCleanup();
    setInterval(runCleanup, 6 * 60 * 60 * 1000);
  });

  server.timeout = 300_000;
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
}

startServer().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});

export default app;
