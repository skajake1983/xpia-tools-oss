import { useState, useCallback } from 'react';

export type LlmFeature = 'documents' | 'images' | 'payloads' | 'pages';

function storageKey(feature: LlmFeature, suffix: 'enabled' | 'model'): string {
  return `llm_${feature}_${suffix}`;
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    return val === 'true';
  } catch {
    return fallback;
  }
}

function readString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Persists the AI Assist toggle and selected model to localStorage
 * independently per feature (documents, payloads, pages).
 *
 * `hasExplicitPreference` is true when the user has explicitly toggled the
 * switch at least once.  When false (localStorage key absent) the UI may
 * auto-enable the toggle once models become available.
 */
export function useLlmPreference(feature: LlmFeature) {
  const enabledKey = storageKey(feature, 'enabled');
  const modelKey = storageKey(feature, 'model');

  const [enabled, setEnabledRaw] = useState(() => readBool(enabledKey, false));
  const [selectedModelId, setSelectedModelIdRaw] = useState(() => readString(modelKey, ''));
  const [hasExplicitPreference] = useState(() => {
    try { return localStorage.getItem(enabledKey) !== null; } catch { return false; }
  });

  const setEnabled = useCallback((value: boolean) => {
    setEnabledRaw(value);
    try { localStorage.setItem(enabledKey, String(value)); } catch { /* quota exceeded */ }
  }, [enabledKey]);

  const setSelectedModelId = useCallback((value: string) => {
    setSelectedModelIdRaw(value);
    try { localStorage.setItem(modelKey, value); } catch { /* quota exceeded */ }
  }, [modelKey]);

  return { enabled, setEnabled, selectedModelId, setSelectedModelId, hasExplicitPreference } as const;
}

/** Maps server credit/limit errors to user-friendly messages */
export function formatCreditError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('budget') || lower.includes('monthly')) {
    return 'Out of credits — your monthly budget has been exhausted. Contact an admin to increase your limit.';
  }
  if (lower.includes('daily') && lower.includes('token')) {
    return 'Daily token limit reached — try again tomorrow or contact an admin to increase your limit.';
  }
  if (lower.includes('rate limit') || lower.includes('per_minute')) {
    return 'Rate limit exceeded — please wait a moment and try again.';
  }
  if (lower.includes('suspended')) {
    return 'Your account has been suspended. Contact an admin for assistance.';
  }
  return message;
}
