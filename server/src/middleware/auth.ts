import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { isTokenBlocked, isUserBlocked, isUserSuspended } from '../services/auth.service';

export interface AuthPayload {
  userId: string;
  email: string;
  jti?: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
  correlationId?: string;
}

/**
 * Fixed identity for the standalone local desktop build (single-user, no login).
 * The desktop app seeds a user record with this id and sets XPIA_LOCAL_MODE=1.
 */
export const LOCAL_USER_ID = 'local-user';

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  // Standalone desktop mode: no accounts, no JWT — act as the single local user.
  // Default OFF; only active when the desktop app sets XPIA_LOCAL_MODE=1. The Azure
  // web deployment and the CLI never set this, so their behaviour is unchanged.
  if (process.env.XPIA_LOCAL_MODE === '1') {
    req.user = { userId: LOCAL_USER_ID, email: 'local@localhost' };
    next();
    return;
  }

  // Read access token from httpOnly cookie (primary) or Authorization header (fallback)
  const tokenFromCookie = req.cookies?.access_token;
  const authHeader = req.headers.authorization;
  const token = tokenFromCookie || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined);

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret) as AuthPayload;

    // Check token blocklist
    if (payload.jti && await isTokenBlocked(payload.jti)) {
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    // Check user-level blocklist (password change, admin action)
    if (await isUserBlocked(payload.userId)) {
      res.status(401).json({ error: 'Session expired. Please log in again.' });
      return;
    }

    // Check suspension
    if (await isUserSuspended(payload.userId)) {
      res.status(403).json({ error: 'Account suspended. Contact an administrator.' });
      return;
    }

    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
