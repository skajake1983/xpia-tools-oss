import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import repos from '../db/repos';

/**
 * Admin-only middleware. Must be used AFTER authMiddleware.
 * Checks the isAdmin flag on the user doc.
 */
export async function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = await repos.users.getById(req.user.userId);
  if (!user || !user.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

/**
 * SuperAdmin-only middleware. Must be used AFTER authMiddleware.
 */
export async function superadminMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = await repos.users.getById(req.user.userId);
  if (!user || !user.isSuperadmin) {
    res.status(403).json({ error: 'SuperAdmin access required' });
    return;
  }

  next();
}

/** Check if a user is the founding SuperAdmin (the first-ever registered user) */
export async function isFoundingSuperAdmin(userId: string): Promise<boolean> {
  const founding = await repos.users.getFoundingSuperadmin();
  return founding?.id === userId;
}

/** Check if a user is a SuperAdmin */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const user = await repos.users.getById(userId);
  return !!user?.isSuperadmin;
}
