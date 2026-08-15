/**
 * Correlation ID middleware — assigns a unique ID to every request.
 *
 * - Reads X-Correlation-Id from the incoming request (supports downstream tracing)
 * - Falls back to crypto.randomUUID()
 * - Attaches to req.correlationId for use in handlers/services
 * - Sets X-Correlation-Id response header for client-side debugging
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const HEADER = 'x-correlation-id';

// UUID v4 pattern — only accept well-formed IDs from upstream
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[HEADER];
  const id =
    typeof incoming === 'string' && UUID_RE.test(incoming)
      ? incoming
      : crypto.randomUUID();

  // Attach to request for downstream use (typed via AuthRequest augmentation)
  (req as unknown as Record<string, unknown>).correlationId = id;

  // Return to the client so they can reference it in bug reports
  res.setHeader('X-Correlation-Id', id);

  next();
}
