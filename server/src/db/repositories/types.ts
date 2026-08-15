// ── CosmosDB Repository Interfaces ──────────────────────────────────────
// Each repository maps to a CosmosDB container and defines typed CRUD operations.
// Services import these interfaces; implementations are swapped for tests (mock) vs runtime (cosmos).

// ── Shared Types ────────────────────────────────────────────────────────

export interface RunResult {
  changes: number;
}

// ── User Entity ─────────────────────────────────────────────────────────

export interface UserDoc {
  id: string;
  email: string;
  passwordHash: string;
  totpSecret: string | null;
  totpEnabled: boolean;
  isAdmin: boolean;
  isSuperadmin: boolean;
  forcePasswordChange: boolean;
  firstName: string | null;
  lastName: string | null;
  organization: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  termsAcceptedAt: string | null;
  canGenerateInvites: boolean;
  emailVerified: boolean;
  /** Embedded user limits (denormalized from user_limits table) */
  limits: {
    dailyTokenLimit: number;
    isSuspended: boolean;
    updatedBy: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface IUserRepo {
  getById(id: string): Promise<UserDoc | undefined>;
  getByEmail(email: string): Promise<UserDoc | undefined>;
  create(user: UserDoc): Promise<void>;
  update(id: string, fields: Partial<UserDoc>): Promise<void>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  /** Admin: list all users (optional search filter) */
  list(opts?: { search?: string; limit?: number }): Promise<UserDoc[]>;
  /** Founding superadmin: earliest superadmin by createdAt */
  getFoundingSuperadmin(): Promise<UserDoc | undefined>;
}

// ── Auth Entity (sessions, tokens, devices — partition by userId) ───────

export type AuthDocType = 'session' | 'token_block' | 'trusted_device' | 'password_reset' | 'email_verification';

export interface AuthDoc {
  id: string;
  userId: string;
  type: AuthDocType;
  /** For token_block: the jti (or 'user:{userId}' marker) */
  jti?: string;
  /** For trusted_device: SHA-256 hash of device token */
  tokenHash?: string;
  /** For password_reset / email_verification: SHA-256 of raw token */
  tokenHash2?: string;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
  /** CosmosDB TTL in seconds — auto-deletes expired items */
  ttl?: number;
}

export interface IAuthRepo {
  create(doc: AuthDoc): Promise<void>;
  getById(id: string, userId: string): Promise<AuthDoc | undefined>;

  // Token blocklist
  blockToken(jti: string, userId: string, expiresAt: string, ttl: number): Promise<void>;
  isTokenBlocked(jti: string): Promise<boolean>;
  /** Block ALL tokens for a user (marker pattern) */
  blockAllUserTokens(userId: string, expiresAt: string, ttl: number): Promise<void>;
  isUserBlocked(userId: string): Promise<boolean>;
  clearUserBlock(userId: string): Promise<void>;
  cleanExpiredTokens(): Promise<number>;

  // Trusted devices
  createTrustedDevice(userId: string, tokenHash: string, expiresAt: string, ttl: number): Promise<void>;
  getTrustedDevice(userId: string, tokenHash: string): Promise<AuthDoc | undefined>;
  deleteExpiredDevices(userId: string): Promise<void>;
  deleteAllDevices(userId: string): Promise<void>;

  // Password reset tokens
  createPasswordReset(userId: string, tokenHash: string, expiresAt: string, ttl: number): Promise<void>;
  getPasswordResetByHash(tokenHash: string): Promise<AuthDoc | undefined>;
  markPasswordResetUsed(id: string, userId: string): Promise<void>;
  deleteUnusedPasswordResets(userId: string): Promise<void>;

  // Email verification tokens
  createEmailVerification(userId: string, tokenHash: string, expiresAt: string, ttl: number): Promise<void>;
  getEmailVerificationByHash(tokenHash: string): Promise<AuthDoc | undefined>;
  markEmailVerificationUsed(id: string, userId: string): Promise<void>;
  deleteUnusedEmailVerifications(userId: string): Promise<void>;

  // Cascade delete — remove all auth docs for a user
  deleteAllForUser(userId: string): Promise<void>;
}

// ── Config Entity (providers, models, templates, overrides, invites, etc.) ──

export type ConfigDocType =
  | 'provider'
  | 'model'
  | 'invite_code'
  | 'invite_request'
  | 'captcha'
  | 'prompt_template'
  | 'user_active_prompt'
  | 'prompt_override';

export interface ProviderDoc {
  id: string;
  type: 'provider';
  name: string;
  displayName: string;
  baseUrl: string;
  isEnabled: boolean;
  createdAt: string;
}

export interface ModelDoc {
  id: string;
  type: 'model';
  providerId: string;
  modelId: string;
  displayName: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  maxContextTokens: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  isEnabled: boolean;
  createdAt: string;
}

export interface InviteCodeDoc {
  id: string;
  type: 'invite_code';
  code: string;
  createdBy: string;
  usedBy: string | null;
  maxUses: number;
  useCount: number;
  note: string | null;
  invitedEmail: string | null;
  invitedFirstName: string | null;
  invitedLastName: string | null;
  invitedOrganization: string | null;
  invitedJobTitle: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface InviteRequestDoc {
  id: string;
  type: 'invite_request';
  firstName: string;
  lastName: string;
  email: string;
  organization: string;
  jobTitle: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CaptchaDoc {
  id: string;
  type: 'captcha';
  answer: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
  /** TTL for auto-expiry (5 minutes) */
  ttl?: number;
}

export interface PromptTemplateDoc {
  id: string;
  type: 'prompt_template';
  userId: string | null;
  category: 'document' | 'image' | 'payload' | 'page';
  name: string;
  systemPrompt: string;
  userPrompt: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserActivePromptDoc {
  /** Synthetic ID: `{userId}:{category}` */
  id: string;
  type: 'user_active_prompt';
  userId: string;
  category: 'document' | 'image' | 'payload' | 'page';
  templateId: string;
}

export interface PromptOverrideDoc {
  /** The override key */
  id: string;
  type: 'prompt_override';
  value: string;
  updatedBy: string;
  updatedAt: string;
}

export interface SiteSettingDoc {
  id: string;
  type: 'site_setting';
  value: string;
  updatedBy: string;
  updatedAt: string;
}

export interface AuditLogDoc {
  id: string;
  type: 'audit_log';
  action: string;
  actorId: string;
  actorEmail: string;
  targetType: 'user' | 'provider' | 'model' | 'invite' | 'invite_request' | 'setting' | 'prompt';
  targetId: string;
  targetLabel: string;
  detail: string;
  createdAt: string;
  /** CosmosDB TTL in seconds — auto-deletes after retention period */
  ttl?: number;
}

export interface MonthlyMetricsSnapshot {
  tokensIn: number;
  tokensOut: number;
  documents: number;
  images: number;
  qrCodes: number;
  payloads: number;
  webPages: number;
  customActions: number;
  newUsers: number;
  activeUserIds: string[];
}

export interface MetricsDoc {
  id: 'platform_metrics';
  type: 'metrics';
  totalPages: number;
  totalDocuments: number;
  documentsByType: Record<string, number>;
  totalPayloads: number;
  payloadsByFormat: Record<string, number>;
  totalTokensIn: number;
  totalTokensOut: number;
  totalQrCodes: number;
  totalImages: number;
  totalCustomActions: number;
  monthly: Record<string, MonthlyMetricsSnapshot>;
  updatedAt: string;
}

export type ConfigDoc =
  | ProviderDoc
  | ModelDoc
  | InviteCodeDoc
  | InviteRequestDoc
  | CaptchaDoc
  | PromptTemplateDoc
  | UserActivePromptDoc
  | PromptOverrideDoc
  | SiteSettingDoc
  | MetricsDoc
  | AuditLogDoc;

export interface IConfigRepo {
  // Generic
  getById<T extends ConfigDoc>(id: string): Promise<T | undefined>;
  upsert(doc: ConfigDoc): Promise<void>;
  delete(id: string): Promise<void>;

  // Providers
  getProvider(id: string): Promise<ProviderDoc | undefined>;
  getAllProviders(includeDisabled?: boolean): Promise<ProviderDoc[]>;
  updateProvider(id: string, fields: Partial<ProviderDoc>): Promise<void>;

  // Models
  getModel(id: string): Promise<ModelDoc | undefined>;
  getAllModels(enabledOnly?: boolean): Promise<ModelDoc[]>;
  getModelsWithProviders(enabledOnly?: boolean): Promise<(ModelDoc & { providerName: string; providerDisplayName: string })[]>;
  getModelsByProvider(providerId: string): Promise<ModelDoc[]>;
  createModel(doc: ModelDoc): Promise<void>;
  updateModel(id: string, fields: Partial<ModelDoc>): Promise<void>;
  deleteModel(id: string): Promise<void>;

  // Invite codes
  getInviteByCode(code: string): Promise<InviteCodeDoc | undefined>;
  getInviteById(id: string): Promise<InviteCodeDoc | undefined>;
  listInviteCodes(createdBy?: string): Promise<(InviteCodeDoc & { creatorEmail?: string })[]>;
  createInviteCode(doc: InviteCodeDoc): Promise<void>;
  updateInviteCode(id: string, fields: Partial<InviteCodeDoc>): Promise<void>;

  // Invite requests
  getInviteRequestByEmail(email: string, status?: string): Promise<InviteRequestDoc | undefined>;
  getInviteRequest(id: string): Promise<InviteRequestDoc | undefined>;
  listInviteRequests(status?: string): Promise<InviteRequestDoc[]>;
  createInviteRequest(doc: InviteRequestDoc): Promise<void>;
  updateInviteRequest(id: string, fields: Partial<InviteRequestDoc>): Promise<void>;

  // Captcha
  getCaptcha(id: string): Promise<CaptchaDoc | undefined>;
  createCaptcha(doc: CaptchaDoc): Promise<void>;
  updateCaptcha(id: string, fields: Partial<CaptchaDoc>): Promise<void>;

  // Prompt templates
  getTemplate(id: string): Promise<PromptTemplateDoc | undefined>;
  getTemplatesForUser(userId: string): Promise<PromptTemplateDoc[]>;
  countUserTemplates(userId: string): Promise<number>;
  createTemplate(doc: PromptTemplateDoc): Promise<void>;
  updateTemplate(id: string, fields: Partial<PromptTemplateDoc>): Promise<void>;
  deleteTemplate(id: string): Promise<void>;

  // User active prompts
  getActivePrompts(userId: string): Promise<UserActivePromptDoc[]>;
  setActivePrompt(doc: UserActivePromptDoc): Promise<void>;
  clearActivePrompt(userId: string, category: string): Promise<void>;

  // Prompt overrides
  getOverride(key: string): Promise<PromptOverrideDoc | undefined>;
  getAllOverrides(): Promise<PromptOverrideDoc[]>;
  upsertOverride(doc: PromptOverrideDoc): Promise<void>;
  deleteOverride(key: string): Promise<void>;

  // Site settings
  getSiteSetting(key: string): Promise<SiteSettingDoc | undefined>;
  upsertSiteSetting(doc: SiteSettingDoc): Promise<void>;

  // Audit log
  createAuditLog(doc: AuditLogDoc): Promise<void>;
  queryAuditLogs(opts?: { search?: string; limit?: number; offset?: number }): Promise<{ logs: AuditLogDoc[]; total: number }>;

  // Seed data
  seedTemplates(templates: PromptTemplateDoc[]): Promise<void>;
}

// ── API Keys Entity (partition by userId) ───────────────────────────────

export interface ApiKeyDoc {
  id: string;
  userId: string;
  providerId: string;
  encryptedKey: string;
  keyIv: string;
  keyTag: string;
  keyFingerprint: string | null;
  keyLabel: string;
  isActive: boolean;
  createdAt: string;
}

export interface IApiKeyRepo {
  getById(id: string, userId: string): Promise<ApiKeyDoc | undefined>;
  getActiveKey(userId: string, providerId: string): Promise<ApiKeyDoc | undefined>;
  listByUser(userId: string): Promise<(ApiKeyDoc & { providerName?: string; providerIsEnabled?: boolean })[]>;
  create(doc: ApiKeyDoc): Promise<void>;
  deleteByUserProvider(userId: string, providerId: string): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
  countActive(userId: string, providerId: string): Promise<number>;
  /** Get all active keys (for startup validation) */
  getAllActive(): Promise<ApiKeyDoc[]>;
  update(id: string, userId: string, fields: Partial<ApiKeyDoc>): Promise<void>;
}

// ── Usage Log Entity (partition by userId) ──────────────────────────────

export interface UsageLogDoc {
  id: string;
  userId: string;
  providerId: string;
  /** The llm_models.id (DB key, not the API model string) */
  modelDbId: string;
  /** Denormalized model name for display (no JOIN needed) */
  modelDisplayName: string;
  /** Denormalized provider name for display */
  providerDisplayName: string;
  purpose: 'document_enhance' | 'image_enhance' | 'payload_enhance' | 'page_enhance' | 'custom_action';
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: 'ok' | 'error' | 'limit_hit';
  requestMeta: string | null;
  errorMessage: string | null;
  promptMessages: string | null;
  responseText: string | null;
  createdAt: string;
}

export interface UsageSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface DailyUsage {
  date: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelUsage {
  modelDbId: string;
  modelDisplayName: string;
  providerDisplayName: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface IUsageRepo {
  create(doc: UsageLogDoc): Promise<void>;
  getById(id: string, userId: string): Promise<UsageLogDoc | undefined>;

  /** Sum tokens for a user in a date range */
  getSummary(userId: string, startDate: string, endDate: string): Promise<UsageSummary>;
  /** System-wide summary (no userId filter) */
  getSystemSummary(startDate: string, endDate: string): Promise<UsageSummary>;
  /** Daily breakdown for a user */
  getDailyUsage(userId: string, startDate: string): Promise<DailyUsage[]>;
  /** Usage grouped by model for a user in a date range */
  getModelUsage(userId: string, startDate: string, endDate: string): Promise<ModelUsage[]>;
  /** Recent usage log entries for a user */
  getRecent(userId: string, limit?: number): Promise<UsageLogDoc[]>;
  /** All users' usage summary (admin) */
  getAllUsersSummary(startDate: string, endDate: string): Promise<{ userId: string; email: string; totalCalls: number; totalInputTokens: number; totalOutputTokens: number }[]>;
  /** Sum total tokens used by a user since a given date */
  getTotalTokensSince(userId: string, since: string): Promise<number>;
  /** Count usage log entries referencing a specific model */
  countByModel(modelDbId: string): Promise<number>;
  /** Delete usage log entries older than the given ISO date. Returns count deleted. */
  deleteOlderThan(before: string): Promise<number>;
}

// ── Content Entity (generated docs & payloads — partition by userId) ────

export interface GeneratedDocDoc {
  id: string;
  userId: string;
  kind: 'document';
  filename: string;
  docType: string;
  technique: string;
  /** Blob storage reference (binary content stored in Azure Blob Storage) */
  blobRef: string | null;
  mimeType: string | null;
  createdAt: string;
  // ── Generation metadata (added for audit trail) ──
  embeddingMethod?: string;
  severity?: string;
  customAction?: string;
  modelId?: string;
  addQrCode?: boolean;
  stealth?: string;
}

export interface GeneratedPayloadDoc {
  id: string;
  userId: string;
  kind: 'payload';
  category: string;
  severity: string;
  payloadCount: number;
  seed: number | null;
  format: string;
  content: string | null;
  createdAt: string;
  // ── Generation metadata (added for audit trail) ──
  evasionModifier?: string;
  modelId?: string;
  customAction?: string;
  stealth?: string;
}

export type ContentDoc = GeneratedDocDoc | GeneratedPayloadDoc;

export interface IContentRepo {
  // Documents
  createDocument(doc: GeneratedDocDoc): Promise<void>;
  getDocument(id: string, userId: string): Promise<GeneratedDocDoc | undefined>;
  listDocuments(userId: string, limit?: number): Promise<GeneratedDocDoc[]>;
  deleteOldDocuments(before: string): Promise<number>;

  // Payloads
  createPayload(doc: GeneratedPayloadDoc): Promise<void>;
  getPayload(id: string, userId: string): Promise<GeneratedPayloadDoc | undefined>;
  listPayloads(userId: string, limit?: number): Promise<GeneratedPayloadDoc[]>;
  deleteOldPayloads(before: string): Promise<number>;
}

// ── Pages Entity (XPIA web pages — partition by userId) ─────────────────

export interface PageDoc {
  id: string;
  userId: string;
  slug: string;
  title: string;
  technique: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // ── Generation metadata (added for audit trail) ──
  embeddingMethod?: string;
  severity?: string;
  customAction?: string;
  modelId?: string;
  addQrCode?: boolean;
  stealth?: string;
}

export interface IPageRepo {
  create(doc: PageDoc): Promise<void>;
  getById(id: string, userId: string): Promise<PageDoc | undefined>;
  getBySlug(slug: string): Promise<PageDoc | undefined>;
  listByUser(userId: string): Promise<PageDoc[]>;
  countByUser(userId: string): Promise<number>;
  update(id: string, userId: string, fields: Partial<PageDoc>): Promise<void>;
  delete(id: string, userId: string): Promise<void>;
}

// ── Repository Registry ─────────────────────────────────────────────────
// Single object holding all repos — injected at startup

export interface Repositories {
  users: IUserRepo;
  auth: IAuthRepo;
  config: IConfigRepo;
  apiKeys: IApiKeyRepo;
  usage: IUsageRepo;
  content: IContentRepo;
  pages: IPageRepo;
}
