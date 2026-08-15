import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { checkAndExpireMaintenance, getMaintenanceMessage, getMaintenanceEndsAt } from '../services/settings.service';
import repos from '../db/repos';

/**
 * Maintenance mode middleware.
 * Returns 503 for all API requests except:
 * - Health check (/api/health)
 * - Admin settings (/api/admin/settings) — so admins can disable it
 * - Login-related auth routes (login, verify-2fa, refresh) — so admins can authenticate
 * - Requests from admin users (checked via JWT)
 */
export async function maintenanceMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Only intercept API requests — let static assets and SPA routes through
  // so the React client can render the styled maintenance page
  if (!req.path.startsWith('/api/')) { next(); return; }

  // Always allow health checks
  if (req.path === '/api/health') { next(); return; }

  const stillActive = await checkAndExpireMaintenance();
  if (!stillActive) { next(); return; }

  // Only allow login-related auth routes so admins can authenticate
  const allowedAuthRoutes = ['/api/auth/login', '/api/auth/verify-2fa', '/api/auth/refresh'];
  if (allowedAuthRoutes.includes(req.path)) { next(); return; }

  // Check if the requester is an admin — if so, bypass maintenance
  const token = req.cookies?.access_token
    || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);

  if (token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret) as { userId: string };
      const user = await repos.users.getById(payload.userId);
      if (user?.isAdmin) { next(); return; }
    } catch {
      // Invalid token — fall through to maintenance response
    }
  }

  const [message, endsAt] = await Promise.all([getMaintenanceMessage(), getMaintenanceEndsAt()]);
  res.status(503).json({
    error: 'maintenance',
    message: message || 'XPIA Tools is currently undergoing scheduled maintenance. Please check back shortly.',
    ...(endsAt ? { endsAt } : {}),
  });
}
