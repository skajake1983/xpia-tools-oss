import { useEffect, useState } from 'react';

/**
 * Checks /api/health on mount and redirects to /maintenance if maintenance mode is active.
 * Use on auth pages (login, register, forgot-password, reset-password) so non-admin
 * visitors see the maintenance page instead of the login form.
 *
 * Returns `true` while the check is in-flight so callers can suppress rendering.
 */
export function useMaintenanceGuard(): boolean {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.maintenance) {
          const msg = encodeURIComponent(data.maintenanceMessage || '');
          const endsAt = data.maintenanceEndsAt ? `&endsAt=${encodeURIComponent(data.maintenanceEndsAt)}` : '';
          window.location.href = `/maintenance?message=${msg}${endsAt}`;
        } else if (!cancelled) {
          setChecking(false);
        }
      })
      .catch(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  return checking;
}
