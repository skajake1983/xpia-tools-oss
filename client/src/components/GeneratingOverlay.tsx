import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface GeneratingOverlayProps {
  /** Whether the overlay is visible */
  active: boolean;
  /** Label for what is being generated, e.g. "document" */
  label?: string;
}

export default function GeneratingOverlay({ active, label = 'content' }: GeneratingOverlayProps) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (active) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      setElapsed(0);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [active]);

  if (!active) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 px-4 py-3 animate-fade-in">
      <Loader2 className="w-5 h-5 text-brand-500 animate-spin shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-brand-700 dark:text-brand-300">
          Generating {label}…
        </p>
        <p className="text-xs text-brand-500 dark:text-brand-400 mt-0.5">
          AI models may take up to 2 minutes for complex requests · {timeStr}
        </p>
      </div>
    </div>
  );
}
