import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLlmPreference, formatCreditError } from './useLlmPreference';

describe('useLlmPreference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to disabled and empty model with no explicit preference', () => {
    const { result } = renderHook(() => useLlmPreference('documents'));
    expect(result.current.enabled).toBe(false);
    expect(result.current.selectedModelId).toBe('');
    expect(result.current.hasExplicitPreference).toBe(false);
  });

  it('persists enabled state to localStorage per feature', () => {
    const { result } = renderHook(() => useLlmPreference('documents'));
    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem('llm_documents_enabled')).toBe('true');
  });

  it('persists selected model to localStorage per feature', () => {
    const { result } = renderHook(() => useLlmPreference('payloads'));
    act(() => result.current.setSelectedModelId('openai-gpt54'));
    expect(result.current.selectedModelId).toBe('openai-gpt54');
    expect(localStorage.getItem('llm_payloads_model')).toBe('openai-gpt54');
  });

  it('reads persisted state on mount', () => {
    localStorage.setItem('llm_pages_enabled', 'true');
    localStorage.setItem('llm_pages_model', 'openai-gpt5');
    const { result } = renderHook(() => useLlmPreference('pages'));
    expect(result.current.enabled).toBe(true);
    expect(result.current.selectedModelId).toBe('openai-gpt5');
    expect(result.current.hasExplicitPreference).toBe(true);
  });

  it('handles toggling enabled off', () => {
    localStorage.setItem('llm_documents_enabled', 'true');
    const { result } = renderHook(() => useLlmPreference('documents'));
    expect(result.current.enabled).toBe(true);
    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);
    expect(localStorage.getItem('llm_documents_enabled')).toBe('false');
  });

  it('isolates settings between features', () => {
    const { result: docs } = renderHook(() => useLlmPreference('documents'));
    const { result: payloads } = renderHook(() => useLlmPreference('payloads'));

    act(() => {
      docs.current.setEnabled(true);
      docs.current.setSelectedModelId('model-a');
    });

    expect(docs.current.enabled).toBe(true);
    expect(docs.current.selectedModelId).toBe('model-a');
    expect(payloads.current.enabled).toBe(false);
    expect(payloads.current.selectedModelId).toBe('');
  });

  it('reports hasExplicitPreference=true after user toggles', () => {
    const { result, unmount } = renderHook(() => useLlmPreference('images'));
    expect(result.current.hasExplicitPreference).toBe(false);
    act(() => result.current.setEnabled(true));
    unmount();
    // Re-mount — localStorage now has the key
    const { result: result2 } = renderHook(() => useLlmPreference('images'));
    expect(result2.current.hasExplicitPreference).toBe(true);
    expect(result2.current.enabled).toBe(true);
  });

  it('reports hasExplicitPreference=true when user explicitly disables', () => {
    const { result, unmount } = renderHook(() => useLlmPreference('payloads'));
    act(() => result.current.setEnabled(false));
    unmount();
    const { result: result2 } = renderHook(() => useLlmPreference('payloads'));
    expect(result2.current.hasExplicitPreference).toBe(true);
    expect(result2.current.enabled).toBe(false);
  });
});

describe('formatCreditError', () => {
  it('formats monthly budget errors', () => {
    const msg = formatCreditError('Monthly budget exhausted');
    expect(msg).toContain('Out of credits');
  });

  it('formats daily token limit errors', () => {
    const msg = formatCreditError('Daily token limit reached');
    expect(msg).toContain('Daily token limit');
  });

  it('formats rate limit errors', () => {
    const msg = formatCreditError('Rate limit exceeded');
    expect(msg).toContain('Rate limit');
    expect(msg).toContain('wait');
  });

  it('formats suspension errors', () => {
    const msg = formatCreditError('Account suspended');
    expect(msg).toContain('suspended');
  });

  it('passes through unknown errors unchanged', () => {
    const msg = formatCreditError('Something unexpected happened');
    expect(msg).toBe('Something unexpected happened');
  });
});
