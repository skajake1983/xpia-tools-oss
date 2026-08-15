import { Router, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  getTemplatesForUser,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setActiveTemplate,
  clearActiveTemplate,
  getActiveTemplates,
  PromptCategory,
} from '../services/prompt-template.service';

const router = Router();
router.use(authMiddleware);

const VALID_CATEGORIES = ['document', 'image', 'payload', 'page'] as const;

const createSchema = z.object({
  category: z.enum(VALID_CATEGORIES),
  name: z.string().min(1).max(100),
  systemPrompt: z.string().min(1).max(50000),
  userPrompt: z.string().min(1).max(50000),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  systemPrompt: z.string().min(1).max(50000).optional(),
  userPrompt: z.string().min(1).max(50000).optional(),
});

const assignSchema = z.object({
  category: z.enum(VALID_CATEGORIES),
  templateId: z.string().min(1),
});

const unassignSchema = z.object({
  category: z.enum(VALID_CATEGORIES),
});

// GET /api/prompt-templates — list all templates for current user
router.get('/', async (req: AuthRequest, res: Response) => {
  const templates = await getTemplatesForUser(req.user!.userId);
  const active = await getActiveTemplates(req.user!.userId);
  res.json({ templates, active });
});

// GET /api/prompt-templates/:id — get a single template
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const template = await getTemplate(req.user!.userId, req.params.id as string);
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json({ template });
});

// POST /api/prompt-templates — create a new template
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    const template = await createTemplate(req.user!.userId, data);
    res.status(201).json({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create template';
    const status = message.includes('Maximum') ? 409 : 400;
    res.status(status).json({ error: message });
  }
});

// PUT /api/prompt-templates/:id — update own template
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    const template = await updateTemplate(req.user!.userId, req.params.id as string, data);
    res.json({ template });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update template';
    const status = message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

// DELETE /api/prompt-templates/:id — delete own template
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await deleteTemplate(req.user!.userId, req.params.id as string);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete template';
    const status = message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

// PUT /api/prompt-templates/active/assign — set active template for a category
router.put('/active/assign', async (req: AuthRequest, res: Response) => {
  try {
    const { category, templateId } = assignSchema.parse(req.body);
    await setActiveTemplate(req.user!.userId, category as PromptCategory, templateId);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to assign template';
    res.status(400).json({ error: message });
  }
});

// PUT /api/prompt-templates/active/unassign — clear active template for a category
router.put('/active/unassign', async (req: AuthRequest, res: Response) => {
  try {
    const { category } = unassignSchema.parse(req.body);
    await clearActiveTemplate(req.user!.userId, category as PromptCategory);
    res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to unassign template';
    res.status(400).json({ error: message });
  }
});

export default router;
