import { HelpCircle } from 'lucide-react';
import { useRef, useState, useCallback } from 'react';

export default function HelpTip({ text }: { text: string }) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [align, setAlign] = useState<'center' | 'left' | 'right'>('center');
  const [vAlign, setVAlign] = useState<'above' | 'below'>('above');

  const updateAlign = useCallback(() => {
    const el = wrapperRef.current;
    const tip = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tooltipW = 224; // w-56 = 14rem = 224px
    const half = tooltipW / 2;
    if (rect.left + rect.width / 2 - half < 8) setAlign('left');
    else if (rect.left + rect.width / 2 + half > window.innerWidth - 8) setAlign('right');
    else setAlign('center');
    // Measure actual tooltip height; flip below if it would overflow the top
    const tipH = tip ? tip.getBoundingClientRect().height : 120;
    setVAlign(rect.top < tipH + 8 ? 'below' : 'above');
  }, []);

  const alignClass =
    align === 'left' ? 'left-0'
    : align === 'right' ? 'right-0'
    : 'left-1/2 -translate-x-1/2';

  const vAlignClass = vAlign === 'above' ? 'bottom-full mb-2' : 'top-full mt-2';

  return (
    <span ref={wrapperRef} className="group relative inline-flex ml-1" onMouseEnter={updateAlign} onFocusCapture={updateAlign}>
      <HelpCircle className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 hover:text-brand-500 dark:hover:text-brand-400 transition-colors cursor-help" />
      <span ref={tooltipRef} className={`pointer-events-none absolute ${alignClass} ${vAlignClass} w-56 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg whitespace-pre-line`}>
        {text}
      </span>
    </span>
  );
}
