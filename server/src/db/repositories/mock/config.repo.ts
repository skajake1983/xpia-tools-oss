// ── Mock: Config Repository ─────────────────────────────────────────────

import type {
  IConfigRepo, ConfigDoc,
  ProviderDoc, ModelDoc, InviteCodeDoc, InviteRequestDoc,
  CaptchaDoc, PromptTemplateDoc, UserActivePromptDoc, PromptOverrideDoc,
  SiteSettingDoc, AuditLogDoc,
} from '../types';

export class MockConfigRepo implements IConfigRepo {
  private docs: ConfigDoc[] = [];

  // ── Generic ──────────────────────────────────────────────────────────

  async getById<T extends ConfigDoc>(id: string): Promise<T | undefined> {
    return this.docs.find(d => d.id === id) as T | undefined;
  }

  async upsert(doc: ConfigDoc): Promise<void> {
    this.docs = this.docs.filter(d => d.id !== doc.id);
    this.docs.push({ ...doc });
  }

  async delete(id: string): Promise<void> {
    this.docs = this.docs.filter(d => d.id !== id);
  }

  private ofType<T extends ConfigDoc>(type: string): T[] {
    return this.docs.filter(d => d.type === type) as T[];
  }

  // ── Providers ────────────────────────────────────────────────────────

  async getProvider(id: string): Promise<ProviderDoc | undefined> {
    return this.ofType<ProviderDoc>('provider').find(p => p.id === id);
  }

  async getAllProviders(includeDisabled = false): Promise<ProviderDoc[]> {
    return this.ofType<ProviderDoc>('provider').filter(p => includeDisabled || p.isEnabled);
  }

  async updateProvider(id: string, fields: Partial<ProviderDoc>): Promise<void> {
    const idx = this.docs.findIndex(d => d.id === id && d.type === 'provider');
    if (idx >= 0) this.docs[idx] = { ...this.docs[idx], ...fields, id, type: 'provider' } as ProviderDoc;
  }

  // ── Models ───────────────────────────────────────────────────────────

  async getModel(id: string): Promise<ModelDoc | undefined> {
    return this.ofType<ModelDoc>('model').find(m => m.id === id);
  }

  async getAllModels(enabledOnly = false): Promise<ModelDoc[]> {
    return this.ofType<ModelDoc>('model').filter(m => !enabledOnly || m.isEnabled);
  }

  async getModelsWithProviders(enabledOnly = false): Promise<(ModelDoc & { providerName: string; providerDisplayName: string })[]> {
    const models = await this.getAllModels(enabledOnly);
    const providers = await this.getAllProviders(true);
    const map = new Map(providers.map(p => [p.id, p]));
    return models
      .filter(m => !enabledOnly || map.get(m.providerId)?.isEnabled)
      .map(m => {
        const p = map.get(m.providerId);
        return { ...m, providerName: p?.name ?? '', providerDisplayName: p?.displayName ?? '' };
      });
  }

  async getModelsByProvider(providerId: string): Promise<ModelDoc[]> {
    return this.ofType<ModelDoc>('model').filter(m => m.providerId === providerId);
  }

  async createModel(doc: ModelDoc): Promise<void> { this.docs.push({ ...doc }); }
  async updateModel(id: string, fields: Partial<ModelDoc>): Promise<void> {
    const idx = this.docs.findIndex(d => d.id === id && d.type === 'model');
    if (idx >= 0) this.docs[idx] = { ...this.docs[idx], ...fields, id, type: 'model' } as ModelDoc;
  }
  async deleteModel(id: string): Promise<void> { await this.delete(id); }

  // ── Invite codes ─────────────────────────────────────────────────────

  async getInviteByCode(code: string): Promise<InviteCodeDoc | undefined> {
    return this.ofType<InviteCodeDoc>('invite_code').find(i => i.code === code);
  }

  async getInviteById(id: string): Promise<InviteCodeDoc | undefined> {
    return this.getById<InviteCodeDoc>(id);
  }

  async listInviteCodes(createdBy?: string): Promise<(InviteCodeDoc & { creatorEmail?: string })[]> {
    let codes = this.ofType<InviteCodeDoc>('invite_code');
    if (createdBy) codes = codes.filter(c => c.createdBy === createdBy);
    return codes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createInviteCode(doc: InviteCodeDoc): Promise<void> { this.docs.push({ ...doc }); }
  async updateInviteCode(id: string, fields: Partial<InviteCodeDoc>): Promise<void> {
    const idx = this.docs.findIndex(d => d.id === id && d.type === 'invite_code');
    if (idx >= 0) this.docs[idx] = { ...this.docs[idx], ...fields, id, type: 'invite_code' } as InviteCodeDoc;
  }

  // ── Invite requests ──────────────────────────────────────────────────

  async getInviteRequestByEmail(email: string, status?: string): Promise<InviteRequestDoc | undefined> {
    return this.ofType<InviteRequestDoc>('invite_request').find(r =>
      r.email === email && (!status || r.status === status)
    );
  }

  async getInviteRequest(id: string): Promise<InviteRequestDoc | undefined> {
    return this.getById<InviteRequestDoc>(id);
  }

  async listInviteRequests(status?: string): Promise<InviteRequestDoc[]> {
    let reqs = this.ofType<InviteRequestDoc>('invite_request');
    if (status) reqs = reqs.filter(r => r.status === status);
    return reqs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createInviteRequest(doc: InviteRequestDoc): Promise<void> { this.docs.push({ ...doc }); }
  async updateInviteRequest(id: string, fields: Partial<InviteRequestDoc>): Promise<void> {
    const idx = this.docs.findIndex(d => d.id === id && d.type === 'invite_request');
    if (idx >= 0) this.docs[idx] = { ...this.docs[idx], ...fields, id, type: 'invite_request' } as InviteRequestDoc;
  }

  // ── Captcha ──────────────────────────────────────────────────────────

  async getCaptcha(id: string): Promise<CaptchaDoc | undefined> {
    return this.getById<CaptchaDoc>(id);
  }

  async createCaptcha(doc: CaptchaDoc): Promise<void> { this.docs.push({ ...doc }); }
  async updateCaptcha(id: string, fields: Partial<CaptchaDoc>): Promise<void> {
    const idx = this.docs.findIndex(d => d.id === id && d.type === 'captcha');
    if (idx >= 0) this.docs[idx] = { ...this.docs[idx], ...fields, id, type: 'captcha' } as CaptchaDoc;
  }

  // ── Prompt templates ─────────────────────────────────────────────────

  async getTemplate(id: string): Promise<PromptTemplateDoc | undefined> {
    return this.getById<PromptTemplateDoc>(id);
  }

  async getTemplatesForUser(userId: string): Promise<PromptTemplateDoc[]> {
    return this.ofType<PromptTemplateDoc>('prompt_template')
      .filter(t => t.isSystem || t.userId === userId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async countUserTemplates(userId: string): Promise<number> {
    return this.ofType<PromptTemplateDoc>('prompt_template')
      .filter(t => t.userId === userId && !t.isSystem).length;
  }

  async createTemplate(doc: PromptTemplateDoc): Promise<void> { this.docs.push({ ...doc }); }
  async updateTemplate(id: string, fields: Partial<PromptTemplateDoc>): Promise<void> {
    const idx = this.docs.findIndex(d => d.id === id && d.type === 'prompt_template');
    if (idx >= 0) this.docs[idx] = { ...this.docs[idx], ...fields, id, type: 'prompt_template' } as PromptTemplateDoc;
  }
  async deleteTemplate(id: string): Promise<void> { await this.delete(id); }

  // ── User active prompts ──────────────────────────────────────────────

  async getActivePrompts(userId: string): Promise<UserActivePromptDoc[]> {
    return this.ofType<UserActivePromptDoc>('user_active_prompt').filter(d => d.userId === userId);
  }

  async setActivePrompt(doc: UserActivePromptDoc): Promise<void> {
    await this.upsert(doc);
  }

  async clearActivePrompt(userId: string, category: string): Promise<void> {
    await this.delete(`${userId}:${category}`);
  }

  // ── Prompt overrides ─────────────────────────────────────────────────

  async getOverride(key: string): Promise<PromptOverrideDoc | undefined> {
    return this.getById<PromptOverrideDoc>(key);
  }

  async getAllOverrides(): Promise<PromptOverrideDoc[]> {
    return this.ofType<PromptOverrideDoc>('prompt_override');
  }

  async upsertOverride(doc: PromptOverrideDoc): Promise<void> {
    await this.upsert(doc);
  }

  async deleteOverride(key: string): Promise<void> {
    await this.delete(key);
  }

  // ── Site settings ────────────────────────────────────────────────────

  async getSiteSetting(key: string): Promise<SiteSettingDoc | undefined> {
    return this.getById<SiteSettingDoc>(key);
  }

  async upsertSiteSetting(doc: SiteSettingDoc): Promise<void> {
    await this.upsert(doc);
  }

  // ── Audit log ─────────────────────────────────────────────────────────

  async createAuditLog(doc: AuditLogDoc): Promise<void> { this.docs.push({ ...doc }); }

  async queryAuditLogs(opts?: { search?: string; limit?: number; offset?: number }): Promise<{ logs: AuditLogDoc[]; total: number }> {
    const limit = opts?.limit ?? 20;
    const offset = opts?.offset ?? 0;
    const search = opts?.search?.toLowerCase();

    let logs = this.ofType<AuditLogDoc>('audit_log');
    if (search) {
      logs = logs.filter(l =>
        l.actorEmail.toLowerCase().includes(search) ||
        l.action.toLowerCase().includes(search) ||
        l.targetLabel.toLowerCase().includes(search) ||
        l.detail.toLowerCase().includes(search),
      );
    }
    logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = logs.length;
    return { logs: logs.slice(offset, offset + limit), total };
  }

  // ── Seed helpers ─────────────────────────────────────────────────────

  async seedTemplates(templates: PromptTemplateDoc[]): Promise<void> {
    for (const t of templates) {
      const existing = this.docs.find(d => d.id === t.id);
      if (!existing) this.docs.push(t);
    }
  }

  /** Test helper */
  reset(): void { this.docs = []; }
}
