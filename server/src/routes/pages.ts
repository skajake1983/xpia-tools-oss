import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { publicPageLimiter, generationLimiter } from '../middleware/rateLimiter';
import { config } from '../config';
import * as pageService from '../services/page.service';

const router = Router();

const createSchema = z.object({
  title: z.string().min(1).max(200),
  techniqueId: z.string().min(1).max(100),
  customAction: z.string().max(500).optional(),
  modelId: z.string().min(1).max(100).optional(),
  addQrCode: z.boolean().optional(),
});

// Config endpoint: tells the client where public pages are served
router.get('/config', authMiddleware, (_req: Request, res: Response) => {
  res.json({
    publicPagesDomain: config.publicPagesDomain,
    maxPagesPerUser: config.maxPagesPerUser,
  });
});

// Public route: serve web page by slug (dev/fallback only — production uses PUBLIC_PAGES_DOMAIN)
router.get('/public/:slug', publicPageLimiter, async (req: Request, res: Response) => {
  const slug = req.params.slug as string;
  if (!/^[a-f0-9-]{8}$/.test(slug)) {
    res.status(400).json({ error: 'Invalid page identifier' });
    return;
  }

  const page = await pageService.getPageBySlug(slug);
  if (!page) {
    res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Page Removed</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem;text-align:center}
    .card{max-width:28rem;width:100%}
    .icon{width:3.5rem;height:3.5rem;margin:0 auto 1.5rem;border-radius:50%;background:rgba(251,191,36,.12);display:flex;align-items:center;justify-content:center}
    .icon svg{width:1.75rem;height:1.75rem;color:#fbbf24}
    h1{font-size:1.375rem;font-weight:600;color:#f8fafc;margin-bottom:.625rem}
    p{font-size:.9375rem;line-height:1.6;color:#94a3b8;margin-bottom:1.75rem}
    a.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.625rem 1.25rem;background:#2563eb;color:#fff;font-size:.875rem;font-weight:500;border-radius:.5rem;text-decoration:none;transition:background .15s}
    a.btn:hover{background:#1d4ed8}
    .footer{margin-top:2.5rem;font-size:.75rem;color:#475569}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
    </div>
    <h1>This page has been removed</h1>
    <p>The link you followed is no longer active. The page owner may have deleted or deactivated it.</p>
    <a class="btn" href="${config.publicSiteUrl}">Visit XPIA Tools</a>
    <div class="footer">XPIA Tools — AI Security Testing Platform</div>
  </div>
</body>
</html>`);
    return;
  }

  // Security headers for public pages — relaxed CSP to allow inline styles (needed for page rendering)
  // but strict on everything else
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'none'; script-src 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(page.content);
});

// Authenticated routes
router.post('/', authMiddleware, generationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { title, techniqueId, customAction, modelId, addQrCode } = createSchema.parse(req.body);
    const page = await pageService.createPage(req.user!.userId, title, techniqueId, customAction, modelId, req.correlationId, addQrCode);
    res.status(201).json({ page });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Creation failed' });
  }
});

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  const pages = await pageService.getUserPages(req.user!.userId);
  res.json({ pages });
});

router.patch('/:id/toggle', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const page = await pageService.togglePage(req.user!.userId, req.params.id as string);
    res.json({ page });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await pageService.deletePage(req.user!.userId, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Not found' });
  }
});

export default router;
