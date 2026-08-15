/**
 * Invite code routes — generation and management
 * Accessible by admins and users with can_generate_invites permission
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as inviteService from '../services/invite.service';
import { logAudit } from '../services/audit.service';

const router = Router();
router.use(authMiddleware);

// Middleware: check if user can generate invites
async function requireInvitePermission(req: AuthRequest, res: Response, next: () => void) {
  if (!(await inviteService.canUserGenerateInvites(req.user!.userId))) {
    res.status(403).json({ error: 'Not authorized to manage invite codes' });
    return;
  }
  next();
}

const createInviteSchema = z.object({
  email: z.string().email().max(255),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  expiresInHours: z.number().min(1).max(8760).optional(), // max 1 year
});

// Create invite code
router.post('/', requireInvitePermission, async (req: AuthRequest, res: Response) => {
  try {
    const options = createInviteSchema.parse(req.body);
    const result = await inviteService.createInviteCode(req.user!.userId, options);
    logAudit({
      action: 'invite_created',
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      targetType: 'invite',
      targetId: result.id,
      targetLabel: options.email,
      detail: `Created invite code for "${options.firstName} ${options.lastName}" (${options.email})`,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create invite code' });
  }
});

// List invite codes (own codes, or all if admin)
router.get('/', requireInvitePermission, async (req: AuthRequest, res: Response) => {
  // Admins see all, non-admins see only their own
  const user = req.user!;
  const isAdmin = await inviteService.canUserGenerateInvites(user.userId);
  const codes = await inviteService.listInviteCodes(isAdmin ? undefined : user.userId);
  res.json({ codes });
});

// Revoke invite code
router.delete('/:id', requireInvitePermission, async (req: AuthRequest, res: Response) => {
  try {
    await inviteService.revokeInviteCode(req.params.id as string, req.user!.userId);
    logAudit({
      action: 'invite_revoked',
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      targetType: 'invite',
      targetId: req.params.id as string,
      targetLabel: req.params.id as string,
      detail: `Revoked invite code ${req.params.id}`,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to revoke' });
  }
});

// Validate invite code (public-ish — used during registration preview)
router.post('/validate', async (req: AuthRequest, res: Response) => {
  try {
    const { code } = z.object({ code: z.string().min(1).max(20).trim() }).parse(req.body);
    const result = await inviteService.validateInviteCode(code);
    res.json(result);
  } catch {
    res.json({ valid: false, error: 'Invalid code format' });
  }
});

export default router;
