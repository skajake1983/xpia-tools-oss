const BASE_URL = '/api';

let _lastCorrelationId = '';

/** Return the most recent X-Correlation-Id seen from a server response */
export function getLastCorrelationId(): string { return _lastCorrelationId; }

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

/** Proactive token refresh — fires 1 minute before the 15-min access token expires */
const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const REFRESH_BUFFER_MS = 60 * 1000; // refresh 1 minute early
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleProactiveRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await tryRefresh();
  }, ACCESS_TOKEN_LIFETIME_MS - REFRESH_BUFFER_MS);
}

/** Call when the user logs out or session ends to stop the timer */
export function cancelProactiveRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

async function tryRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  }).then((res) => {
    isRefreshing = false;
    refreshPromise = null;
    if (res.ok) scheduleProactiveRefresh();
    return res.ok;
  }).catch(() => {
    isRefreshing = false;
    refreshPromise = null;
    return false;
  });
  return refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, extra?: { skipMaintenanceRedirect?: boolean }): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // On 401, try a silent token refresh once then retry
  if (res.status === 401 && !path.includes('/auth/refresh') && !path.includes('/auth/login')) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  const cid = res.headers?.get('x-correlation-id');
  if (cid) _lastCorrelationId = cid;

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));

    // Maintenance mode — redirect to /maintenance with the server message
    // Skip if already on /maintenance (prevents infinite loop) or if caller opted out
    if (res.status === 503 && body.error === 'maintenance') {
      if (!extra?.skipMaintenanceRedirect && window.location.pathname !== '/maintenance') {
        const msg = encodeURIComponent(body.message || '');
        const endsAt = body.endsAt ? `&endsAt=${encodeURIComponent(body.endsAt)}` : '';
        window.location.href = `/maintenance?message=${msg}${endsAt}`;
        // Never resolves — page is navigating away
        return new Promise<never>(() => {});
      }
    }

    const suffix = cid && res.status !== 401 && res.status !== 403 ? ` [ref: ${cid}]` : '';
    throw new Error((body.error || `Request failed: ${res.status}`) + suffix);
  }

  const contentType = res.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return res.json();
  }

  return res as unknown as T;
}

// Auth
export const api = {
  auth: {
    getCaptcha: () => request<{ id: string; question: string }>('/auth/captcha'),

    getRegistrationSettings: () =>
      request<{ requireInviteCode: boolean }>('/auth/registration-settings'),

    lookupInviteCode: (code: string) =>
      request<{ email: string | null; firstName: string | null; lastName: string | null; organization: string | null; jobTitle: string | null }>(`/auth/invite-code-info?code=${encodeURIComponent(code)}`),

    register: (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      organization?: string;
      jobTitle?: string;
      linkedinUrl?: string;
      inviteCode?: string;
      captchaId: string;
      captchaAnswer: string;
      termsAcceptedAt: string;
    }) =>
      request<{ user: { id: string; email: string } }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    login: (email: string, password: string, deviceToken?: string) =>
      request<{ requires2FA?: boolean; tempToken?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, deviceToken }),
      }),

    verify2FA: (tempToken: string, code: string, trustDevice?: boolean) =>
      request<{ deviceToken?: string }>('/auth/verify-2fa', {
        method: 'POST',
        body: JSON.stringify({ tempToken, code, trustDevice }),
      }),

    me: () => request<{ user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      organization: string | null;
      jobTitle: string | null;
      linkedinUrl: string | null;
      totpEnabled: boolean;
      forcePasswordChange: boolean;
      isAdmin: boolean;
      isSuperAdmin: boolean;
      isFounder: boolean;
      canGenerateInvites: boolean;
      emailVerified: boolean;
    } }>('/auth/me', {}, { skipMaintenanceRedirect: true }),

    setup2FA: () => request<{ secret: string; qrCodeUrl: string }>('/auth/setup-2fa', { method: 'POST' }),

    confirm2FA: (code: string) =>
      request<{ success: boolean }>('/auth/confirm-2fa', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),

    disable2FA: (code: string) =>
      request<{ success: boolean }>('/auth/disable-2fa', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),

    logout: () =>
      request<{ message: string }>('/auth/logout', { method: 'POST' }),

    refresh: () =>
      request<{ message: string }>('/auth/refresh', { method: 'POST' }),

    forgotPassword: (email: string) =>
      request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    resetPassword: (token: string, password: string) =>
      request<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      }),

    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),

    verifyEmail: (token: string) =>
      request<{ message: string }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),

    resendVerification: () =>
      request<{ message: string }>('/auth/resend-verification', {
        method: 'POST',
      }),

    deleteAccount: (password: string) =>
      request<{ message: string }>('/auth/account', {
        method: 'DELETE',
        body: JSON.stringify({ password }),
      }),

    updateProfile: (updates: {
      firstName?: string;
      lastName?: string;
      organization?: string;
      jobTitle?: string;
      linkedinUrl?: string;
    }) =>
      request<{ user: unknown }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
  },

  // === Invite Codes ===
  invites: {
    create: (options: { email: string; firstName: string; lastName: string; expiresInHours?: number }) =>
      request<{ id: string; code: string }>('/invites', {
        method: 'POST',
        body: JSON.stringify(options),
      }),

    list: () =>
      request<{
        codes: {
          id: string;
          code: string;
          created_by: string;
          creator_email: string;
          used_by: string | null;
          max_uses: number;
          use_count: number;
          note: string | null;
          invited_email: string | null;
          invited_first_name: string | null;
          invited_last_name: string | null;
          expires_at: string | null;
          revoked_at: string | null;
          created_at: string;
        }[];
      }>('/invites'),

    revoke: (id: string) =>
      request<{ success: boolean }>(`/invites/${id}`, { method: 'DELETE' }),

    validate: (code: string) =>
      request<{ valid: boolean; error?: string }>('/invites/validate', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
  },

  documents: {
    getTechniques: () =>
      request<{
        techniques: {
          id: string;
          name: string;
          category: string;
          severity: string;
          description: string;
          embeddingMethod: string;
        }[];
      }>('/documents/techniques'),

    generate: async (docType: string, techniqueId: string, customAction?: string, modelId?: string, addQrCode?: boolean) => {
      const res = await fetch(`${BASE_URL}/documents/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ docType, techniqueId, customAction, ...(modelId ? { modelId } : {}), ...(addQrCode ? { addQrCode } : {}) }),
      });

      if (!res.ok) {
        const cid = res.headers?.get('x-correlation-id');
        const body = await res.json().catch(() => ({ error: res.statusText }));
        const ref = cid ? ` [ref: ${cid}]` : '';
        throw new Error((body.error || 'Generation failed') + ref);
      }

      const blob = await res.blob();
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || `document.${docType}`;
      return { blob, filename };
    },

    generateBatch: async (docTypes: string[], techniqueId: string, customAction?: string, modelId?: string, addQrCode?: boolean) => {
      const res = await fetch(`${BASE_URL}/documents/generate-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ docTypes, techniqueId, customAction, ...(modelId ? { modelId } : {}), ...(addQrCode ? { addQrCode } : {}) }),
      });

      if (!res.ok) {
        const cid = res.headers?.get('x-correlation-id');
        const body = await res.json().catch(() => ({ error: res.statusText }));
        const ref = cid ? ` [ref: ${cid}]` : '';
        throw new Error((body.error || 'Generation failed') + ref);
      }

      const blob = await res.blob();
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'documents.zip';
      return { blob, filename };
    },

    getHistory: () => request<{ history: { id: string; filename: string; doc_type: string; technique: string; created_at: string; embedding_method?: string; severity?: string; custom_action?: string; model_id?: string; add_qr_code?: boolean }[] }>('/documents/history'),

    downloadHistoryItem: async (id: string) => {
      const res = await fetch(`${BASE_URL}/documents/history/${id}/download`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const cid = res.headers?.get('x-correlation-id');
        const body = await res.json().catch(() => ({ error: res.statusText }));
        const ref = cid ? ` [ref: ${cid}]` : '';
        throw new Error((body.error || 'Download failed') + ref);
      }
      const blob = await res.blob();
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'document';
      return { blob, filename };
    },
  },

  images: {
    getTechniques: () =>
      request<{
        techniques: {
          id: string;
          name: string;
          category: string;
          severity: string;
          description: string;
          embeddingMethod: string;
        }[];
      }>('/images/techniques'),

    generate: async (docType: string, techniqueId: string, customAction?: string, modelId?: string, addQrCode?: boolean, imageLayout?: string) => {
      const res = await fetch(`${BASE_URL}/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ docType, techniqueId, customAction, ...(modelId ? { modelId } : {}), ...(addQrCode ? { addQrCode } : {}), ...(imageLayout ? { imageLayout } : {}) }),
      });

      if (!res.ok) {
        const cid = res.headers?.get('x-correlation-id');
        const body = await res.json().catch(() => ({ error: res.statusText }));
        const ref = cid ? ` [ref: ${cid}]` : '';
        throw new Error((body.error || 'Generation failed') + ref);
      }

      const blob = await res.blob();
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || `image.${docType}`;
      return { blob, filename };
    },

    generateBatch: async (docTypes: string[], techniqueId: string, customAction?: string, modelId?: string, addQrCode?: boolean, imageLayout?: string) => {
      const res = await fetch(`${BASE_URL}/images/generate-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ docTypes, techniqueId, customAction, ...(modelId ? { modelId } : {}), ...(addQrCode ? { addQrCode } : {}), ...(imageLayout ? { imageLayout } : {}) }),
      });

      if (!res.ok) {
        const cid = res.headers?.get('x-correlation-id');
        const body = await res.json().catch(() => ({ error: res.statusText }));
        const ref = cid ? ` [ref: ${cid}]` : '';
        throw new Error((body.error || 'Generation failed') + ref);
      }

      const blob = await res.blob();
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'images.zip';
      return { blob, filename };
    },

    getHistory: () => request<{ history: { id: string; filename: string; doc_type: string; technique: string; created_at: string; embedding_method?: string; severity?: string; custom_action?: string; model_id?: string; add_qr_code?: boolean }[] }>('/images/history'),

    downloadHistoryItem: async (id: string) => {
      const res = await fetch(`${BASE_URL}/images/history/${id}/download`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const cid = res.headers?.get('x-correlation-id');
        const body = await res.json().catch(() => ({ error: res.statusText }));
        const ref = cid ? ` [ref: ${cid}]` : '';
        throw new Error((body.error || 'Download failed') + ref);
      }
      const blob = await res.blob();
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'image';
      return { blob, filename };
    },
  },

  payloads: {
    getCategories: () =>
      request<{
        categories: { id: string; label: string; description: string }[];
      }>('/payloads/categories'),

    getEvasions: () =>
      request<{ evasions: { id: string; name: string }[] }>('/payloads/evasions'),

    generate: (options: {
      categories?: string[];
      severities?: string[];
      count: number;
      seed?: number;
      format: 'json' | 'text';
      evasionModifier?: string;
      modelId?: string;
      customAction?: string;
    }) =>
      request<{
        payloads: {
          id: string;
          templateId: string;
          templateName: string;
          category: string;
          categoryLabel: string;
          severity: string;
          payload: string;
          evasion: string;
        }[];
        metadata: {
          count: number;
          seed: number;
          categories: string[];
          severities: string[];
          format: string;
          evasion: string;
        };
        formatted: string;
      }>('/payloads/generate', {
        method: 'POST',
        body: JSON.stringify(options),
      }),

    getHistory: () => request<{ history: { id: string; category: string; severity: string; payload_count: number; seed: number; format: string; created_at: string; evasion_modifier?: string; model_id?: string; custom_action?: string }[] }>('/payloads/history'),

    downloadHistoryItem: async (id: string) => {
      const res = await fetch(`${BASE_URL}/payloads/history/${id}/download`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const cid = res.headers?.get('x-correlation-id');
        const body = await res.json().catch(() => ({ error: res.statusText }));
        const ref = cid ? ` [ref: ${cid}]` : '';
        throw new Error((body.error || 'Download failed') + ref);
      }
      const blob = await res.blob();
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'payloads';
      return { blob, filename };
    },
  },

  pages: {
    config: () =>
      request<{ publicPagesDomain: string; maxPagesPerUser: number }>('/pages/config'),

    list: () =>
      request<{
        pages: {
          id: string;
          slug: string;
          title: string;
          technique: string;
          content: string;
          isActive: boolean;
          createdAt: string;
        }[];
      }>('/pages'),

    create: (title: string, techniqueId: string, customAction?: string, modelId?: string, addQrCode?: boolean) =>
      request<{
        page: {
          id: string;
          slug: string;
          title: string;
          technique: string;
          isActive: boolean;
          createdAt: string;
        };
      }>('/pages', {
        method: 'POST',
        body: JSON.stringify({ title, techniqueId, customAction, ...(modelId ? { modelId } : {}), ...(addQrCode ? { addQrCode } : {}) }),
      }),

    toggle: (id: string) =>
      request<{ page: { id: string; isActive: boolean } }>(`/pages/${id}/toggle`, { method: 'PATCH' }),

    delete: (id: string) =>
      request<void>(`/pages/${id}`, { method: 'DELETE' }),
  },

  // Desktop-only (feature-detected — 404s on the web app): toggle the read-only
  // LAN page server so other devices on the network can load generated pages.
  local: {
    network: {
      get: () => request<{ enabled: boolean; url: string | null }>('/local/network'),
      set: (enabled: boolean) =>
        request<{ enabled: boolean; url: string | null }>('/local/network', {
          method: 'POST',
          body: JSON.stringify({ enabled }),
        }),
    },
  },

  // === User API Keys ===
  keys: {
    list: () =>
      request<{
        keys: { id: string; provider_id: string; key_label: string; is_active: number; created_at: string; provider_name: string; provider_is_enabled: number }[];
      }>('/keys'),

    getProviders: () =>
      request<{
        providers: { id: string; name: string; display_name: string; is_enabled: number }[];
      }>('/keys/providers'),

    add: (providerId: string, apiKey: string, label?: string) =>
      request<{ key: { id: string; providerId: string; label: string; masked: string; isActive: boolean } }>('/keys', {
        method: 'POST',
        body: JSON.stringify({ providerId, apiKey, label }),
      }),

    delete: (id: string) =>
      request<{ success: boolean }>(`/keys/${id}`, { method: 'DELETE' }),
  },

  // === LLM ===
  llm: {
    getModels: () =>
      request<{
        models: {
          id: string;
          provider_id: string;
          model_id: string;
          display_name: string;
          input_price_per_million: number;
          output_price_per_million: number;
          max_context_tokens: number;
          max_output_tokens: number;
          provider_name: string;
          provider_display_name: string;
        }[];
      }>('/llm/models'),

    complete: (params: {
      modelId: string;
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
      purpose: string;
      maxTokens?: number;
      temperature?: number;
    }) =>
      request<{
        content: string;
        model: string;
        usage: { inputTokens: number; outputTokens: number };
        finishReason: string;
      }>('/llm/complete', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    /** SSE streaming — returns an EventSource-like reader */
    stream: async (params: {
      modelId: string;
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
      purpose: string;
      maxTokens?: number;
      temperature?: number;
    }) => {
      const res = await fetch(`${BASE_URL}/llm/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const cid = res.headers?.get('x-correlation-id');
        const body = await res.json().catch(() => ({ error: res.statusText }));
        const ref = cid ? ` [ref: ${cid}]` : '';
        throw new Error((body.error || 'Stream failed') + ref);
      }

      return res.body!.getReader();
    },

    action: (params: {
      modelId: string;
      prompt: string;
      purpose: string;
      context?: string;
    }) =>
      request<{
        content: string;
        usage: { inputTokens: number; outputTokens: number };
      }>('/llm/action', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  },

  // === Usage ===
  usage: {
    getCurrent: () =>
      request<{
        daily: { totalCalls: number; totalInputTokens: number; totalOutputTokens: number; tokenLimit: number };
        monthly: { totalCalls: number; totalInputTokens: number; totalOutputTokens: number };
        limits: { isSuspended: boolean };
      }>('/usage/current'),

    getDaily: (days?: number) =>
      request<{
        daily: { date: string; calls: number; inputTokens: number; outputTokens: number }[];
      }>(`/usage/daily${days ? `?days=${days}` : ''}`),

    getModels: () =>
      request<{
        models: { modelId: string; displayName: string; providerName: string; calls: number; inputTokens: number; outputTokens: number }[];
      }>('/usage/models'),

    getRecent: (limit?: number) =>
      request<{ recent: unknown[] }>(`/usage/recent${limit ? `?limit=${limit}` : ''}`),
    getLogDetail: (id: string) =>
      request<{ entry: {
        id: string; purpose: string; model_id: string; provider_id: string;
        model_display_name: string | null; provider_display_name: string | null;
        input_tokens: number; output_tokens: number;
        duration_ms: number; status: string; error_message: string | null;
        prompt_messages: string | null; response_text: string | null;
        created_at: string;
      } }>(`/usage/log/${id}`),
  },

  // === Admin ===
  admin: {
    getProviders: () =>
      request<{
        providers: { id: string; name: string; display_name: string; base_url: string; is_enabled: number }[];
      }>('/admin/providers'),

    toggleProvider: (id: string) =>
      request<{ provider: unknown }>(`/admin/providers/${id}/toggle`, { method: 'PATCH' }),

    getIntegrationCatalog: () =>
      request<{
        catalog: {
          key: string;
          display_name: string;
          base_url: string;
          note: string | null;
          installed: boolean;
          models: { model_id: string; display_name: string }[];
        }[];
      }>('/admin/integrations/catalog'),

    addIntegration: (key: string) =>
      request<{
        provider: { id: string; name: string; display_name: string; base_url: string; is_enabled: number };
        models: { id: string; model_id: string; display_name: string }[];
        note: string | null;
      }>('/admin/integrations', { method: 'POST', body: JSON.stringify({ key }) }),

    getModels: () =>
      request<{
        models: {
          id: string;
          provider_id: string;
          model_id: string;
          display_name: string;
          input_price_per_million: number;
          output_price_per_million: number;
          max_context_tokens: number;
          max_output_tokens: number;
          is_enabled: number;
          provider_name: string;
        }[];
      }>('/admin/models'),

    updateModel: (id: string, updates: { inputPricePerMillion?: number; outputPricePerMillion?: number; maxOutputTokens?: number; isEnabled?: boolean }) =>
      request<{ model: unknown }>(`/admin/models/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),

    createModel: (data: { providerId: string; modelId: string; displayName: string; inputPricePerMillion: number; outputPricePerMillion: number; maxContextTokens: number; maxOutputTokens: number }) =>
      request<{ model: unknown; warning?: string }>('/admin/models', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    deleteModel: (id: string) =>
      request<{ message: string; deleted?: boolean; disabled?: boolean }>(`/admin/models/${id}`, {
        method: 'DELETE',
      }),

    getUsers: () =>
      request<{
        users: {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          organization: string | null;
          job_title: string | null;
          linkedin_url: string | null;
          is_admin: number;
          is_superadmin: number;
          totp_enabled: number;
          can_generate_invites: number;
          created_at: string;
          daily_token_limit: number | null;
          is_suspended: number | null;
        }[];
      }>('/admin/users'),

    searchUsers: (q: string) =>
      request<{
        users: {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          organization: string | null;
          job_title: string | null;
          linkedin_url: string | null;
          is_admin: number;
          is_superadmin: number;
          totp_enabled: number;
          can_generate_invites: number;
          created_at: string;
          daily_token_limit: number | null;
          is_suspended: number | null;
        }[];
      }>(`/admin/users/search?q=${encodeURIComponent(q)}`),

    updateUserLimits: (userId: string, updates: {
      dailyTokenLimit?: number;
      isSuspended?: boolean;
      isAdmin?: boolean;
      isSuperAdmin?: boolean;
      canGenerateInvites?: boolean;
    }) =>
      request<{ user: unknown }>(`/admin/users/${userId}/limits`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),

    getMetrics: () =>
      request<{
        metrics: {
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
          monthly: Record<string, {
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
          }>;
          updatedAt: string;
        };
        totalUsers: number;
      }>('/admin/metrics'),

    getPrompts: () =>
      request<{
        prompts: {
          key: string;
          category: string;
          label: string;
          description: string;
          defaultValue: string;
          currentValue: string;
          isOverridden: boolean;
        }[];
      }>('/admin/prompts'),

    updatePrompt: (key: string, value: string) =>
      request<{ success: boolean }>(`/admin/prompts/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),

    resetPrompt: (key: string) =>
      request<{ success: boolean }>(`/admin/prompts/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      }),

    deleteUser: (userId: string) =>
      request<{ message: string }>(`/admin/users/${userId}`, {
        method: 'DELETE',
      }),

    getSettings: () =>
      request<{ requireInviteCode: boolean; maintenanceMode: boolean; maintenanceMessage: string; maintenanceEndsAt: string; milestoneNotifications: boolean }>('/admin/settings'),

    updateSettings: (updates: { requireInviteCode?: boolean; maintenanceMode?: boolean; maintenanceMessage?: string; maintenanceEndsAt?: string; milestoneNotifications?: boolean }) =>
      request<{ requireInviteCode: boolean; maintenanceMode: boolean; maintenanceMessage: string; maintenanceEndsAt: string; milestoneNotifications: boolean }>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),

    getAuditLog: (opts?: { search?: string; page?: number }) => {
      const params = new URLSearchParams();
      if (opts?.search) params.set('search', opts.search);
      if (opts?.page) params.set('page', String(opts.page));
      const qs = params.toString();
      return request<{
        logs: {
          id: string;
          action: string;
          actorId: string;
          actorEmail: string;
          targetType: string;
          targetId: string;
          targetLabel: string;
          detail: string;
          createdAt: string;
        }[];
        total: number;
        page: number;
        pageSize: number;
      }>(`/admin/audit${qs ? `?${qs}` : ''}`);
    },
  },

  // === Invite Requests (public + admin) ===
  inviteRequests: {
    getCaptcha: () =>
      request<{ id: string; question: string }>('/invite-requests/captcha'),

    submit: (data: {
      firstName: string;
      lastName: string;
      email: string;
      organization: string;
      jobTitle: string;
      captchaId: string;
      captchaAnswer: string;
    }) =>
      request<{ request: unknown }>('/invite-requests', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    list: (status?: 'pending' | 'approved' | 'rejected') =>
      request<{
        requests: {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
          organization: string;
          job_title: string;
          status: 'pending' | 'approved' | 'rejected';
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        }[];
      }>(`/invite-requests/admin${status ? `?status=${status}` : ''}`),

    approve: (id: string) =>
      request<{ request: unknown; inviteCode: string }>(`/invite-requests/${id}/approve`, { method: 'PATCH' }),

    reject: (id: string) =>
      request<{ request: unknown }>(`/invite-requests/${id}/reject`, { method: 'PATCH' }),
  },

  // === Feedback ===
  feedback: {
    getCaptcha: () => request<{ id: string; question: string }>('/feedback/captcha'),
    submit: (data: {
      type: 'bug' | 'feature' | 'feedback';
      title: string;
      description: string;
      firstName: string;
      lastName: string;
      email: string;
      correlationId?: string;
      captchaId?: string;
      captchaAnswer?: string;
    }) =>
      request<{ success: boolean; issueNumber?: number }>('/feedback', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // === Prompt Templates ===
  promptTemplates: {
    list: () =>
      request<{
        templates: {
          id: string;
          userId: string | null;
          category: 'document' | 'image' | 'payload' | 'page';
          name: string;
          systemPrompt: string;
          userPrompt: string;
          isSystem: boolean;
          createdAt: string;
          updatedAt: string;
        }[];
        active: Record<string, string>;
      }>('/prompt-templates'),

    get: (id: string) =>
      request<{
        template: {
          id: string;
          userId: string | null;
          category: 'document' | 'image' | 'payload' | 'page';
          name: string;
          systemPrompt: string;
          userPrompt: string;
          isSystem: boolean;
          createdAt: string;
          updatedAt: string;
        };
      }>(`/prompt-templates/${id}`),

    create: (data: { category: 'document' | 'image' | 'payload' | 'page'; name: string; systemPrompt: string; userPrompt: string }) =>
      request<{ template: { id: string } }>('/prompt-templates', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: { name?: string; systemPrompt?: string; userPrompt?: string }) =>
      request<{ template: { id: string } }>(`/prompt-templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<{ success: boolean }>(`/prompt-templates/${id}`, {
        method: 'DELETE',
      }),

    assign: (category: 'document' | 'image' | 'payload' | 'page', templateId: string) =>
      request<{ success: boolean }>('/prompt-templates/active/assign', {
        method: 'PUT',
        body: JSON.stringify({ category, templateId }),
      }),

    unassign: (category: 'document' | 'image' | 'payload' | 'page') =>
      request<{ success: boolean }>('/prompt-templates/active/unassign', {
        method: 'PUT',
        body: JSON.stringify({ category }),
      }),
  },
};
