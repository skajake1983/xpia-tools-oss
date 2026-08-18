/**
 * User API key routes — each user manages their own provider keys
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { encryptApiKey } from '../services/llm/encryption';
import repos from '../db/repos';

const router = Router();
router.use(authMiddleware);

// === List user's API keys (never exposes the actual key) ===

router.get('/', async (req: AuthRequest, res: Response) => {
  const keys = await repos.apiKeys.listByUser(req.user!.userId);
  const providers = await repos.config.getAllProviders();
  const providerMap = new Map(providers.map(p => [p.id, p]));
  res.json({
    keys: keys.map(k => {
      const provider = providerMap.get(k.providerId);
      return {
        id: k.id,
        provider_id: k.providerId,
        key_label: k.keyLabel,
        is_active: k.isActive ? 1 : 0,
        created_at: k.createdAt,
        provider_name: provider?.displayName ?? k.providerName ?? '',
        provider_is_enabled: (provider?.isEnabled ?? k.providerIsEnabled) ? 1 : 0,
      };
    }),
  });
});

// === List providers (so UI can show which providers exist) ===

router.get('/providers', async (_req: AuthRequest, res: Response) => {
  const allProviders = await repos.config.getAllProviders();
  const providers = allProviders
    .filter(p => p.isEnabled)
    .map(p => ({ id: p.id, name: p.name, display_name: p.displayName, is_enabled: p.isEnabled ? 1 : 0 }));
  res.json({ providers });
});

// === Add a new API key ===

const addKeySchema = z.object({
  providerId: z.string().min(1).max(50),
  apiKey: z.string().min(10).max(500),
  label: z.string().min(1).max(100).optional(),
  /** Azure OpenAI resource endpoint (stored per-key; ignored by other providers). */
  endpoint: z.string().trim().min(1).max(300).optional(),
  /** Azure OpenAI REST API version override (per-key). */
  apiVersion: z.string().trim().min(1).max(50).optional(),
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { providerId, apiKey, label, endpoint, apiVersion } = addKeySchema.parse(req.body);
    const userId = req.user!.userId;

    const provider = await repos.config.getProvider(providerId);
    if (!provider || !provider.isEnabled) {
      res.status(404).json({ error: 'Provider not found or disabled' });
      return;
    }

    // Azure OpenAI needs a resource endpoint — it's per-resource, so it lives with the key.
    const isAzure = provider.name === 'azure-openai';
    if (isAzure && !endpoint) {
      res.status(400).json({ error: 'Azure OpenAI requires a resource endpoint (e.g. https://your-resource.openai.azure.com).' });
      return;
    }

    // Delete any existing key for this user+provider (one key per provider)
    await repos.apiKeys.deleteByUserProvider(userId, providerId);

    const { encrypted, iv, tag, keyFingerprint } = encryptApiKey(apiKey);
    const id = uuidv4();

    await repos.apiKeys.create({
      id, userId, providerId, encryptedKey: encrypted, keyIv: iv, keyTag: tag,
      keyFingerprint, keyLabel: label ?? provider.displayName, isActive: true,
      endpoint: isAzure ? (endpoint ?? null) : null,
      apiVersion: isAzure ? (apiVersion ?? null) : null,
      createdAt: new Date().toISOString(),
    });

    const masked = apiKey.length > 8 ? apiKey.slice(0, 4) + '…' + apiKey.slice(-4) : '••••••••';
    res.json({ key: { id, providerId, label: label ?? provider.displayName, masked, isActive: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add key';
    res.status(400).json({ error: message });
  }
});

// === Delete own API key ===

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const keyId = req.params.id as string;
  const userId = req.user!.userId;

  const key = await repos.apiKeys.getById(keyId, userId);
  if (!key) {
    res.status(404).json({ error: 'Key not found' });
    return;
  }

  await repos.apiKeys.delete(keyId, userId);
  res.json({ success: true });
});

export default router;
