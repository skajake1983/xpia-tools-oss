// ── Cosmos: Config Repository ────────────────────────────────────────────
// Handles providers, models, invite codes, invite requests, captchas,
// prompt templates, user active prompts, and prompt overrides.

import { Container } from '@azure/cosmos';
import type {
  IConfigRepo, ConfigDoc,
  ProviderDoc, ModelDoc, InviteCodeDoc, InviteRequestDoc,
  CaptchaDoc, PromptTemplateDoc, UserActivePromptDoc, PromptOverrideDoc,
  SiteSettingDoc, AuditLogDoc,
} from '../types';

export class CosmosConfigRepo implements IConfigRepo {
  constructor(private container: Container) {}

  // ── Generic ──────────────────────────────────────────────────────────

  async getById<T extends ConfigDoc>(id: string): Promise<T | undefined> {
    try {
      const { resource } = await this.container.item(id, id).read<T>();
      return resource ?? undefined;
    } catch (e: any) {
      if (e.code === 404) return undefined;
      throw e;
    }
  }

  async upsert(doc: ConfigDoc): Promise<void> {
    await this.container.items.upsert(doc);
  }

  async delete(id: string): Promise<void> {
    try {
      await this.container.item(id, id).delete();
    } catch (e: any) {
      if (e.code !== 404) throw e;
    }
  }

  // ── Providers ────────────────────────────────────────────────────────

  async getProvider(id: string): Promise<ProviderDoc | undefined> {
    return this.getById<ProviderDoc>(id);
  }

  async getAllProviders(includeDisabled = false): Promise<ProviderDoc[]> {
    let query = 'SELECT * FROM c WHERE c.type = "provider"';
    if (!includeDisabled) query += ' AND c.isEnabled = true';
    query += ' ORDER BY c.displayName ASC';
    const { resources } = await this.container.items.query<ProviderDoc>({ query }).fetchAll();
    return resources;
  }

  async updateProvider(id: string, fields: Partial<ProviderDoc>): Promise<void> {
    const existing = await this.getProvider(id);
    if (!existing) return;
    await this.container.item(id, id).replace({ ...existing, ...fields, id, type: 'provider' });
  }

  // ── Models ───────────────────────────────────────────────────────────

  async getModel(id: string): Promise<ModelDoc | undefined> {
    return this.getById<ModelDoc>(id);
  }

  async getAllModels(enabledOnly = false): Promise<ModelDoc[]> {
    let query = 'SELECT * FROM c WHERE c.type = "model"';
    if (enabledOnly) query += ' AND c.isEnabled = true';
    query += ' ORDER BY c.displayName ASC';
    const { resources } = await this.container.items.query<ModelDoc>({ query }).fetchAll();
    return resources;
  }

  async getModelsWithProviders(enabledOnly = false): Promise<(ModelDoc & { providerName: string; providerDisplayName: string })[]> {
    const [models, providers] = await Promise.all([
      this.getAllModels(enabledOnly),
      this.getAllProviders(true),
    ]);
    const providerMap = new Map(providers.map(p => [p.id, p]));
    return models
      .filter(m => !enabledOnly || providerMap.get(m.providerId)?.isEnabled)
      .map(m => {
        const p = providerMap.get(m.providerId);
        return { ...m, providerName: p?.name ?? '', providerDisplayName: p?.displayName ?? '' };
      });
  }

  async getModelsByProvider(providerId: string): Promise<ModelDoc[]> {
    const { resources } = await this.container.items
      .query<ModelDoc>({
        query: 'SELECT * FROM c WHERE c.type = "model" AND c.providerId = @pid ORDER BY c.displayName ASC',
        parameters: [{ name: '@pid', value: providerId }],
      })
      .fetchAll();
    return resources;
  }

  async createModel(doc: ModelDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async updateModel(id: string, fields: Partial<ModelDoc>): Promise<void> {
    const existing = await this.getModel(id);
    if (!existing) return;
    await this.container.item(id, id).replace({ ...existing, ...fields, id, type: 'model' });
  }

  async deleteModel(id: string): Promise<void> {
    await this.delete(id);
  }

  // ── Invite codes ─────────────────────────────────────────────────────

  async getInviteByCode(code: string): Promise<InviteCodeDoc | undefined> {
    const { resources } = await this.container.items
      .query<InviteCodeDoc>({
        query: 'SELECT * FROM c WHERE c.type = "invite_code" AND c.code = @code',
        parameters: [{ name: '@code', value: code }],
      })
      .fetchAll();
    return resources[0] ?? undefined;
  }

  async getInviteById(id: string): Promise<InviteCodeDoc | undefined> {
    return this.getById<InviteCodeDoc>(id);
  }

  async listInviteCodes(createdBy?: string): Promise<(InviteCodeDoc & { creatorEmail?: string })[]> {
    let query = 'SELECT * FROM c WHERE c.type = "invite_code"';
    const parameters: { name: string; value: any }[] = [];
    if (createdBy) {
      query += ' AND c.createdBy = @cb';
      parameters.push({ name: '@cb', value: createdBy });
    }
    query += ' ORDER BY c.createdAt DESC';
    const { resources } = await this.container.items
      .query<InviteCodeDoc>({ query, parameters })
      .fetchAll();
    return resources;
  }

  async createInviteCode(doc: InviteCodeDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async updateInviteCode(id: string, fields: Partial<InviteCodeDoc>): Promise<void> {
    const existing = await this.getInviteById(id);
    if (!existing) return;
    await this.container.item(id, id).replace({ ...existing, ...fields, id, type: 'invite_code' });
  }

  // ── Invite requests ──────────────────────────────────────────────────

  async getInviteRequestByEmail(email: string, status?: string): Promise<InviteRequestDoc | undefined> {
    let query = 'SELECT * FROM c WHERE c.type = "invite_request" AND c.email = @email';
    const parameters: { name: string; value: any }[] = [{ name: '@email', value: email }];
    if (status) {
      query += ' AND c.status = @status';
      parameters.push({ name: '@status', value: status });
    }
    const { resources } = await this.container.items
      .query<InviteRequestDoc>({ query, parameters })
      .fetchAll();
    return resources[0] ?? undefined;
  }

  async getInviteRequest(id: string): Promise<InviteRequestDoc | undefined> {
    return this.getById<InviteRequestDoc>(id);
  }

  async listInviteRequests(status?: string): Promise<InviteRequestDoc[]> {
    let query = 'SELECT * FROM c WHERE c.type = "invite_request"';
    const parameters: { name: string; value: any }[] = [];
    if (status) {
      query += ' AND c.status = @status';
      parameters.push({ name: '@status', value: status });
    }
    query += ' ORDER BY c.createdAt DESC';
    const { resources } = await this.container.items
      .query<InviteRequestDoc>({ query, parameters })
      .fetchAll();
    return resources;
  }

  async createInviteRequest(doc: InviteRequestDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async updateInviteRequest(id: string, fields: Partial<InviteRequestDoc>): Promise<void> {
    const existing = await this.getInviteRequest(id);
    if (!existing) return;
    await this.container.item(id, id).replace({ ...existing, ...fields, id, type: 'invite_request' });
  }

  // ── Captcha ──────────────────────────────────────────────────────────

  async getCaptcha(id: string): Promise<CaptchaDoc | undefined> {
    return this.getById<CaptchaDoc>(id);
  }

  async createCaptcha(doc: CaptchaDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async updateCaptcha(id: string, fields: Partial<CaptchaDoc>): Promise<void> {
    const existing = await this.getCaptcha(id);
    if (!existing) return;
    await this.container.item(id, id).replace({ ...existing, ...fields, id, type: 'captcha' });
  }

  // ── Prompt templates ─────────────────────────────────────────────────

  async getTemplate(id: string): Promise<PromptTemplateDoc | undefined> {
    return this.getById<PromptTemplateDoc>(id);
  }

  async getTemplatesForUser(userId: string): Promise<PromptTemplateDoc[]> {
    const { resources } = await this.container.items
      .query<PromptTemplateDoc>({
        query: 'SELECT * FROM c WHERE c.type = "prompt_template" AND (c.isSystem = true OR c.userId = @uid) ORDER BY c.name ASC',
        parameters: [{ name: '@uid', value: userId }],
      })
      .fetchAll();
    return resources;
  }

  async countUserTemplates(userId: string): Promise<number> {
    const { resources } = await this.container.items
      .query<number>({
        query: 'SELECT VALUE COUNT(1) FROM c WHERE c.type = "prompt_template" AND c.userId = @uid AND c.isSystem = false',
        parameters: [{ name: '@uid', value: userId }],
      })
      .fetchAll();
    return resources[0] ?? 0;
  }

  async createTemplate(doc: PromptTemplateDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async updateTemplate(id: string, fields: Partial<PromptTemplateDoc>): Promise<void> {
    const existing = await this.getTemplate(id);
    if (!existing) return;
    await this.container.item(id, id).replace({ ...existing, ...fields, id, type: 'prompt_template' });
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.delete(id);
  }

  // ── User active prompts ──────────────────────────────────────────────

  async getActivePrompts(userId: string): Promise<UserActivePromptDoc[]> {
    const { resources } = await this.container.items
      .query<UserActivePromptDoc>({
        query: 'SELECT * FROM c WHERE c.type = "user_active_prompt" AND c.userId = @uid',
        parameters: [{ name: '@uid', value: userId }],
      })
      .fetchAll();
    return resources;
  }

  async setActivePrompt(doc: UserActivePromptDoc): Promise<void> {
    await this.container.items.upsert(doc);
  }

  async clearActivePrompt(userId: string, category: string): Promise<void> {
    const id = `${userId}:${category}`;
    await this.delete(id);
  }

  // ── Prompt overrides ─────────────────────────────────────────────────

  async getOverride(key: string): Promise<PromptOverrideDoc | undefined> {
    return this.getById<PromptOverrideDoc>(key);
  }

  async getAllOverrides(): Promise<PromptOverrideDoc[]> {
    const { resources } = await this.container.items
      .query<PromptOverrideDoc>({ query: 'SELECT * FROM c WHERE c.type = "prompt_override"' })
      .fetchAll();
    return resources;
  }

  async upsertOverride(doc: PromptOverrideDoc): Promise<void> {
    await this.container.items.upsert(doc);
  }

  async deleteOverride(key: string): Promise<void> {
    await this.delete(key);
  }

  // ── Site settings ────────────────────────────────────────────────────

  async getSiteSetting(key: string): Promise<SiteSettingDoc | undefined> {
    return this.getById<SiteSettingDoc>(key);
  }

  async upsertSiteSetting(doc: SiteSettingDoc): Promise<void> {
    await this.container.items.upsert(doc);
  }

  // ── Audit log ─────────────────────────────────────────────────────────

  async createAuditLog(doc: AuditLogDoc): Promise<void> {
    await this.container.items.create(doc);
  }

  async queryAuditLogs(opts?: { search?: string; limit?: number; offset?: number }): Promise<{ logs: AuditLogDoc[]; total: number }> {
    const limit = opts?.limit ?? 20;
    const offset = opts?.offset ?? 0;
    const search = opts?.search?.toLowerCase();

    let whereClause = 'WHERE c.type = "audit_log"';
    const parameters: { name: string; value: any }[] = [];

    if (search) {
      whereClause += ' AND (CONTAINS(LOWER(c.actorEmail), @search) OR CONTAINS(LOWER(c.action), @search) OR CONTAINS(LOWER(c.targetLabel), @search) OR CONTAINS(LOWER(c.detail), @search))';
      parameters.push({ name: '@search', value: search });
    }

    // Get total count
    const countQuery = `SELECT VALUE COUNT(1) FROM c ${whereClause}`;
    const { resources: countRes } = await this.container.items
      .query<number>({ query: countQuery, parameters })
      .fetchAll();
    const total = countRes[0] ?? 0;

    // Get paginated results
    const dataQuery = `SELECT * FROM c ${whereClause} ORDER BY c.createdAt DESC OFFSET @offset LIMIT @limit`;
    const { resources: logs } = await this.container.items
      .query<AuditLogDoc>({
        query: dataQuery,
        parameters: [...parameters, { name: '@offset', value: offset }, { name: '@limit', value: limit }],
      })
      .fetchAll();

    return { logs, total };
  }

  // ── Seed helpers ─────────────────────────────────────────────────────

  async seedTemplates(templates: PromptTemplateDoc[]): Promise<void> {
    for (const t of templates) {
      const existing = await this.getById<PromptTemplateDoc>(t.id);
      if (!existing) await this.container.items.create(t);
    }
  }
}
