import { useState, useEffect, useRef } from 'react';
import { FileDown, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const BASE =
  'inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 border border-gray-300 bg-white text-ink hover:bg-gray-50 text-sm';

/**
 * Button (or dropdown) for downloading pre-filled import templates.
 *
 * @param {{
 *   templates: Array<{ key: string, label: string, onClick: () => void }>,
 *   label?: string,
 *   size?: 'sm' | 'md'
 * }} props
 */
export function TemplateDropdown({ templates, label = 'Download template', size = 'md' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const h = size === 'sm' ? 'h-8 px-3' : 'h-10 px-4';

  if (templates.length === 1) {
    return (
      <button className={cn(BASE, h, 'rounded-lg')} onClick={templates[0].onClick}>
        <FileDown className="h-4 w-4" />
        {label}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        className={cn(BASE, h, 'rounded-lg')}
        onClick={() => setOpen((o) => !o)}
      >
        <FileDown className="h-4 w-4" />
        {label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-black/10 bg-card py-1 shadow-lg">
          {templates.map((t) => (
            <button
              key={t.key}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink hover:bg-gray-50"
              onClick={() => {
                t.onClick();
                setOpen(false);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
