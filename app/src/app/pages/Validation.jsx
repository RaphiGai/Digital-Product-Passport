import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { odataList, odataUpdate, ApiError } from '@/api/client';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { StatusBadge } from '@/ui/Badge';
import { PageHeader } from './ComingSoon';
import {
  validateDppContext,
  groupChecksBySection
} from '@/lib/ValidationRules';

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

function ValidationReport({ row }) {
  const grouped = groupChecksBySection(row.validation.checks);

  return (
    <div className="border-t border-black/5 bg-gray-50/70 px-5 py-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-ink">Validation report</span>

        <span className="text-xs text-ink-muted">
          {row.validation.score} checks passed
        </span>

        {row.validation.readyToPublish ? (
          <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
            Ready to publish
          </span>
        ) : (
          <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
            {row.validation.mandatoryFailed.length} mandatory issue(s)
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(grouped).map(([section, checks]) => (
          <div key={section} className="rounded-lg border border-black/5 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-ink">{section}</h3>

            <div className="space-y-2">
              {checks.map((c) => (
                <div key={c.key} className="flex items-start gap-2 text-sm">
                  <span
                    className={
                      c.passed
                        ? 'text-green-600'
                        : c.mandatory
                          ? 'text-red-600'
                          : 'text-amber-600'
                    }
                  >
                    {c.passed ? '✓' : c.mandatory ? '✕' : '!'}
                  </span>

                  <div>
                    <p className="text-ink">
                      {c.label}
                      {c.mandatory && (
                        <span className="ml-1 text-xs text-red-600">
                          mandatory
                        </span>
                      )}
                    </p>

                    {!c.passed && c.fixHint && (
                      <p className="text-xs text-ink-muted">{c.fixHint}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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

  const dppsQ = useQuery({
    queryKey: ['Validation', 'DPPs'],
    queryFn: () =>
      odataList('DPPs', {
        expand: ['product', 'variant', 'batch', 'item'],
        orderby: 'createdAt desc',
        top: 1000
      })
  });

  const bomsQ = useQuery({
    queryKey: ['Validation', 'ProductBOMs'],
    queryFn: () => odataList('ProductBOMs', { top: 2000 })
  });

  const batchComponentsQ = useQuery({
    queryKey: ['Validation', 'BatchComponents'],
    queryFn: () => odataList('BatchComponents', { top: 2000 })
  });

  const rows = useMemo(() => {
    const dpps = dppsQ.data ?? [];
    const boms = bomsQ.data ?? [];
    const batchComponents = batchComponentsQ.data ?? [];

    return dpps.map((dpp) => {
      const product = dpp.product;
      const variant = dpp.variant || dpp.batch?.variant;
      const batch = dpp.batch;
      const item = dpp.item;

      const bomForVariant = boms.filter(
        (b) => b.parent_ID === variant?.ID || b.variant_ID === variant?.ID
      );

      const batchComponentsForBatch = batchComponents.filter(
        (bc) => bc.batch_ID === batch?.ID
      );

      const validation = validateDppContext({
        product,
        variant,
        batch,
        item,
        dpp,
        bom: bomForVariant,
        batchComponents: batchComponentsForBatch
      });

      return { dpp, product, variant, batch, item, validation };
    });
  }, [dppsQ.data, bomsQ.data, batchComponentsQ.data]);

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
        r.dpp.type,
        r.dpp.version,
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

  const updateDppStatus = useMutation({
    mutationFn: async ({ row, status }) => {
      if (status === 'published' && !row.validation.readyToPublish) {
        throw new Error(
          'This DPP cannot be published because mandatory validation checks failed.'
        );
      }

      return odataUpdate('DPPs', row.dpp.ID, {
        status,
        ...(status === 'published' ? { visibility: 'public' } : {})
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['Validation', 'DPPs'] });
      setMsg({ kind: 'success', text: 'DPP status updated.' });
    },
    onError: (err) =>
      setMsg({
        kind: 'error',
        text:
          err instanceof ApiError || err instanceof Error
            ? err.message
            : 'Could not update DPP status.'
      })
  });

  const loading =
    dppsQ.isLoading || bomsQ.isLoading || batchComponentsQ.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Validation"
        subtitle="Check whether Digital Product Passports are complete and ready for publication."
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

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

        {!loading && filteredRows.length > 0 && (
          <div className="overflow-x-auto">
            <div className="min-w-[1150px]">
              <div className="grid grid-cols-[1.4fr_1.4fr_1.2fr_1.2fr_1.2fr_1fr_1.2fr_1.7fr] gap-4 border-t border-black/5 bg-gray-50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
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

                return (
                  <div key={row.dpp.ID} className="border-t border-black/5">
                    <div className="grid grid-cols-[1.4fr_1.4fr_1.2fr_1.2fr_1.2fr_1fr_1.2fr_1.7fr] items-center gap-4 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <Link
                          to={`/dpps/${row.dpp.ID}`}
                          className="font-mono text-xs font-medium text-brand hover:underline"
                        >
                          {row.dpp.ID}
                        </Link>
                        <p className="text-xs text-ink-muted">
                          v{row.dpp.version ?? '—'} · {row.dpp.type ?? '—'}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {row.product?.name || '—'}
                        </p>
                        <p className="truncate font-mono text-xs text-ink-muted">
                          {row.product?.ID || row.dpp.product_ID || '—'}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-ink">{labelVariant(row.variant)}</p>
                        <p className="truncate font-mono text-xs text-ink-muted">
                          {row.variant?.ID || row.dpp.variant_ID || '—'}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-ink">
                          {row.batch?.batch_number || '—'}
                        </p>
                        <p className="truncate font-mono text-xs text-ink-muted">
                          {row.batch?.ID || row.dpp.batch_ID || '—'}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-ink">
                          {row.item?.serial_number || row.item?.upi || '—'}
                        </p>
                        <p className="truncate font-mono text-xs text-ink-muted">
                          {row.item?.ID || row.dpp.item_ID || '—'}
                        </p>
                      </div>

                      <StatusBadge status={row.dpp.status} />

                      <div>
                        {row.validation.readyToPublish ? (
                          <span className="text-xs font-medium text-green-700">
                            Ready · {row.validation.score}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-red-700">
                            {row.validation.mandatoryFailed.length} issue(s) ·{' '}
                            {row.validation.score}
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

                        {row.dpp.status !== 'published' && (
                          <Button
                            size="sm"
                            disabled={
                              updateDppStatus.isPending ||
                              !row.validation.readyToPublish
                            }
                            onClick={() =>
                              updateDppStatus.mutate({
                                row,
                                status: 'published'
                              })
                            }
                          >
                            Publish
                          </Button>
                        )}

                        {row.dpp.status !== 'approved' &&
                          row.dpp.status !== 'published' && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={updateDppStatus.isPending}
                              onClick={() =>
                                updateDppStatus.mutate({
                                  row,
                                  status: 'approved'
                                })
                              }
                            >
                              Approve
                            </Button>
                          )}
                      </div>
                    </div>

                    {isOpen && <ValidationReport row={row} />}
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