import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  detail?: string;
}

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  allLabel?: string;
  hideAll?: boolean;
}

export default function MultiSelect({ options, selected, onChange, placeholder: _placeholder = 'Select…', allLabel = 'All', hideAll = false }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = selected.length === options.length;

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(next);
  };

  const toggleAll = () => {
    onChange(allSelected ? [] : options.map((o) => o.value));
  };

  const label = allSelected
    ? `${allLabel} (${options.length})`
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : selected.length === 0
        ? 'None selected'
        : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="select flex items-center justify-between w-full text-left"
      >
        <span>
          {label}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg overflow-hidden animate-fade-in">
          {/* All / Clear */}
          {!hideAll && (
            <>
              <button
                type="button"
                onClick={toggleAll}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors ${
                  allSelected
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                  allSelected
                    ? 'bg-brand-600 border-brand-600'
                    : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {allSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <span>{allLabel} ({options.length})</span>
              </button>

              <div className="border-t border-gray-100 dark:border-gray-700" />
            </>
          )}

          {/* Options */}
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors ${
                    isSelected
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-brand-600 border-brand-600'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="flex-1 truncate text-left">{opt.label}</span>
                  {opt.detail && <span className="text-xs text-gray-400 flex-shrink-0">{opt.detail}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
