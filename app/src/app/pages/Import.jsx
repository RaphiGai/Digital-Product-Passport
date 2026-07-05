import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, CheckCircle2, XCircle, AlertCircle, AlertTriangle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useMe } from '@/auth/useMe';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { Card, CardTitle } from '@/ui/Card';
import { Banner } from '@/ui/Breadcrumb';
import { TemplateDropdown } from '@/ui/TemplateDropdown';
import { ImportDropdown } from '@/ui/ImportWizard';
import { downloadTemplate } from '@/lib/importTemplates';
import { loadImportHistory, clearImportHistory } from '@/lib/importHistory';
import { odataList, callUnboundAction } from '@/api/client';
import { cn } from '@/lib/cn';

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_LABEL = {
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

const HISTORY_FILTERS = [
  { value: 'all',      label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const NAME_FIELDS = {
  products:          ['name', 'product_name', 'sku'],
  variants:          ['name', 'variant_name', 'sku'],
  batches:           ['batch_number', 'lot_number', 'name'],
  bom:               ['component_name', 'name'],
  business_partners: ['name', 'company_name'],
};

function extractItemNames(rowsData, entityType) {
  try {
    const rows = JSON.parse(rowsData ?? '[]');
    const fields = NAME_FIELDS[entityType] ?? ['name'];
    return rows.map((row) => {
      for (const f of fields) {
        if (row[f]) return String(row[f]);
      }
      const first = Object.values(row).find((v) => v != null && v !== '');
      return first ? String(first) : null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

const ALL_TEMPLATES = [
  { key: 'products',          label: 'Products template',          onClick: () => downloadTemplate('products') },
  { key: 'variants',          label: 'Variants template',           onClick: () => downloadTemplate('variants') },
  { key: 'batches',           label: 'Batches template',            onClick: () => downloadTemplate('batches') },
  { key: 'bom',               label: 'BOM / Hierarchy template',    onClick: () => downloadTemplate('bom') },
  { key: 'business_partners', label: 'Business Partners template',  onClick: () => downloadTemplate('business_partners') },
];

const ALL_IMPORT_OPTIONS = [
  { key: 'products',          label: 'Import products' },
  { key: 'variants',          label: 'Import variants' },
  { key: 'batches',           label: 'Import batches' },
  { key: 'bom',               label: 'Import BOM / Hierarchy' },
  { key: 'business_partners', label: 'Import business partners' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function shortId(uuid) {
  return uuid.slice(0, 8).toUpperCase();
}

// ── Status badges ──────────────────────────────────────────────────────────

function HistoryStatusBadge({ status }) {
  if (status === 'approved' || status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" /> {status === 'approved' ? 'Approved' : 'Success'}
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-3 w-3" /> Partial
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
        <XCircle className="h-3 w-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
      <AlertCircle className="h-3 w-3" /> Failed
    </span>
  );
}

function ApprovalStatusBadge({ status }) {
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
            className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
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

// ── ImportRow (approval expandable row) ───────────────────────────────────

function ImportRow({ record, onApprove, onReject, actionBusy }) {
  const [expanded, setExpanded] = useState(false);

  const issues      = (() => { try { return JSON.parse(record.validation_issues ?? '[]'); } catch { return []; } })();
  const rawRows     = (() => { try { return JSON.parse(record.rows_data ?? '[]'); } catch { return []; } })();
  const previewRows = rawRows.slice(0, 5);
  const colKeys     = previewRows.length > 0 ? Object.keys(previewRows[0]).slice(0, 6) : [];

  const hardErrors = issues.filter((i) => i.severity === 'error');
  const warnings   = issues.filter((i) => i.severity === 'warning');
  const isPending  = record.status === 'pending';
  const isBusy     = actionBusy === record.ID;

  return (
    <div className="border-b border-black/5 last:border-0">
      <div
        className="grid grid-cols-[1fr_160px_80px_80px_80px_160px_140px] gap-3 items-center px-5 py-3 hover:bg-black/[0.015] cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{record.file_name || '—'}</p>
          <p className="text-xs text-ink-muted">{CATEGORY_LABEL[record.entity_type] ?? record.entity_type}</p>
        </div>
        <span className="text-xs text-ink-muted tabular-nums">{formatDateTime(record.created_at)}</span>
        <span className="text-right text-sm tabular-nums text-ink">{record.total_rows ?? 0}</span>
        <span className="text-right text-sm tabular-nums font-medium text-green-700">{record.valid_rows ?? 0}</span>
        <span className={cn('text-right text-sm tabular-nums', (record.skipped_rows ?? 0) > 0 ? 'text-amber-700' : 'text-ink-muted')}>
          {record.skipped_rows ?? 0}
        </span>
        <span className="text-xs text-ink-muted truncate">{record.created_by?.display_name ?? '—'}</span>
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
          {expanded
            ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted" />
            : <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
          }
        </div>
      </div>

      {expanded && (
        <div className="border-t border-black/5 bg-gray-50/60 px-5 py-4 space-y-4">
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

export function Import() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [localHistory, setLocalHistory] = useState(() => loadImportHistory());

  const [historyFilter, setHistoryFilter] = useState('all');
  const [msg, setMsg]                     = useState(null);
  const [actionBusy, setActionBusy]       = useState(null);
  const [rejectTarget, setRejectTarget]   = useState(null);

  const q = useQuery({
    queryKey: ['PendingImports'],
    queryFn: () => odataList('PendingImports', {
      orderby: 'created_at desc',
      expand: ['created_by($select=ID,display_name)', 'reviewed_by($select=ID,display_name)'],
    }),
  });

  const allRecords     = q.data ?? [];
  const approvalRecords = allRecords.filter((r) => r.status === 'pending');
  const pendingCount   = approvalRecords.length;

  // Server-side completed imports (approved or rejected)
  const serverHistory = allRecords.filter((r) => r.status !== 'pending');

  // Normalize local storage entries to a common shape
  const normalizedLocal = localHistory.map((e) => ({
    _src: 'local',
    id: e.id,
    timestamp: e.timestamp,
    file_name: null,
    category: e.category,
    total: e.total,
    created: e.created,
    skipped: e.skipped,
    status: e.status, // 'success' | 'partial' | 'failed'
    submitted_by: null,
    reviewed_by: null,
    reviewed_at: null,
  }));

  // Merge and sort newest-first
  const mergedHistory = [
    ...serverHistory.map((r) => ({
      _src: 'server',
      id: r.ID,
      timestamp: r.reviewed_at || r.created_at,
      file_name: r.file_name,
      category: r.entity_type,
      total: r.total_rows ?? 0,
      created: r.valid_rows ?? 0,
      skipped: r.skipped_rows ?? 0,
      status: r.status, // 'approved' | 'rejected'
      submitted_by: r.created_by?.display_name ?? null,
      reviewed_by: r.reviewed_by?.display_name ?? null,
      reviewed_at: r.reviewed_at,
      rows_data: r.rows_data ?? null,
    })),
    ...normalizedLocal,
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const filteredHistory = historyFilter === 'all'
    ? mergedHistory
    : historyFilter === 'approved'
      ? mergedHistory.filter((h) => h.status === 'approved' || h.status === 'success' || h.status === 'partial')
      : mergedHistory.filter((h) => h.status === 'rejected' || h.status === 'failed');

  if (me && me.role !== 'company_advanced') {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-muted">
        You do not have permission to view this page.
      </div>
    );
  }

  function handleClearLocal() {
    clearImportHistory();
    setLocalHistory([]);
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Import</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Download templates, fill them in, and upload them to bulk-create records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TemplateDropdown templates={ALL_TEMPLATES} label="Download template" />
          <ImportDropdown
            label="Import"
            options={ALL_IMPORT_OPTIONS}
            onImported={() => qc.invalidateQueries({ queryKey: ['PendingImports'] })}
          />
        </div>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {/* Import approvals — pending only */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ink">
            Import approvals
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Review staged imports before they are written to the database.
          </p>
        </div>

        {q.isLoading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : approvalRecords.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="h-7 w-7 text-ink-muted/40" />
              <p className="text-sm text-ink-muted">No pending imports. All caught up.</p>
            </div>
          </Card>
        ) : (
          <Card className="p-0">
            <div className="grid grid-cols-[1fr_160px_80px_80px_80px_160px_140px] gap-3 border-b border-black/5 px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-muted">
              <span>File / Type</span>
              <span>Submitted at</span>
              <span className="text-right">Total</span>
              <span className="text-right">Valid</span>
              <span className="text-right">Skipped</span>
              <span>Submitted by</span>
              <span className="text-right">Actions</span>
            </div>
            {approvalRecords.map((record) => (
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
      </div>

      {/* How it works */}
      <Card>
        <CardTitle>How it works</CardTitle>
        <ol className="mt-3 space-y-2 text-sm text-ink-muted list-decimal list-inside">
          <li>Download the template for the data type you want to import.</li>
          <li>Fill in the spreadsheet from row 3 onwards (row 1 = headers, row 2 = format hints).</li>
          <li>Click <span className="font-medium text-ink">Import</span>, select the data type, and upload your file.</li>
          <li>Review the validation results, then submit for approval. A company advanced user approves or rejects the staged batch.</li>
        </ol>
      </Card>

      {/* Import history */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Import history</h2>
          {localHistory.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClearLocal}>
              <Trash2 className="h-3.5 w-3.5" /> Clear history
            </Button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="mb-4 flex gap-1 rounded-lg border border-black/8 bg-gray-50/40 p-1 w-fit">
          {HISTORY_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setHistoryFilter(f.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                historyFilter === f.value ? 'bg-card text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : filteredHistory.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Clock className="h-8 w-8 text-ink-muted/40" />
              <p className="text-sm text-ink-muted">
                {historyFilter === 'all'
                  ? 'No import history yet.'
                  : `No ${historyFilter} imports.`}
              </p>
            </div>
          </Card>
        ) : (
          <Card className="p-0">
            <div className="grid grid-cols-[160px_1fr_130px_90px_60px_60px_60px_120px] gap-3 border-b border-black/5 px-5 py-2.5 text-xs font-medium uppercase tracking-wider text-ink-muted">
              <span>File / Category</span>
              <span>Items</span>
              <span>Date</span>
              <span>Status</span>
              <span className="text-right">Total</span>
              <span className="text-right">Created</span>
              <span className="text-right">Skipped</span>
              <span>By</span>
            </div>
            {filteredHistory.map((item) => {
              const itemNames = item._src === 'server' && item.rows_data
                ? extractItemNames(item.rows_data, item.category)
                : [];
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[160px_1fr_130px_90px_60px_60px_60px_120px] gap-3 items-start border-b border-black/5 px-5 py-3 last:border-0 hover:bg-black/[0.015]"
                >
                  <div className="min-w-0 pt-0.5">
                    {item.file_name
                      ? <p className="truncate text-xs font-medium text-ink">{item.file_name}</p>
                      : null
                    }
                    <p className={cn('text-xs text-ink-muted', !item.file_name && 'font-medium text-ink')}>
                      {CATEGORY_LABEL[item.category] ?? item.category}
                      {item._src === 'local' && (
                        <span className="ml-1.5 font-mono text-[10px] text-ink-muted/60">{shortId(item.id)}</span>
                      )}
                    </p>
                  </div>

                  {/* Items list */}
                  <div className="min-w-0 pt-0.5">
                    {itemNames.length > 0 ? (
                      <div className="space-y-0.5">
                        {itemNames.slice(0, 4).map((name, i) => (
                          <p key={i} className="truncate text-xs text-ink">{name}</p>
                        ))}
                        {itemNames.length > 4 && (
                          <p className="text-xs text-ink-muted">+{itemNames.length - 4} more</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </div>

                  <span className="text-xs text-ink-muted tabular-nums pt-0.5">{formatDateTime(item.timestamp)}</span>
                  <div className="pt-0.5"><HistoryStatusBadge status={item.status} /></div>
                  <span className="text-right text-sm tabular-nums text-ink pt-0.5">{item.total}</span>
                  <span className={cn('text-right text-sm tabular-nums font-medium pt-0.5', item.created > 0 ? 'text-green-700' : 'text-ink-muted')}>
                    {item.created}
                  </span>
                  <span className={cn('text-right text-sm tabular-nums pt-0.5', item.skipped > 0 ? 'text-amber-700' : 'text-ink-muted')}>
                    {item.skipped}
                  </span>
                  <div className="text-xs text-ink-muted truncate pt-0.5">
                    {item._src === 'server'
                      ? (item.reviewed_by
                          ? <span title={`Submitted by ${item.submitted_by ?? '—'}`}>{item.reviewed_by}</span>
                          : item.submitted_by ?? '—')
                      : '—'
                    }
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>

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
