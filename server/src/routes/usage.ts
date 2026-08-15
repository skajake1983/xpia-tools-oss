/**
 * Usage routes — user's own usage stats and limits
 */

import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import * as metering from '../services/metering.service';
import { getUserLimits } from '../services/llm/gateway';
import logger from '../logger';

const router = Router();
router.use(authMiddleware);

// Get current period usage (today + this month) with limits
router.get('/current', async (req: AuthRequest, res: Response) => {
  try {
    const period = await metering.getUserCurrentPeriod(req.user!.userId);
    const limits = await getUserLimits(req.user!.userId);

    res.json({
      daily: {
        ...period.daily,
        tokenLimit: limits.dailyTokenLimit,
      },
      monthly: {
        ...period.monthly,
      },
      limits: {
        isSuspended: !!limits.isSuspended,
      },
    });
  } catch (err) {
    logger.error({ correlationId: (req as AuthRequest).correlationId, err }, 'Usage /current error');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

// Get daily breakdown over last N days (default 30)
router.get('/daily', async (req: AuthRequest, res: Response) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 90);
  const daily = await metering.getUserDailyUsage(req.user!.userId, days);
  res.json({ daily });
});

// Get per-model breakdown for current month
router.get('/models', async (req: AuthRequest, res: Response) => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const models = await metering.getUserModelUsage(req.user!.userId, monthStart.toISOString(), monthEnd.toISOString());
  res.json({ models });
});

// Get recent usage log entries
router.get('/recent', async (req: AuthRequest, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const recent = await metering.getUserRecentUsage(req.user!.userId, limit);
  res.json({ recent });
});

// Get detailed log entry (includes prompts & response) — scoped to requesting user
router.get('/log/:id', async (req: AuthRequest, res: Response) => {
  const logId = req.params.id as string;
  const entry = await metering.getUsageLogDetail(req.user!.userId, logId);
  if (!entry) {
    res.status(404).json({ error: 'Log entry not found' });
    return;
  }
  res.json({ entry });
});

export default router;
