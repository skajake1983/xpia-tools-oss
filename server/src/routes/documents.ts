import { Router, Response } from 'express';
import { z } from 'zod';
import JSZip from 'jszip';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { generationLimiter } from '../middleware/rateLimiter';
import * as documentService from '../services/document.service';
import logger from '../logger';

const router = Router();

const generateSchema = z.object({
  docType: z.enum(['docx', 'htm', 'pptx', 'xlsx', 'pdf', 'csv', 'md', 'ics', 'vcf', 'json', 'yaml', 'rtf', 'qr']),
  techniqueId: z.string().min(1).max(100),
  customAction: z.string().max(500).optional(),
  modelId: z.string().min(1).max(100).optional(),
  addQrCode: z.boolean().optional(),
});

const DOC_TYPE_ENUM = ['docx', 'htm', 'pptx', 'xlsx', 'pdf', 'csv', 'md', 'ics', 'vcf', 'json', 'yaml', 'rtf', 'qr'] as const;

const batchGenerateSchema = z.object({
  docTypes: z.array(z.enum(DOC_TYPE_ENUM)).min(1).max(13),
  techniqueId: z.string().min(1).max(100),
  customAction: z.string().max(500).optional(),
  modelId: z.string().min(1).max(100).optional(),
  addQrCode: z.boolean().optional(),
});

router.use(authMiddleware);

router.get('/techniques', (_req: AuthRequest, res: Response) => {
  const techniques = documentService.getAvailableTechniques();
  res.json({ techniques });
});

router.post('/generate', generationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { docType, techniqueId, customAction, modelId, addQrCode } = generateSchema.parse(req.body);
    const result = await documentService.generateDocument({
      userId: req.user!.userId,
      docType,
      techniqueId,
      customAction,
      modelId,
      correlationId: req.correlationId,
      addQrCode,
    });

    res.setHeader('Content-Type', result.mimeType);
    const safeFilename = result.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(result.buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    logger.error({ correlationId: (req as AuthRequest).correlationId, err: message }, 'Document generation error');
    res.status(400).json({ error: message });
  }
});

const IMAGE_TYPES: Set<string> = new Set(['png', 'svg', 'jpg', 'webp', 'gif']);

router.get('/history', async (req: AuthRequest, res: Response) => {
  const history = await documentService.getDocumentHistory(req.user!.userId);
  const docHistory = (history as { doc_type: string }[]).filter(h => !IMAGE_TYPES.has(h.doc_type));
  res.json({ history: docHistory });
});

router.post('/generate-batch', generationLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { docTypes, techniqueId, customAction, modelId, addQrCode } = batchGenerateSchema.parse(req.body);
    const results = await documentService.generateDocumentBatch({
      userId: req.user!.userId,
      docTypes: docTypes as documentService.DocType[],
      techniqueId,
      customAction,
      modelId,
      correlationId: req.correlationId,
      addQrCode,
    });

    if (results.length === 1) {
      // Single document — return raw buffer like the existing endpoint
      const doc = results[0];
      res.setHeader('Content-Type', doc.mimeType);
      const safeFilename = doc.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.send(doc.buffer);
      return;
    }

    // Multiple documents — package into a zip
    const zip = new JSZip();
    for (const doc of results) {
      zip.file(doc.filename, doc.buffer);
    }
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipFilename = `xpia-documents-${timestamp}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.send(zipBuffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Batch generation failed';
    logger.error({ correlationId: (req as AuthRequest).correlationId, err: message }, 'Batch document generation error');
    res.status(400).json({ error: message });
  }
});

router.get('/history/:id/download', async (req: AuthRequest, res: Response) => {
  const doc = await documentService.getDocumentById(req.params.id as string, req.user!.userId);
  if (!doc) {
    res.status(404).json({ error: 'Document not found or expired' });
    return;
  }
  res.setHeader('Content-Type', doc.mime_type);
  const safeFilename = doc.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.send(doc.content);
});

export default router;
