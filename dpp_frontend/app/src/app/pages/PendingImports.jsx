import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, AlertCircle, AlertTriangle,
  ChevronDown, ChevronRight, Clock
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { odataList, callUnboundAction } from '@/api/client';
import { useMe } from '@/auth/useMe';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';

// ── Constants ──────────────────────────────────────────────────────────────

const TYPE_LABEL = {
  products:          'Products',
  variants:          'Variants',
  batches:           'Batches',
  bom:               'BOM / Hierarchy',
  business_partners: 'Business Partners',
};

const INVALIDATE_KEY = {
  products:          'Products',
  variants:          'ProductVariants',
  batches:           'Batches',
  bom:               'ProductBOMs',
  business_partners: 'BusinessPartners',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDateTime(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  if (status === 'pending')  return <Badge tone="amber">Pending review</Badge>;
  if (status === 'approved') return <Badge tone="green">Approved</Badge>;
  return <Badge tone="gray">Rejected</Badge>;
}

// ── RejectModal ────────────────────────────────────────────────────────────

function RejectModal({ onConfirm, onCancel, busy }) {
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-md rounded-xl bg-card shadow-2xl">
        <div className="border-b border-black/8 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Reject import</h2>
          <p className="mt-0.5 text-xs text-ink-muted">The staged rows will be discarded and no data will be written.</p>
        </div>
        <div className="px-6 py-4">
          <label className="block text-sm font-medium text-ink">Reason (optional)</label>
          <textarea
            rows={3}
            className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-white/8 px-3 py-2 text-sm text-ink placeholder:text-gray-400 dark:placeholder:text-white/30 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            placeholder="e.g. Wrong template used, missing mandatory columns…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-black/8 px-6 py-4">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm(note)} disabled={busy}>
            {busy ? 'Rejecting…' : 'Reject import'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── ImportRow ──────────────────────────────────────────────────────────────

function ImportRow({ record, onApprove, onReject, actionBusy }) {
  const [expanded, setExpanded] = useState(false);

  const issues  = (() => { try { return JSON.parse(record.validation_issues ?? '[]'); } catch { return []; } })();
  const rawRows = (() => { try { return JSON.parse(record.rows_data ?? '[]'); } catch { return []; } })();
  const previewRows = rawRows.slice(0, 5);
  const colKeys = previewRows.length > 0 ? Object.keys(previewRows[0]).slice(0, 6) : [];

  const hardErrors = issues.filter((i) => i.severity === 'error');
  const warnings   = issues.filter((i) => i.severity === 'warning');

  const isPending  = record.status === 'pending';
  const isBusy     = actionBusy === record.ID;

  return (
    <div className="border-b border-black/5 last:border-0">
      {/* Summary row */}
      <div
        className="grid grid-cols-[1fr_130px_160px_80px_80px_80px_160px_140px] gap-3 items-center px-5 py-3 hover:bg-black/[0.015] cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{record.file_name || '—'}</p>
          <p className="text-xs text-ink-muted">{TYPE_LABEL[record.entity_type] ?? record.entity_type}</p>
        </div>
        <StatusBadge status={record.status} />
        <span className="text-xs text-ink-muted tabular-nums">{fmtDateTime(record.created_at)}</span>
        <span className="text-right text-sm tabular-nums text-ink">{record.total_rows ?? 0}</span>
        <span className="text-right text-sm tabular-nums font-medium text-green-700">{record.valid_rows ?? 0}</span>
        <span className={cn('text-right text-sm tabular-nums', (record.skipped_rows ?? 0) > 0 ? 'text-amber-700' : 'text-ink-muted')}>
          {record.skipped_rows ?? 0}
        </span>
        <span className="text-xs text-ink-muted truncate">
          {record.created_by?.display_name ?? '—'}
        </span>
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {isPending && (
            <>
              <Button size="sm" onClick={() => onApprove(record.ID)} disabled={isBusy}>
                {isBusy ? '…' : 'Approve'}
              </Button>
              <Button size="sm" variant="danger" onClick={() => onReject(record.ID)} disabled={isBusy}>
                Reject
              </Button>
            </>
          )}
          {!isPending && (
            <span className="text-xs text-ink-muted">
              {record.reviewed_by?.display_name ?? '—'} · {fmtDateTime(record.reviewed_at)}
            </span>
          )}
          {expanded
            ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
          }
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-black/5 bg-gray-50/60 px-5 py-4 space-y-4">
          {/* Reject note */}
          {record.status === 'rejected' && record.review_note && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span className="font-medium">Rejection note:</span> {record.review_note}
            </div>
          )}

          {/* Validation issues */}
          {issues.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                Validation issues ({hardErrors.length} error{hardErrors.length !== 1 ? 's' : ''}, {warnings.length} warning{warnings.length !== 1 ? 's' : ''})
              </p>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-black/8">
                {issues.slice(0, 30).map((issue, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-start gap-2 border-b border-black/5 px-3 py-2 last:border-0 text-xs',
                      issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'
                    )}
                  >
                    {issue.severity === 'error'
                      ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    }
                    <span>
                      {issue.row > 0 && <span className="font-medium">Row {issue.row}</span>}
                      {issue.field && <span className="text-ink-muted"> · {issue.field}</span>}
                      {' — '}{issue.message}
                    </span>
                  </div>
                ))}
                {issues.length > 30 && (
                  <p className="px-3 py-2 text-xs text-ink-muted">…and {issues.length - 30} more</p>
                )}
              </div>
            </div>
          )}

          {/* Data preview */}
          {previewRows.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                Data preview (first {previewRows.length} of {rawRows.length} rows)
              </p>
              <div className="overflow-x-auto rounded-lg border border-black/8">
                <table className="w-full min-w-max text-xs">
                  <thead>
                    <tr className="border-b border-black/8 bg-gray-50/80">
                      {colKeys.map((k) => (
                        <th key={k} className="px-3 py-2 text-left font-medium uppercase tracking-wide text-ink-muted">
                          {k.replace(/_/g, ' ')}
                        </th>
                      ))}
                      {Object.keys(previewRows[0]).length > 6 && (
                        <th className="px-3 py-2 text-left font-medium text-ink-muted">…</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-black/5 last:border-0">
                        {colKeys.map((k) => (
                          <td key={k} className="px-3 py-2 text-ink">
                            {row[k] != null && row[k] !== '' ? String(row[k]) : <span className="text-ink-muted">—</span>}
                          </td>
                        ))}
                        {Object.keys(row).length > 6 && <td className="px-3 py-2 text-ink-muted">…</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all',      label: 'All' },
];

export function PendingImports() {
  const { data: me } = useMe();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('pending');
  const [msg, setMsg]                   = useState(null);
  const [actionBusy, setActionBusy]     = useState(null); // ID of import being acted on
  const [rejectTarget, setRejectTarget] = useState(null); // ID of import to reject

  const q = useQuery({
    queryKey: ['PendingImports'],
    queryFn: () => odataList('PendingImports', {
      orderby: 'created_at desc',
      expand: ['created_by($select=ID,display_name)', 'reviewed_by($select=ID,display_name)'],
    }),
  });

  const allRecords = q.data ?? [];
  const records = statusFilter === 'all'
    ? allRecords
    : allRecords.filter((r) => r.status === statusFilter);

  const pendingCount = allRecords.filter((r) => r.status === 'pending').length;

  if (me && me.role !== 'company_advanced') {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-muted">
        You do not have permission to view this page.
      </div>
    );
  }

  async function handleApprove(id) {
    setActionBusy(id);
    setMsg(null);
    try {
      const res = await callUnboundAction('approvePendingImport', { id });
      qc.invalidateQueries({ queryKey: ['PendingImports'] });
      const entity = allRecords.find((r) => r.ID === id)?.entity_type;
      if (INVALIDATE_KEY[entity]) qc.invalidateQueries({ queryKey: [INVALIDATE_KEY[entity]] });
      setMsg({ kind: 'success', text: `Approved. ${res.created ?? 0} record(s) created${res.skipped > 0 ? `, ${res.skipped} skipped` : ''}.` });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setActionBusy(null);
    }
  }

  async function handleReject(id, note) {
    setActionBusy(id);
    setMsg(null);
    try {
      await callUnboundAction('rejectPendingImport', { id, note: note || null });
      qc.invalidateQueries({ queryKey: ['PendingImports'] });
      setRejectTarget(null);
      setMsg({ kind: 'success', text: 'Import rejected. No data was written.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Import', to: '/import' },
          { label: 'Import approvals' },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Import approvals</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Review staged imports before they are written to the database.
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-lg border border-black/8 bg-gray-50/40 p-1 w-fit">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              statusFilter === f.value
                ? 'bg-card text-ink shadow-sm'
                : 'text-ink-muted hover:text-ink'
            )}
          >
            {f.label}
            {f.value === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {q.isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : records.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Clock className="h-8 w-8 text-ink-muted/40" />
            <p className="text-sm text-ink-muted">
              {statusFilter === 'pending' ? 'No pending imports.' : 'No imports in this category.'}
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-0">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_130px_160px_80px_80px_80px_160px_140px] gap-3 border-b border-black/5 px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-muted">
            <span>File / Type</span>
            <span>Status</span>
            <span>Submitted at</span>
            <span className="text-right">Total</span>
            <span className="text-right">Valid</span>
            <span className="text-right">Skipped</span>
            <span>Submitted by</span>
            <span className="text-right">Actions</span>
          </div>

          {records.map((record) => (
            <ImportRow
              key={record.ID}
              record={record}
              onApprove={handleApprove}
              onReject={(id) => setRejectTarget(id)}
              actionBusy={actionBusy}
            />
          ))}
        </Card>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          onConfirm={(note) => handleReject(rejectTarget, note)}
          onCancel={() => setRejectTarget(null)}
          busy={actionBusy === rejectTarget}
        />
      )}
    </div>
  );
}
