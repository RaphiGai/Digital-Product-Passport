import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { callFunction, callAction, odataUpdate, parseJsonFunctionResult } from '@/api/client';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { StatusBadge } from '@/ui/Badge';
import { PageHeader } from './ComingSoon';
import { ValidationReport } from '@/ui/ValidationReport';
import { RequireRole } from '@/auth/RequireRole';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready to publish' },
  { value: 'errors', label: 'Has errors' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' }
];

function labelVariant(v) {
  if (!v) return '—';
  return [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID || '—';
}

function text(v) {
  return String(v ?? '').toLowerCase();
}

/**
 * Map one validationOverview() entry onto the row shape the table/report render.
 * Single choke point for the backend contract — adjust here if the payload evolves.
 */
function normalizeOverviewEntry(e) {
  const v = e.validation || {};
  return {
    dpp: e.dpp || {},
    product: e.product || null,
    variant: e.variant || null,
    batch: e.batch || null,
    item: e.item || null,
    validation: {
      checks: v.checks ?? [],
      readyToPublish: v.can_approve === true,
      // count of checks that actually block approve/publish (the backend gate)
      blocking: Array.isArray(v.missing_mandatory) ? v.missing_mandatory.length : 0,
      score: v.score ?? ''
    }
  };
}

/**
 * Approve/publish one DPP through the backend workflow actions. Publishing is the
 * same two-step as the DPP-detail page: make it public, then run publishDPP (which
 * enforces the validation gate, freezes a version and issues the QR token).
 */
async function applyStatus(row, status) {
  if (!row.validation.readyToPublish) {
    throw new Error(
      'This DPP cannot be approved or published because mandatory validation checks failed.'
    );
  }
  if (status === 'approved') {
    return callAction('DPPs', row.dpp.ID, 'approveDPP');
  }
  await odataUpdate('DPPs', row.dpp.ID, { visibility: 'public' });
  return callAction('DPPs', row.dpp.ID, 'publishDPP', { change_reason: null });
}

function StatCard({ label, value, active, onClick, tone = 'default' }) {
  const toneClass =
    tone === 'green'
      ? 'text-green-700'
      : tone === 'red'
        ? 'text-red-700'
        : 'text-ink';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-xl text-left transition',
        active ? 'ring-2 ring-brand/60' : 'hover:-translate-y-0.5 hover:shadow-sm'
      ].join(' ')}
    >
      <Card>
        <p className="text-sm text-ink-muted">{label}</p>
        <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      </Card>
    </button>
  );
}

export function Validation() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [openReport, setOpenReport] = useState(null);
  const [selected, setSelected] = useState([]);

  // Org-wide readiness, evaluated server-side against the unified check catalogue —
  // the same evaluation the approveDPP/publishDPP gate runs.
  const overviewQ = useQuery({
    queryKey: ['Validation', 'overview'],
    queryFn: () => callFunction('validationOverview()'),
    select: parseJsonFunctionResult
  });

  const rows = useMemo(
    () => (overviewQ.data?.dpps ?? []).map(normalizeOverviewEntry),
    [overviewQ.data]
  );

  const counts = useMemo(() => {
    return {
      all: rows.length,
      ready: rows.filter((r) => r.validation.readyToPublish).length,
      errors: rows.filter((r) => !r.validation.readyToPublish).length,
      published: rows.filter((r) => r.dpp.status === 'published').length
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((r) => {
      const statusMatch =
        filter === 'all' ||
        (filter === 'ready' && r.validation.readyToPublish) ||
        (filter === 'errors' && !r.validation.readyToPublish) ||
        r.dpp.status === filter;

      if (!statusMatch) return false;
      if (!q) return true;

      const searchable = [
        r.dpp.ID,
        r.dpp.status,
        r.dpp.visibility,
        r.dpp.dpp_type,
        r.dpp.current_version,
        r.product?.ID,
        r.product?.name,
        r.variant?.ID,
        r.variant?.sku,
        r.variant?.color,
        r.variant?.size,
        r.batch?.ID,
        r.batch?.batch_number,
        r.item?.ID,
        r.item?.serial_number,
        r.item?.upi
      ]
        .map(text)
        .join(' ');

      return searchable.includes(q);
    });
  }, [rows, filter, query]);

  const selectedRows = filteredRows.filter((r) => selected.includes(r.dpp.ID));

  const toggleOne = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAll = (on) => {
    setSelected(on ? filteredRows.map((r) => r.dpp.ID) : []);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['Validation'] });
    qc.invalidateQueries({ queryKey: ['DPPs'] });
  };

  const updateDppStatus = useMutation({
    mutationFn: ({ row, status }) => applyStatus(row, status),
    onSuccess: () => {
      invalidate();
      setMsg({ kind: 'success', text: 'DPP status updated.' });
    },
    onError: (err) =>
      setMsg({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not update DPP status.'
      })
  });

  const bulkUpdateDppStatus = useMutation({
    mutationFn: async (status) => {
      // Sequential on purpose: publish creates version snapshots + rotates QR codes,
      // and per-DPP errors need to be collected instead of failing the whole batch.
      const failed = [];
      let ok = 0;
      for (const row of selectedRows) {
        try {
          await applyStatus(row, status);
          ok += 1;
        } catch (err) {
          failed.push({ id: row.dpp.ID, message: err instanceof Error ? err.message : 'Failed.' });
        }
      }
      return { ok, failed, status };
    },
    onSuccess: ({ ok, failed, status }) => {
      invalidate();
      // keep the failed rows selected so they can be fixed and retried
      setSelected(failed.map((f) => f.id));
      const verb = status === 'published' ? 'published' : 'approved';
      if (failed.length === 0) {
        setMsg({ kind: 'success', text: `${ok} DPP(s) ${verb}.` });
      } else {
        setMsg({
          kind: 'error',
          text: `${ok} DPP(s) ${verb}, ${failed.length} failed: ${failed[0].message}`
        });
      }
    },
    onError: (err) =>
      setMsg({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not update selected DPPs.'
      })
  });

  const loading = overviewQ.isLoading;
  const busy = updateDppStatus.isPending || bulkUpdateDppStatus.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Validation"
        subtitle="Check whether Digital Product Passports are complete and ready for publication."
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {overviewQ.isError && (
        <Banner kind="error">
          {overviewQ.error instanceof Error
            ? overviewQ.error.message
            : 'Could not load validation data.'}{' '}
          <button type="button" className="underline" onClick={() => overviewQ.refetch()}>
            Retry
          </button>
        </Banner>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Total DPPs"
          value={counts.all}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <StatCard
          label="Ready"
          value={counts.ready}
          tone="green"
          active={filter === 'ready'}
          onClick={() => setFilter('ready')}
        />
        <StatCard
          label="With errors"
          value={counts.errors}
          tone="red"
          active={filter === 'errors'}
          onClick={() => setFilter('errors')}
        />
        <StatCard
          label="Published"
          value={counts.published}
          active={filter === 'published'}
          onClick={() => setFilter('published')}
        />
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-4">
          <div>
            <CardTitle>Validation reports</CardTitle>
            <p className="mt-1 text-xs text-ink-muted">
              Publishing is only possible when all mandatory checks are passed.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by DPP, product, variant, batch, item..."
              className="h-9 w-80 max-w-full rounded-md border border-black/15 bg-white px-3 text-sm text-ink outline-none focus:border-brand"
            />

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-9 rounded-md border border-black/15 bg-white px-3 text-sm text-ink"
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">
            Loading validation data…
          </p>
        )}

        {!loading && filteredRows.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">
            No DPPs found.
          </p>
        )}

        <RequireRole role="company_advanced">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 bg-gray-50 px-5 py-3">
          <p className="text-sm text-ink-muted">
            Selected: <span className="font-medium text-ink">{selected.length}</span>
          </p>

          <div className="flex gap-2">
            <Button
              disabled={selected.length === 0 || busy}
              onClick={() => bulkUpdateDppStatus.mutate('approved')}
            >
              Approve selected
            </Button>

            <Button
              disabled={selected.length === 0 || busy}
              onClick={() => bulkUpdateDppStatus.mutate('published')}
            >
              Publish selected
            </Button>
          </div>
        </div>
      </RequireRole>

        {!loading && filteredRows.length > 0 && (

      <div className="overflow-x-auto">
        <div className="min-w-[1580px]">
          <div className="grid grid-cols-[48px_180px_220px_220px_220px_220px_140px_160px_220px]">
            <RequireRole role="company_advanced">
              <input
                type="checkbox"
                checked={filteredRows.length > 0 && selected.length === filteredRows.length}
                onChange={(e) => toggleAll(e.target.checked)}
              />
            </RequireRole>
            <span>DPP</span>
            <span>Product</span>
            <span>Variant</span>
            <span>Batch</span>
            <span>Item</span>
            <span>Status</span>
            <span>Validation</span>
            <span className="text-right">Actions</span>
          </div>

          {filteredRows.map((row) => {
            const isOpen = openReport === row.dpp.ID;

            const productId = row.product?.ID || row.dpp.product_ID;
            const variantId = row.variant?.ID || row.dpp.variant_ID;
            const batchId = row.batch?.ID || row.dpp.batch_ID;
            const itemId = row.item?.ID || row.dpp.item_ID;

            return (
              <div key={row.dpp.ID} className="border-t border-black/5">
                <div className="grid grid-cols-[48px_180px_220px_220px_220px_220px_140px_160px_220px] items-center gap-4 px-5 py-3 text-sm">
                    <RequireRole role="company_advanced">
                      <input
                        type="checkbox"
                        checked={selected.includes(row.dpp.ID)}
                        onChange={() => toggleOne(row.dpp.ID)}
                        className="h-4 w-4"
                      />
                    </RequireRole>
                  <div className="min-w-0">
                    <Link
                      to={`/dpps/${row.dpp.ID}`}
                      className="block truncate font-mono text-xs font-medium text-brand hover:underline"
                      title={row.dpp.ID}
                    >
                      {row.dpp.ID}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      v{row.dpp.current_version ?? '—'} · {row.dpp.dpp_type ?? '—'}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{row.product?.name || '—'}</p>
                    {productId ? (
                      <Link
                        to={`/products/${productId}`}
                        className="block truncate font-mono text-xs text-brand hover:underline"
                        title={productId}
                      >
                        {productId}
                      </Link>
                    ) : (
                      <p className="text-xs text-ink-muted">—</p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-ink">{labelVariant(row.variant)}</p>
                    {productId && variantId ? (
                      <Link
                        to={`/products/${productId}/variants/${variantId}/view`}
                        className="block truncate font-mono text-xs text-brand hover:underline"
                        title={variantId}
                      >
                        {variantId}
                      </Link>
                    ) : (
                      <p className="text-xs text-ink-muted">—</p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-ink">{row.batch?.batch_number || '—'}</p>
                    {productId && variantId && batchId ? (
                      <Link
                        to={`/products/${productId}/variants/${variantId}/batches/${batchId}`}
                        className="block truncate font-mono text-xs text-brand hover:underline"
                        title={batchId}
                      >
                        {batchId}
                      </Link>
                    ) : (
                      <p className="text-xs text-ink-muted">—</p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-ink">
                      {row.item?.serial_number || row.item?.upi || '—'}
                    </p>
                    {productId && variantId && batchId && itemId ? (
                      <Link
                        to={`/products/${productId}/variants/${variantId}/batches/${batchId}`}
                        className="block truncate font-mono text-xs text-brand hover:underline"
                        title={itemId}
                      >
                        {itemId}
                      </Link>
                    ) : (
                      <p className="text-xs text-ink-muted">—</p>
                    )}
                  </div>

                  <StatusBadge status={row.dpp.status} />

                  <div>
                    {row.validation.readyToPublish ? (
                      <span className="text-xs font-medium text-green-700">
                        Ready · {row.validation.score}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-red-700">
                        {row.validation.blocking} issue(s) · {row.validation.score}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenReport(isOpen ? null : row.dpp.ID)}
                    >
                      {isOpen ? 'Hide report' : 'Report'}
                    </Button>

                    <RequireRole role="company_advanced">
                      {row.dpp.status !== 'published' && (
                      <Button
                        size="sm"
                        disabled={busy || !row.validation.readyToPublish}
                        className={
                          !row.validation.readyToPublish
                            ? 'cursor-not-allowed bg-gray-300 text-gray-500 opacity-70'
                            : ''
                        }
                        onClick={() => updateDppStatus.mutate({ row, status: 'published' })}
                      >
                        Publish
                      </Button>
                      )}

                      {row.dpp.status !== 'approved' && row.dpp.status !== 'published' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || !row.validation.readyToPublish}
                        className={
                          !row.validation.readyToPublish
                            ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 opacity-70'
                            : ''
                        }
                        onClick={() => updateDppStatus.mutate({ row, status: 'approved' })}
                      >
                        Approve
                      </Button>
                      )}
                    </RequireRole>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-black/5 bg-gray-50/70 px-5 py-4">
                    <ValidationReport
                      checks={row.validation.checks}
                      entities={row}
                      summary={{
                        score: row.validation.score,
                        readyToPublish: row.validation.readyToPublish,
                        mandatoryFailed: row.validation.blocking
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
        )}
      </Card>
    </div>
  );
}
