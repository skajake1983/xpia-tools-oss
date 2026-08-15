import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMaintenanceGuard } from './useMaintenanceGuard';

describe('useMaintenanceGuard', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Allow location.href assignment to be intercepted
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: originalLocation.href },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
  });

  it('starts with checking = true', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useMaintenanceGuard());
    expect(result.current).toBe(true);
  });

  it('returns false when maintenance is off', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: () => Promise.resolve({ maintenance: false }),
    } as Response);

    const { result } = renderHook(() => useMaintenanceGuard());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('redirects when maintenance is on', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: () =>
        Promise.resolve({
          maintenance: true,
          maintenanceMessage: 'Down for updates',
          maintenanceEndsAt: '2026-03-24T00:00:00Z',
        }),
    } as Response);

    renderHook(() => useMaintenanceGuard());
    await waitFor(() => {
      expect(window.location.href).toContain('/maintenance');
      expect(window.location.href).toContain('Down%20for%20updates');
      expect(window.location.href).toContain('endsAt=');
    });
  });

  it('returns false when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useMaintenanceGuard());
    await waitFor(() => expect(result.current).toBe(false));
  });
});
