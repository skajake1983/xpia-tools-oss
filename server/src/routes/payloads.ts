import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { generationLimiter } from '../middleware/rateLimiter';
import * as payloadService from '../services/payload.service';
import * as exampleVariants from '../services/example-variants.service';
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

// ── Vary from an example ─────────────────────────────────────────────────────

const varyPayloadAxes = z.object({
  wording: z.boolean().optional(),
  obfuscation: z.boolean().optional(),
  targetAction: z.boolean().optional(),
  language: z.boolean().optional(),
});

const analyzePayloadSchema = z.object({
  modelId: z.string().min(1).max(100),
  text: z.string().max(20000).optional(),
  filename: z.string().max(300).optional(),
  dataBase64: z.string().optional(),
  consent: z.boolean(),
});

const varyPayloadSchema = z.object({
  modelId: z.string().min(1).max(100),
  techniqueId: z.string().min(1).max(100),
  basePayload: z.string().min(1).max(2000),
  count: z.number().int().min(1).max(25),
  vary: varyPayloadAxes.optional(),
  consent: z.boolean(),
});

// Analyze a pasted or uploaded example payload → detected technique + extracted instruction.
router.post('/analyze-example', generationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { modelId, text, filename, dataBase64, consent } = analyzePayloadSchema.parse(req.body);
    if (!consent) {
      res.status(403).json({ error: 'Consent required to send the example to your AI provider.' });
      return;
    }
    let exampleText = (text || '').trim();
    let truncated = false;
    if (dataBase64) {
      const buffer = Buffer.from(dataBase64, 'base64');
      if (buffer.length > exampleVariants.MAX_UPLOAD_BYTES) throw new Error('File too large (max 10 MB)');
      const extracted = await exampleVariants.extractExampleText(filename || 'example.txt', buffer);
      exampleText = extracted.text;
      truncated = extracted.truncated;
    }
    if (!exampleText) throw new Error('Provide payload text or a file to analyze');
    const analysis = await exampleVariants.analyzeExample({
      userId: req.user!.userId,
      modelId,
      text: exampleText,
      truncated,
      kind: 'payload',
      correlationId: req.correlationId,
    });
    res.json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    const status = message.includes('limit') || message.includes('budget') || message.includes('suspended') ? 429 : 400;
    res.status(status).json({ error: message });
  }
});

// Generate N payload-string variants → shaped like the standard payloads result.
router.post('/generate-variants', generationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { modelId, techniqueId, basePayload, count, vary, consent } = varyPayloadSchema.parse(req.body);
    if (!consent) {
      res.status(403).json({ error: 'Consent required to send the example to your AI provider.' });
      return;
    }
    const result = await exampleVariants.generatePayloadVariants({
      userId: req.user!.userId,
      modelId,
      techniqueId,
      basePayload,
      count,
      vary: vary || {},
      correlationId: req.correlationId,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Variant generation failed';
    const status = message.includes('limit') || message.includes('budget') || message.includes('suspended') ? 429 : 400;
    res.status(status).json({ error: message });
  }
});

export default router;
