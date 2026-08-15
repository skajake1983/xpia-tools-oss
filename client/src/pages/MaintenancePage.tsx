import { useState, useEffect, useCallback } from 'react';
import { Construction, Clock, Loader2 } from 'lucide-react';

interface MaintenancePageProps {
  message?: string;
  endsAt?: string;
}

const POLL_INTERVAL = 30_000; // 30 seconds

export default function MaintenancePage({ message, endsAt }: MaintenancePageProps) {
  const endsAtDate = endsAt ? new Date(endsAt) : null;
  const [remaining, setRemaining] = useState('');
  const [checking, setChecking] = useState(false);

  const checkHealth = useCallback(async () => {
    try {
      setChecking(true);
      const res = await fetch('/api/health');
      const data = await res.json();
      if (!data.maintenance) {
        window.location.href = '/login';
      }
    } catch {
      // health check failed — stay on page
    } finally {
      setChecking(false);
    }
  }, []);

  // Auto-poll health endpoint
  useEffect(() => {
    const id = setInterval(checkHealth, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [checkHealth]);

  // Live countdown when endsAt is provided
  useEffect(() => {
    if (!endsAtDate || isNaN(endsAtDate.getTime())) return;

    const tick = () => {
      const diff = endsAtDate.getTime() - Date.now();
      if (diff <= 0) {
        setRemaining('');
        checkHealth();
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setRemaining(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAtDate, checkHealth]);

  const isValidDate = endsAtDate && !isNaN(endsAtDate.getTime());

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Construction className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            Under Maintenance
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
            {message || 'XPIA Tools is currently undergoing scheduled maintenance. Please check back shortly.'}
          </p>
        </div>
        {isValidDate && (
          <div className="inline-flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-4 py-2">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>
              {remaining
                ? `Estimated ${remaining} remaining`
                : `Estimated to complete by ${endsAtDate.toLocaleString()}`}
            </span>
          </div>
        )}
        <button
          onClick={checkHealth}
          disabled={checking}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors disabled:opacity-50"
        >
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {checking ? 'Checking…' : 'Try again'}
        </button>
      </div>
    </div>
  );
}
