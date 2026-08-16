/**
 * Admin routes — provider management, user limits, system usage
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { adminMiddleware, isSuperAdmin, isFoundingSuperAdmin } from '../middleware/admin';
import * as gateway from '../services/llm/gateway';
import { getMetrics } from '../services/metrics.service';
import { isInviteRequired, setInviteRequired, isMaintenanceMode, getMaintenanceMessage, getMaintenanceEndsAt, setMaintenanceMode, isMilestoneNotificationsEnabled, setMilestoneNotificationsEnabled } from '../services/settings.service';
import { getAllPrompts, getPromptRegistry } from '../config/prompts';
import { INTEGRATION_CATALOG, getIntegrationPreset, presetToRecords } from '../config/integration-catalog';
import { clearTrustedDevices, blockAllUserTokens } from '../services/auth.service';
import { logAudit, getAuditLogs } from '../services/audit.service';
import repos from '../db/repos';
import type { UserDoc } from '../db/repositories/types';

const router = Router();
router.use(authMiddleware);
router.use(adminMiddleware);

// === Providers ===

router.get('/providers', async (_req: AuthRequest, res: Response) => {
  const providers = await gateway.getProviders();
  res.json({
    providers: providers.map(p => ({
      id: p.id,
      name: p.name,
      display_name: p.displayName,
      base_url: p.baseUrl,
      is_enabled: p.isEnabled ? 1 : 0,
    })),
  });
});

router.patch('/providers/:id/toggle', async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const provider = await repos.config.getProvider(id);
  if (!provider) {
    res.status(404).json({ error: 'Provider not found' });
    return;
  }

  const newEnabled = !provider.isEnabled;
  await repos.config.updateProvider(id, { isEnabled: newEnabled });

  // Cascade: when disabling a provider, disable all its models too
  if (!newEnabled) {
    const models = await repos.config.getModelsByProvider(id);
    for (const m of models) {
      await repos.config.updateModel(m.id, { isEnabled: false });
    }
  }

  const updated = await repos.config.getProvider(id);

  logAudit({
    action: newEnabled ? 'provider_enabled' : 'provider_disabled',
    actorId: req.user!.userId,
    actorEmail: req.user!.email,
    targetType: 'provider',
    targetId: id,
    targetLabel: provider.displayName,
    detail: newEnabled ? `Enabled provider "${provider.displayName}"` : `Disabled provider "${provider.displayName}" and its models`,
  });

  res.json({
    provider: updated ? {
      id: updated.id,
      name: updated.name,
      display_name: updated.displayName,
      base_url: updated.baseUrl,
      is_enabled: updated.isEnabled ? 1 : 0,
    } : null,
  });
});

// === Integrations (install a provider + default models from a catalog preset) ===

router.get('/integrations/catalog', async (_req: AuthRequest, res: Response) => {
  const providers = await repos.config.getAllProviders(true);
  const installed = new Set(providers.map((p) => p.id));
  res.json({
    catalog: INTEGRATION_CATALOG.map((preset) => ({
      key: preset.key,
      display_name: preset.displayName,
      base_url: preset.baseUrl,
      note: preset.note ?? null,
      installed: installed.has(preset.key),
      models: preset.models.map((m) => ({ model_id: m.modelId, display_name: m.displayName })),
    })),
  });
});

const addIntegrationSchema = z.object({ key: z.string().min(1) });

router.post('/integrations', async (req: AuthRequest, res: Response) => {
  const { key } = addIntegrationSchema.parse(req.body);

  const preset = getIntegrationPreset(key);
  if (!preset) {
    res.status(400).json({ error: 'Unknown integration preset' });
    return;
  }

  // Provider id == preset key, so an existing provider means it's already installed.
  const existing = await repos.config.getProvider(preset.key);
  if (existing) {
    res.status(409).json({ error: `Integration "${preset.displayName}" is already installed` });
    return;
  }

  const { provider, models } = presetToRecords(preset, new Date().toISOString());

  await repos.config.upsert(provider);
  logAudit({
    action: 'provider_created',
    actorId: req.user!.userId,
    actorEmail: req.user!.email,
    targetType: 'provider',
    targetId: provider.id,
    targetLabel: provider.displayName,
    detail: `Installed integration "${provider.displayName}" from catalog`,
  });

  for (const m of models) {
    await repos.config.createModel(m);
    logAudit({
      action: 'model_created',
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      targetType: 'model',
      targetId: m.id,
      targetLabel: m.displayName,
      detail: `Created model "${m.displayName}" (${m.modelId}) for ${provider.displayName} (catalog install)`,
    });
  }

  res.status(201).json({
    provider: {
      id: provider.id,
      name: provider.name,
      display_name: provider.displayName,
      base_url: provider.baseUrl,
      is_enabled: 1,
    },
    models: models.map((m) => ({ id: m.id, model_id: m.modelId, display_name: m.displayName })),
    note: preset.note ?? null,
  });
});

// === Models ===

router.get('/models', async (_req: AuthRequest, res: Response) => {
  const models = await repos.config.getModelsWithProviders();
  // Filter out github provider and map to snake_case for frontend
  const filtered = models
    .filter(m => m.providerId !== 'github')
    .map(m => ({
      id: m.id,
      provider_id: m.providerId,
      model_id: m.modelId,
      display_name: m.displayName,
      input_price_per_million: m.inputPricePerMillion,
      output_price_per_million: m.outputPricePerMillion,
      max_context_tokens: m.maxContextTokens,
      max_output_tokens: m.maxOutputTokens,
      supports_streaming: m.supportsStreaming,
      is_enabled: m.isEnabled,
      created_at: m.createdAt,
      provider_name: m.providerDisplayName,
    }));
  res.json({ models: filtered });
});

const updateModelSchema = z.object({
  inputPricePerMillion: z.number().min(0).optional(),
  outputPricePerMillion: z.number().min(0).optional(),
  maxOutputTokens: z.number().int().min(1).optional(),
  isEnabled: z.boolean().optional(),
});

router.patch('/models/:id', async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const model = await repos.config.getModel(id);
  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  const updates = updateModelSchema.parse(req.body);
  const fields: Partial<import('../db/repositories/types').ModelDoc> = {};
  if (updates.inputPricePerMillion !== undefined) fields.inputPricePerMillion = updates.inputPricePerMillion;
  if (updates.outputPricePerMillion !== undefined) fields.outputPricePerMillion = updates.outputPricePerMillion;
  if (updates.maxOutputTokens !== undefined) fields.maxOutputTokens = updates.maxOutputTokens;
  if (updates.isEnabled !== undefined) fields.isEnabled = updates.isEnabled;

  await repos.config.updateModel(id, fields);

  const changes = Object.keys(fields).join(', ');
  logAudit({
    action: 'model_updated',
    actorId: req.user!.userId,
    actorEmail: req.user!.email,
    targetType: 'model',
    targetId: id,
    targetLabel: model.displayName,
    detail: `Updated model "${model.displayName}": ${changes}`,
  });

  const updated = await repos.config.getModel(id);
  res.json({
    model: updated ? {
      id: updated.id,
      provider_id: updated.providerId,
      model_id: updated.modelId,
      display_name: updated.displayName,
      input_price_per_million: updated.inputPricePerMillion,
      output_price_per_million: updated.outputPricePerMillion,
      max_context_tokens: updated.maxContextTokens,
      max_output_tokens: updated.maxOutputTokens,
      supports_streaming: updated.supportsStreaming,
      is_enabled: updated.isEnabled,
      created_at: updated.createdAt,
    } : null,
  });
});

// Create a new model
const createModelSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1).max(100).regex(
    /^[a-zA-Z][a-zA-Z0-9._:-]*$/,
    'Model ID must start with a letter and contain only letters, digits, hyphens, dots, underscores, or colons',
  ),
  displayName: z.string().min(1),
  inputPricePerMillion: z.number().min(0),
  outputPricePerMillion: z.number().min(0),
  maxContextTokens: z.number().int().min(1).default(128000),
  maxOutputTokens: z.number().int().min(1).default(4096),
});

// Known model-id prefixes per provider (warns but doesn't block)
const PROVIDER_MODEL_PREFIXES: Record<string, string[]> = {
  openai: ['gpt-', 'o1', 'o2', 'o3', 'o4', 'chatgpt-', 'dall-e-', 'text-', 'tts-', 'whisper-'],
  google: ['gemini-'],
  xai: ['grok-'],
};

router.post('/models', async (req: AuthRequest, res: Response) => {
  const data = createModelSchema.parse(req.body);

  // Verify provider exists
  const provider = await repos.config.getProvider(data.providerId);
  if (!provider) {
    res.status(400).json({ error: 'Provider not found' });
    return;
  }

  // Warn if model ID doesn't match known prefixes for this provider
  const knownPrefixes = PROVIDER_MODEL_PREFIXES[data.providerId];
  let warning: string | undefined;
  if (knownPrefixes && !knownPrefixes.some((p) => data.modelId.startsWith(p))) {
    warning = `Model ID "${data.modelId}" doesn't match known ${data.providerId} model patterns (${knownPrefixes.join(', ')}). It will be saved, but verify it's correct.`;
  }

  // Check for duplicate provider_id + model_id
  const allModels = await repos.config.getModelsByProvider(data.providerId);
  const existing = allModels.find(m => m.modelId === data.modelId);
  if (existing) {
    res.status(409).json({ error: 'A model with this provider and model ID already exists' });
    return;
  }

  const id = uuidv4();
  await repos.config.createModel({
    id,
    type: 'model',
    providerId: data.providerId,
    modelId: data.modelId,
    displayName: data.displayName,
    inputPricePerMillion: data.inputPricePerMillion,
    outputPricePerMillion: data.outputPricePerMillion,
    maxContextTokens: data.maxContextTokens,
    maxOutputTokens: data.maxOutputTokens,
    supportsStreaming: true,
    isEnabled: true,
    createdAt: new Date().toISOString(),
  });

  const created = await repos.config.getModel(id);
  const providerName = provider.displayName;

  logAudit({
    action: 'model_created',
    actorId: req.user!.userId,
    actorEmail: req.user!.email,
    targetType: 'model',
    targetId: id,
    targetLabel: data.displayName,
    detail: `Created model "${data.displayName}" (${data.modelId}) for ${providerName}`,
  });

  res.status(201).json({ model: created ? { ...created, providerName } : null, warning });
});

// Delete a model (only if it has no usage)
router.delete('/models/:id', async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const model = await repos.config.getModel(id);
  if (!model) {
    res.status(404).json({ error: 'Model not found' });
    return;
  }

  // Check if model has usage records — if so, disable instead of delete
  const usageCount = await repos.usage.countByModel(id);
  if (usageCount > 0) {
    await repos.config.updateModel(id, { isEnabled: false });
    logAudit({
      action: 'model_disabled',
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      targetType: 'model',
      targetId: id,
      targetLabel: model.displayName,
      detail: `Disabled model "${model.displayName}" (had usage history)`,
    });
    res.json({ message: `Model "${model.displayName}" has usage history — disabled instead of deleted`, disabled: true });
    return;
  }

  await repos.config.deleteModel(id);
  logAudit({
    action: 'model_deleted',
    actorId: req.user!.userId,
    actorEmail: req.user!.email,
    targetType: 'model',
    targetId: id,
    targetLabel: model.displayName,
    detail: `Deleted model "${model.displayName}"`,
  });
  res.json({ message: `Model "${model.displayName}" deleted`, deleted: true });
});

// === User Management & Limits ===

/** Map UserDoc to snake_case shape expected by frontend */
function userToAdmin(u: UserDoc) {
  return {
    id: u.id,
    email: u.email,
    is_admin: u.isAdmin,
    is_superadmin: u.isSuperadmin,
    totp_enabled: u.totpEnabled,
    created_at: u.createdAt,
    first_name: u.firstName,
    last_name: u.lastName,
    organization: u.organization,
    job_title: u.jobTitle,
    linkedin_url: u.linkedinUrl,
    can_generate_invites: u.canGenerateInvites,
    daily_token_limit: u.limits.dailyTokenLimit,
    is_suspended: u.limits.isSuspended,
  };
}

router.get('/users', async (_req: AuthRequest, res: Response) => {
  const users = await repos.users.list();
  res.json({ users: users.map(userToAdmin) });
});

// Search users by name or email
router.get('/users/search', async (req: AuthRequest, res: Response) => {
  const q = (req.query.q as string || '').trim();
  if (!q) {
    res.json({ users: [] });
    return;
  }
  const users = await repos.users.list({ search: q, limit: 50 });
  res.json({ users: users.map(userToAdmin) });
});

const updateLimitsSchema = z.object({
  dailyTokenLimit: z.number().int().min(0).optional(),
  isSuspended: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  isSuperAdmin: z.boolean().optional(),
  canGenerateInvites: z.boolean().optional(),
});

router.patch('/users/:id/limits', async (req: AuthRequest, res: Response) => {
  const userId = req.params.id as string;
  const user = await repos.users.getById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // The founding SuperAdmin account cannot be modified by anyone via admin console
  if (await isFoundingSuperAdmin(userId)) {
    res.status(403).json({ error: 'The founding SuperAdmin account cannot be modified' });
    return;
  }

  const updates = updateLimitsSchema.parse(req.body);

  // Role hierarchy enforcement — check BEFORE any mutations
  const actorId = req.user!.userId;
  const actorIsSuperAdmin = await isSuperAdmin(actorId);
  const actorIsFounder = await isFoundingSuperAdmin(actorId);
  const targetIsSuperAdmin = await isSuperAdmin(userId);

  // Prevent non-SuperAdmins from modifying SuperAdmins
  if (targetIsSuperAdmin && !actorIsSuperAdmin) {
    res.status(403).json({ error: 'Cannot modify a SuperAdmin' });
    return;
  }
  // Prevent SuperAdmins from modifying other SuperAdmins (only founder can)
  if (targetIsSuperAdmin && actorId !== userId && !actorIsFounder) {
    res.status(403).json({ error: 'Only the founding SuperAdmin can modify other SuperAdmins' });
    return;
  }
  if (updates.isAdmin !== undefined && !actorIsSuperAdmin) {
    res.status(403).json({ error: 'Only SuperAdmins can manage admin roles' });
    return;
  }
  if (updates.isSuperAdmin !== undefined && !actorIsFounder) {
    res.status(403).json({ error: 'Only the founding SuperAdmin can manage SuperAdmin roles' });
    return;
  }

  // Apply limit updates (embedded in user doc)
  const limitsUpdate: Partial<UserDoc['limits']> = {};
  if (updates.dailyTokenLimit !== undefined) {
    limitsUpdate.dailyTokenLimit = updates.dailyTokenLimit;
    limitsUpdate.updatedBy = req.user!.userId;
  }
  if (updates.isSuspended !== undefined) {
    limitsUpdate.isSuspended = updates.isSuspended;
    limitsUpdate.updatedBy = req.user!.userId;
    if (updates.isSuspended) {
      await clearTrustedDevices(userId);
      await blockAllUserTokens(userId);
    }
  }
  if (Object.keys(limitsUpdate).length > 0) {
    await repos.users.update(userId, { limits: { ...user.limits, ...limitsUpdate } });
  }

  // Apply role updates
  const userUpdate: Partial<UserDoc> = {};
  if (updates.isAdmin !== undefined) userUpdate.isAdmin = updates.isAdmin;
  if (updates.isSuperAdmin !== undefined) {
    userUpdate.isSuperadmin = updates.isSuperAdmin;
    if (updates.isSuperAdmin) {
      userUpdate.isAdmin = true;
      userUpdate.canGenerateInvites = true;
    }
  }
  if (updates.canGenerateInvites !== undefined) userUpdate.canGenerateInvites = updates.canGenerateInvites;
  if (Object.keys(userUpdate).length > 0) {
    await repos.users.update(userId, userUpdate);
  }

  const updatedUser = await repos.users.getById(userId);

  // Audit log — emit one entry per logical change
  const targetLabel = user.email;
  if (updates.isSuspended !== undefined) {
    logAudit({
      action: updates.isSuspended ? 'user_suspended' : 'user_unsuspended',
      actorId, actorEmail: req.user!.email,
      targetType: 'user', targetId: userId, targetLabel,
      detail: updates.isSuspended ? `Suspended user "${targetLabel}"` : `Unsuspended user "${targetLabel}"`,
    });
  }
  if (updates.dailyTokenLimit !== undefined) {
    logAudit({
      action: 'user_limits_updated',
      actorId, actorEmail: req.user!.email,
      targetType: 'user', targetId: userId, targetLabel,
      detail: `Set daily token limit to ${updates.dailyTokenLimit.toLocaleString()} for "${targetLabel}"`,
    });
  }
  if (updates.isAdmin !== undefined) {
    logAudit({
      action: 'user_role_changed',
      actorId, actorEmail: req.user!.email,
      targetType: 'user', targetId: userId, targetLabel,
      detail: updates.isAdmin ? `Granted admin role to "${targetLabel}"` : `Revoked admin role from "${targetLabel}"`,
    });
  }
  if (updates.isSuperAdmin !== undefined) {
    logAudit({
      action: 'user_role_changed',
      actorId, actorEmail: req.user!.email,
      targetType: 'user', targetId: userId, targetLabel,
      detail: updates.isSuperAdmin ? `Granted SuperAdmin role to "${targetLabel}"` : `Revoked SuperAdmin role from "${targetLabel}"`,
    });
  }
  if (updates.canGenerateInvites !== undefined) {
    logAudit({
      action: 'user_invite_permission_changed',
      actorId, actorEmail: req.user!.email,
      targetType: 'user', targetId: userId, targetLabel,
      detail: updates.canGenerateInvites ? `Granted invite permission to "${targetLabel}"` : `Revoked invite permission from "${targetLabel}"`,
    });
  }

  res.json({ user: updatedUser ? userToAdmin(updatedUser) : null });
});

// === Platform Metrics ===

router.get('/metrics', async (_req: AuthRequest, res: Response) => {
  const [metrics, totalUsers] = await Promise.all([
    getMetrics(),
    repos.users.count(),
  ]);
  res.json({ metrics, totalUsers });
});

// === Prompt Configuration ===

// Admin-only prompt categories (document/payload/page moved to per-user Prompt Templates)
const ADMIN_PROMPT_CATEGORIES = new Set(['Research Framing', 'Actions']);

router.get('/prompts', async (_req: AuthRequest, res: Response) => {
  const prompts = (await getAllPrompts()).filter(p => ADMIN_PROMPT_CATEGORIES.has(p.category));
  res.json({ prompts });
});

const updatePromptSchema = z.object({
  value: z.string().min(1).max(50000),
});

const adminOnlyKeys = new Set(
  getPromptRegistry().filter(p => ADMIN_PROMPT_CATEGORIES.has(p.category)).map(p => p.key),
);

router.put('/prompts/:key', async (req: AuthRequest, res: Response) => {
  const key = req.params.key as string;
  if (!adminOnlyKeys.has(key)) {
    res.status(404).json({ error: 'Invalid prompt key' });
    return;
  }
  try {
    const { value } = updatePromptSchema.parse(req.body);
    await repos.config.upsertOverride({
      id: key,
      type: 'prompt_override',
      value,
      updatedBy: req.user!.userId,
      updatedAt: new Date().toISOString(),
    });
    logAudit({
      action: 'prompt_updated',
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      targetType: 'prompt',
      targetId: key,
      targetLabel: key,
      detail: `Updated prompt override "${key}"`,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.delete('/prompts/:key', async (req: AuthRequest, res: Response) => {
  const key = req.params.key as string;
  if (!adminOnlyKeys.has(key)) {
    res.status(404).json({ error: 'Invalid prompt key' });
    return;
  }
  await repos.config.deleteOverride(key);
  logAudit({
    action: 'prompt_reset',
    actorId: req.user!.userId,
    actorEmail: req.user!.email,
    targetType: 'prompt',
    targetId: key,
    targetLabel: key,
    detail: `Reset prompt "${key}" to default`,
  });
  res.json({ success: true });
});

// === Delete User ===

router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.params.id as string;
  const actorId = req.user!.userId;

  if (userId === actorId) {
    res.status(400).json({ error: 'Cannot delete your own account from the admin console' });
    return;
  }

  const target = await repos.users.getById(userId);

  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Only the founding SuperAdmin can delete other SuperAdmins
  if (target.isSuperadmin && !(await isFoundingSuperAdmin(actorId))) {
    res.status(403).json({ error: 'Only the founding SuperAdmin can delete other SuperAdmins' });
    return;
  }

  // Prevent deleting the founding SuperAdmin entirely
  if (await isFoundingSuperAdmin(userId)) {
    res.status(403).json({ error: 'Cannot delete the founding SuperAdmin' });
    return;
  }

  // Clean up auth docs, then delete user
  await repos.auth.deleteAllForUser(userId);
  await repos.users.delete(userId);
  logAudit({
    action: 'user_deleted',
    actorId,
    actorEmail: req.user!.email,
    targetType: 'user',
    targetId: userId,
    targetLabel: target.email,
    detail: `Deleted user "${target.email}"`,
  });
  res.json({ message: `User ${target.email} has been deleted` });
});

// === Site Settings ===

router.get('/settings', async (_req: AuthRequest, res: Response) => {
  const [requireInviteCode, maintenanceMode, maintenanceMessage, maintenanceEndsAt, milestoneNotifications] = await Promise.all([
    isInviteRequired(),
    isMaintenanceMode(),
    getMaintenanceMessage(),
    getMaintenanceEndsAt(),
    isMilestoneNotificationsEnabled(),
  ]);
  res.json({ requireInviteCode, maintenanceMode, maintenanceMessage, maintenanceEndsAt, milestoneNotifications });
});

const updateSettingsSchema = z.object({
  requireInviteCode: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional(),
  maintenanceEndsAt: z.string().max(50).optional(),
  milestoneNotifications: z.boolean().optional(),
});

router.patch('/settings', async (req: AuthRequest, res: Response) => {
  const updates = updateSettingsSchema.parse(req.body);
  if (updates.requireInviteCode !== undefined) {
    await setInviteRequired(updates.requireInviteCode, req.user!.userId);
    logAudit({
      action: 'setting_changed',
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      targetType: 'setting',
      targetId: 'requireInviteCode',
      targetLabel: 'Invite Required',
      detail: updates.requireInviteCode ? 'Enabled invite code requirement' : 'Disabled invite code requirement (open registration)',
    });
  }
  if (updates.maintenanceMode !== undefined) {
    await setMaintenanceMode(updates.maintenanceMode, req.user!.userId, updates.maintenanceMessage, updates.maintenanceEndsAt);
    logAudit({
      action: 'setting_changed',
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      targetType: 'setting',
      targetId: 'maintenanceMode',
      targetLabel: 'Maintenance Mode',
      detail: updates.maintenanceMode ? 'Enabled maintenance mode' : 'Disabled maintenance mode',
    });
  } else if (updates.maintenanceMessage !== undefined || updates.maintenanceEndsAt !== undefined) {
    await setMaintenanceMode(await isMaintenanceMode(), req.user!.userId, updates.maintenanceMessage, updates.maintenanceEndsAt);
  }
  if (updates.milestoneNotifications !== undefined) {
    await setMilestoneNotificationsEnabled(updates.milestoneNotifications, req.user!.userId);
    logAudit({
      action: 'setting_changed',
      actorId: req.user!.userId,
      actorEmail: req.user!.email,
      targetType: 'setting',
      targetId: 'milestoneNotifications',
      targetLabel: 'Milestone Notifications',
      detail: updates.milestoneNotifications ? 'Enabled milestone notifications' : 'Disabled milestone notifications',
    });
  }
  const [requireInviteCode, maintenanceMode, maintenanceMessage, maintenanceEndsAt, milestoneNotifications] = await Promise.all([
    isInviteRequired(),
    isMaintenanceMode(),
    getMaintenanceMessage(),
    getMaintenanceEndsAt(),
    isMilestoneNotificationsEnabled(),
  ]);
  res.json({ requireInviteCode, maintenanceMode, maintenanceMessage, maintenanceEndsAt, milestoneNotifications });
});

// === Audit Log ===

router.get('/audit', async (req: AuthRequest, res: Response) => {
  const search = (req.query.search as string || '').trim() || undefined;
  const page = Math.max(0, parseInt(req.query.page as string, 10) || 0);
  const result = await getAuditLogs({ search, page, pageSize: 20 });
  res.json(result);
});

export default router;
