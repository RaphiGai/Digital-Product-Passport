import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * @param {{ items: { label: string, to?: string }[] }} props
 */
export function Breadcrumb({ items }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-ink-muted">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {it.to ? (
            <Link to={it.to} className="text-brand-700 hover:underline">
              {it.label}
            </Link>
          ) : (
            <span className="text-ink">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Inline error/success banner for forms. @param {{ kind: 'error' | 'success', children: React.ReactNode }} props */
export function Banner({ kind, children }) {
  const cls =
    kind === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-brand-200 bg-brand-50 text-brand-800';
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
