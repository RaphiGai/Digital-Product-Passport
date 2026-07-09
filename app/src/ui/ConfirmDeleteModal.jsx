import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

/**
 * Confirmation dialog for a destructive hard-delete. Modelled on the RejectModal in
 * pages/Import.jsx. The caller renders it conditionally (e.g. `{confirmOpen && <ConfirmDeleteModal … />}`)
 * and supplies the warning body via children — for cascading deletes this should spell out what
 * else gets removed (variants, batches, items, passports, documents).
 *
 * @param {{
 *   title: string,
 *   confirmLabel?: string,
 *   busyLabel?: string,
 *   busy?: boolean,
 *   error?: string | null,
 *   onConfirm: () => void,
 *   onCancel: () => void,
 *   children?: React.ReactNode
 * }} props
 */
export function ConfirmDeleteModal({
  title,
  confirmLabel = 'Delete',
  busyLabel = 'Deleting…',
  busy = false,
  error = null,
  onConfirm,
  onCancel,
  children
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onCancel?.(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-black/8 px-6 py-4">
          <span className="mt-0.5 rounded-full bg-red-100 p-1.5 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            <p className="mt-0.5 text-xs text-ink-muted">This action cannot be undone.</p>
          </div>
        </div>
        <div className="px-6 py-4 text-sm text-ink">
          {children}
          {error && (
            <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-black/8 px-6 py-4">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
