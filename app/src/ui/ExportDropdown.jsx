import { useState, useEffect, useRef } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const BASE = 'inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 border border-gray-300 bg-white text-ink hover:bg-gray-50 text-sm';

/**
 * Split button: left side triggers Excel export (default), right chevron opens
 * a dropdown to choose between Excel (.xlsx) and CSV (.csv).
 *
 * @param {{ onExport: (format: 'xlsx'|'csv') => void, label?: string, disabled?: boolean, size?: 'sm'|'md' }} props
 */
export function ExportDropdown({ onExport, label = 'Export', disabled = false, size = 'md' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const mainH  = size === 'sm' ? 'h-8 px-3'  : 'h-10 px-4';
  const arrowH = size === 'sm' ? 'h-8 px-2'  : 'h-10 px-2';

  return (
    <div ref={ref} className="relative flex">
      <button
        className={cn(BASE, mainH, 'rounded-l-lg border-r-0')}
        onClick={() => onExport('xlsx')}
        disabled={disabled}
      >
        <Download className="h-4 w-4" />
        {label}
      </button>
      <button
        className={cn(BASE, arrowH, 'rounded-r-lg')}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Choose export format"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-black/10 bg-card py-1 shadow-lg">
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink hover:bg-gray-50"
            onClick={() => { onExport('xlsx'); setOpen(false); }}
          >
            Excel (.xlsx)
          </button>
          <button
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-ink hover:bg-gray-50"
            onClick={() => { onExport('csv'); setOpen(false); }}
          >
            CSV (.csv)
          </button>
        </div>
      )}
    </div>
  );
}
