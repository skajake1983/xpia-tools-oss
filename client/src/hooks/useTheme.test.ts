import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from './useTheme';

describe('useTheme', () => {
  let matchMediaListeners: Array<(e: { matches: boolean }) => void>;
  let matchMediaMatches: boolean;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    matchMediaListeners = [];
    matchMediaMatches = false;

    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: matchMediaMatches,
      media: query,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { matchMediaListeners.push(cb); },
      removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        matchMediaListeners = matchMediaListeners.filter((l) => l !== cb);
      },
    })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to dark when no stored preference', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('reads stored theme from localStorage', () => {
    localStorage.setItem('xpia_theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('ignores invalid stored values', () => {
    localStorage.setItem('xpia_theme', 'invalid');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('applies dark class when theme is dark', () => {
    localStorage.setItem('xpia_theme', 'dark');
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class when theme is light', () => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('xpia_theme', 'light');
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('setTheme updates theme and persists to localStorage', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('xpia_theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('switching to light removes dark class', () => {
    localStorage.setItem('xpia_theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => {
      result.current.setTheme('light');
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('xpia_theme')).toBe('light');
  });

  it('resolved returns light when theme is light', () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.setTheme('light'); });
    expect(result.current.resolved).toBe('light');
  });

  it('resolved returns dark when theme is dark', () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current.setTheme('dark'); });
    expect(result.current.resolved).toBe('dark');
  });

  it('resolved follows system preference when theme is system', () => {
    matchMediaMatches = true; // system prefers dark
    localStorage.setItem('xpia_theme', 'system');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(result.current.resolved).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('listens for system preference changes in system mode', () => {
    localStorage.setItem('xpia_theme', 'system');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(matchMediaListeners.length).toBe(1);
  });

  it('does not listen for system changes when theme is explicit', () => {
    localStorage.setItem('xpia_theme', 'dark');
    renderHook(() => useTheme());
    expect(matchMediaListeners.length).toBe(0);
  });

  it('cleans up listener on unmount', () => {
    localStorage.setItem('xpia_theme', 'system');
    const { unmount } = renderHook(() => useTheme());
    expect(matchMediaListeners.length).toBe(1);
    unmount();
    expect(matchMediaListeners.length).toBe(0);
  });
});
