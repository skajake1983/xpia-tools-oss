/**
 * Invite request routes — public + admin
 * Public: submit request with CAPTCHA, get CAPTCHA challenge
 * Admin: list/approve/reject requests
 */

import { Router, Response, Request } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin';
import { inviteRequestLimiter } from '../middleware/rateLimiter';
import { generateCaptcha, verifyCaptcha } from '../services/captcha.service';
import * as inviteRequestService from '../services/invite-request.service';
import { sendInviteApprovedEmail, sendNewInviteRequestEmail } from '../services/email.service';
import { logAudit } from '../services/audit.service';
import logger from '../logger';

const router = Router();

// === Public routes (no auth) ===

// Get a CAPTCHA challenge
router.get('/captcha', async (_req: Request, res: Response) => {
  const captcha = await generateCaptcha();
  res.json(captcha);
});

const submitRequestSchema = z.object({
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  email: z.string().email().max(255),
  organization: z.string().min(1).max(200).trim(),
  jobTitle: z.string().min(1).max(200).trim(),
  captchaId: z.string().uuid(),
  captchaAnswer: z.string().min(1).max(20),
});

// Submit an invite request
router.post('/', inviteRequestLimiter, async (req: Request, res: Response) => {
  try {
    const data = submitRequestSchema.parse(req.body);

    // Verify CAPTCHA first
    if (!(await verifyCaptcha(data.captchaId, data.captchaAnswer))) {
      res.status(400).json({ error: 'Incorrect CAPTCHA answer. Please try again.' });
      return;
    }

    const request = await inviteRequestService.createRequest({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      organization: data.organization,
      jobTitle: data.jobTitle,
    });

    // Notify admins about the new request
    sendNewInviteRequestEmail(
      `${data.firstName} ${data.lastName}`,
      data.email,
      data.organization,
      data.jobTitle,
    ).catch((err) => logger.error({ err }, 'Failed to send admin notification'));

    res.status(201).json({ request });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to submit request' });
  }
});

// === Admin routes (auth + admin required) ===

router.get('/admin', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined;
  const validStatuses = ['pending', 'approved', 'rejected'];
  const requests = await inviteRequestService.listRequests(
    status && validStatuses.includes(status) ? status : undefined,
  );
  res.json({ requests });
});

router.patch('/:id/approve', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await inviteRequestService.approveRequest(req.params.id as string, req.user!.userId);

    const request = result.request;
    logAudit({
      action: 'invite_request_approved',
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      targetType: 'invite_request',
      targetId: req.params.id as string,
      targetLabel: request.email,
      detail: `Approved invite request from "${request.first_name} ${request.last_name}" (${request.email})`,
    });

    // Send invite code to the approved user
    sendInviteApprovedEmail(
      request.email,
      result.inviteCode,
      request.first_name,
    ).catch((err) => logger.error({ err }, 'Failed to send invite approval email'));

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to approve' });
  }
});

router.patch('/:id/reject', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const request = await inviteRequestService.rejectRequest(req.params.id as string, req.user!.userId);
    logAudit({
      action: 'invite_request_rejected',
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      targetType: 'invite_request',
      targetId: req.params.id as string,
      targetLabel: request.email,
      detail: `Rejected invite request from "${request.first_name} ${request.last_name}" (${request.email})`,
    });
    res.json({ request });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to reject' });
  }
});

export default router;
