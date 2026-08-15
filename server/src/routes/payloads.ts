import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { generationLimiter } from '../middleware/rateLimiter';
import * as payloadService from '../services/payload.service';
import type { XPIACategory } from '../data/xpia-techniques';

const router = Router();

const generateSchema = z.object({
  categories: z.array(z.string()).optional(),
  severities: z.array(z.enum(['low', 'medium', 'high', 'critical'])).optional(),
  count: z.number().int().min(1).max(50),
  seed: z.number().int().optional(),
  format: z.enum(['json', 'text']),
  evasionModifier: z.string().max(50).optional(),
  modelId: z.string().min(1).max(100).optional(),
  customAction: z.string().max(500).optional(),
});

router.use(authMiddleware);

router.get('/categories', (_req: AuthRequest, res: Response) => {
  const categories = payloadService.getAvailableCategories();
  res.json({ categories });
});

router.get('/evasions', (_req: AuthRequest, res: Response) => {
  const evasions = payloadService.getAvailableEvasions();
  res.json({ evasions });
});

router.post('/generate', generationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const options = generateSchema.parse(req.body);
    const result = await payloadService.generatePayloads({
      userId: req.user!.userId,
      ...options,
      categories: options.categories as XPIACategory[] | undefined,
      correlationId: req.correlationId,
    });

    if (options.format === 'text') {
      res.json({ ...result, formatted: result.formatted });
    } else {
      res.json(result);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    res.status(400).json({ error: message });
  }
});

router.get('/history', async (req: AuthRequest, res: Response) => {
  const history = await payloadService.getPayloadHistory(req.user!.userId);
  res.json({ history });
});

router.get('/history/:id/download', async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const payload = await payloadService.getPayloadById(id, req.user!.userId);
  if (!payload) {
    res.status(404).json({ error: 'Payload not found or expired' });
    return;
  }
  const mimeType = payload.format === 'json' ? 'application/json' : 'text/plain';
  const ext = payload.format === 'json' ? 'json' : 'txt';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="payloads-seed-${payload.seed}.${ext}"`);
  res.send(payload.content);
});

export default router;
