import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { odataGet, odataList, odataUpdate, ApiError } from '@/api/client';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { StatusBadge } from '@/ui/Badge';
import { RequireRole } from '@/auth/RequireRole';

const ITEM_STATUSES = ['active', 'sold', 'repaired', 'archived'];

const DPP_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'published',
  'archived'
];

const isExternalLine = (b) => !!b.external_dpp_url || !b.component_ID;

function statusLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function variantLabel(v) {
  if (!v) return '';
  return [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID;
}

function SelectStatus({ value, options, disabled, onChange, label }) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink-muted">
      <span className="sr-only">{label}</span>
      <select
        value={value || ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-black/15 bg-white px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">Change status…</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>
    </label>
  );
}

function useVariantComponents(vid) {
  const bomsQ = useQuery({
    queryKey: ['ProductBOMs', 'variant', vid],
    queryFn: () =>
      odataList('ProductBOMs', {
        filter: `parent_ID eq '${vid}'`,
        top: 500
      }),
    enabled: !!vid
  });

  const productsQ = useQuery({
    queryKey: ['Products', 'component-names'],
    queryFn: () =>
      odataList('Products', {
        select: ['ID', 'name'],
        top: 500
      })
  });

  const boms = bomsQ.data ?? [];

  return {
    boms,
    loading: bomsQ.isLoading,
    nameOf: (id) => productsQ.data?.find((p) => p.ID === id)?.name ?? id
  };
}

function BatchComponentsReadOnly({ batch, vid }) {
  const { boms, loading, nameOf } = useVariantComponents(vid);

  const batchComponentsQ = useQuery({
    queryKey: ['BatchComponents', batch.ID],
    queryFn: () =>
      odataList('BatchComponents', {
        filter: `batch_ID eq '${batch.ID}'`,
        expand: ['component_batch'],
        top: 500
      }),
    enabled: !!batch.ID
  });

  const byBom = useMemo(() => {
    const map = {};
    for (const row of batchComponentsQ.data ?? []) {
      (map[row.bom_ID] ??= []).push(row);
    }
    return map;
  }, [batchComponentsQ.data]);

  if (loading || batchComponentsQ.isLoading) {
    return (
      <p className="border-t border-black/5 bg-gray-50/60 px-5 py-4 text-sm text-ink-muted">
        Loading components…
      </p>
    );
  }

  if (!boms.length) {
    return (
      <p className="border-t border-black/5 bg-gray-50/60 px-5 py-4 text-sm text-ink-muted">
        This variant has no bill of materials.
      </p>
    );
  }

  return (
    <div className="border-t border-black/5 bg-gray-50/60 px-5 py-4">
      <p className="mb-3 text-xs text-ink-muted">
        Components are shown in view-only mode. Editing is done in the BOM/variant
        area, not in the batch view.
      </p>

      <div className="overflow-hidden rounded-lg border border-black/5 bg-white">
        <div className="grid grid-cols-[1.2fr_1fr_0.7fr_0.7fr_1.2fr] gap-4 border-b border-black/5 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
          <span>Component</span>
          <span>Role</span>
          <span>Quantity</span>
          <span>Source</span>
          <span>Consumed batch / supplier batch</span>
        </div>

        {boms.map((b) => {
          const external = isExternalLine(b);
          const rows = byBom[b.ID] ?? [];
          const label =
            (b.component_ID ? nameOf(b.component_ID) : b.component_name) || '—';

          const consumed =
            rows
              .map((r) =>
                r.component_batch?.batch_number ||
                r.component_batch_ID ||
                r.external_batch_number
              )
              .filter(Boolean)
              .join(', ') || '—';

          return (
            <div
              key={b.ID}
              className="grid grid-cols-[1.2fr_1fr_0.7fr_0.7fr_1.2fr] gap-4 border-b border-black/5 px-4 py-2.5 text-sm last:border-0"
            >
              <div>
                <p className="font-medium text-ink">{label}</p>
                <p className="font-mono text-[11px] text-ink-muted">{b.ID}</p>
              </div>

              <span className="text-ink-muted">{b.component_role || '—'}</span>

              <span className="text-ink-muted">
                {b.quantity ?? '—'} {b.unit ?? ''}
              </span>

              <span className="text-ink-muted">
                {external ? 'External' : 'Internal'}
              </span>

              <span className="text-ink-muted">{consumed}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BatchRow({ batch, pid, vid, onMsg }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [compExpanded, setCompExpanded] = useState(false);
  const [selected, setSelected] = useState([]);

  const itemsQ = useQuery({
    queryKey: ['ProductItems', batch.ID],
    queryFn: () =>
      odataList('ProductItems', {
        filter: `batch_ID eq '${batch.ID}'`,
        orderby: 'serial_number',
        top: 1000
      }),
    enabled: !!batch.ID
  });

  const items = itemsQ.data ?? [];

  const dppsQ = useQuery({
    queryKey: ['DPPs', 'batch', batch.ID],
    queryFn: () =>
      odataList('DPPs', {
        filter: `batch_ID eq '${batch.ID}'`,
        select: ['ID', 'item_ID', 'status', 'visibility'],
        top: 1000
      }),
    enabled: !!batch.ID
  });

  const dpps = dppsQ.data ?? [];
  const dppByItem = useMemo(
    () => Object.fromEntries(dpps.map((d) => [d.item_ID, d])),
    [dpps]
  );

  const selectedItems = items.filter((i) => selected.includes(i.ID));
  const selectedDpps = selectedItems.map((i) => dppByItem[i.ID]).filter(Boolean);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['ProductItems', batch.ID] });
    qc.invalidateQueries({ queryKey: ['DPPs', 'batch', batch.ID] });
  };

  const updateItemStatus = useMutation({
    mutationFn: async ({ itemIds, status }) => {
      await Promise.all(itemIds.map((id) => odataUpdate('ProductItems', id, { status })));
    },
    onSuccess: () => {
      invalidateAll();
      setSelected([]);
      onMsg({ kind: 'success', text: 'Item status updated.' });
    },
    onError: (err) =>
      onMsg({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Could not update item status.'
      })
  });

  const updateDppStatus = useMutation({
    mutationFn: async ({ dppIds, status }) => {
      await Promise.all(
        dppIds.map((id) =>
          odataUpdate('DPPs', id, {
            status,
            ...(status === 'published' ? { visibility: 'public' } : {})
          })
        )
      );
    },
    onSuccess: () => {
      invalidateAll();
      setSelected([]);
      onMsg({ kind: 'success', text: 'DPP status updated.' });
    },
    onError: (err) =>
      onMsg({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Could not update DPP status.'
      })
  });

  const busy = updateItemStatus.isPending || updateDppStatus.isPending;

  const allSelected = items.length > 0 && selected.length === items.length;

  const toggleAll = (on) => {
    setSelected(on ? items.map((i) => i.ID) : []);
  };

  const toggleOne = (id, on) => {
    setSelected((old) =>
      on ? [...new Set([...old, id])] : old.filter((x) => x !== id)
    );
  };

  return (
    <div className="border-b border-black/5 last:border-0">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/products/${pid}/variants/${vid}/batches/${batch.ID}`}
              className="font-medium text-brand-700 hover:underline"
            >
              {batch.batch_number ?? batch.ID}
            </Link>

            <StatusBadge status={batch.status} />
          </div>

          <div className="mt-0.5 text-xs text-ink-muted">
            {[batch.production_date, batch.factory?.name, batch.supplier?.name]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-ink-muted">
            <span className="font-medium text-ink">
              {itemsQ.isLoading ? '…' : items.length}
            </span>{' '}
            items
          </span>

          <span className="text-ink-muted">
            <span className="font-medium text-ink">
              {dppsQ.isLoading ? '…' : dpps.length}
            </span>{' '}
            DPPs
          </span>
        </div>

        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded((o) => !o)}>
            {expanded ? 'Hide items' : 'View items'}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCompExpanded((o) => !o)}
        >
          {compExpanded ? 'Hide components' : 'Components'}
        </Button>
      </div>

      {expanded && items.length > 0 && (
        <div className="border-t border-black/5 bg-gray-50/60">
          <RequireRole role="company_advanced">
            <div className="flex flex-wrap items-center gap-3 border-b border-black/5 px-5 py-3">
              <span className="text-xs font-medium text-ink-muted">
                {selected.length} selected
              </span>

              <SelectStatus
                label="Bulk item status"
                value=""
                options={ITEM_STATUSES}
                disabled={busy || selected.length === 0}
                onChange={(status) =>
                  updateItemStatus.mutate({
                    itemIds: selected,
                    status
                  })
                }
              />

              <SelectStatus
                label="Bulk DPP status"
                value=""
                options={DPP_STATUSES}
                disabled={busy || selectedDpps.length === 0}
                onChange={(status) =>
                  updateDppStatus.mutate({
                    dppIds: selectedDpps.map((d) => d.ID),
                    status
                  })
                }
              />

              {selected.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setSelected([])}
                >
                  Clear selection
                </Button>
              )}
            </div>
          </RequireRole>

          <div className="grid grid-cols-[auto_1.5fr_1fr_1fr_1.2fr_auto] gap-4 px-5 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            <RequireRole role="company_advanced">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleAll(e.target.checked)}
                aria-label="Select all items"
              />
            </RequireRole>
            <span>Item</span>
            <span>Item status</span>
            <span>DPP status</span>
            <span />
          </div>

          {items.map((item) => {
            const dpp = dppByItem[item.ID];

            return (
              <div
                key={item.ID}
                className="grid grid-cols-[auto_1.5fr_1fr_1fr_1.2fr_auto] items-center gap-4 border-t border-black/5 px-5 py-2.5"
              >
                <RequireRole role="company_advanced">
                  <input
                    type="checkbox"
                    checked={selected.includes(item.ID)}
                    onChange={(e) => toggleOne(item.ID, e.target.checked)}
                    aria-label={`Select ${item.serial_number || item.ID}`}
                  />
                </RequireRole>

                <div>
                  <p className="font-mono text-xs text-ink">
                    {item.serial_number || item.ID}
                  </p>
                  <p className="font-mono text-[11px] text-ink-muted">{item.ID}</p>
                </div>

                <StatusBadge status={item.status} />

                <span>{dpp ? <StatusBadge status={dpp.status} /> : '—'}</span>

                

                <div>
                  {dpp ? (
                    <Link to={`/dpps/${dpp.ID}`}>
                      <Button variant="outline" size="sm">
                        Open DPP
                      </Button>
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-muted">No DPP</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {compExpanded && <BatchComponentsReadOnly batch={batch} vid={vid} />}
    </div>
  );
}

export function BatchView() {
  const { pid, vid } = useParams();
  const [msg, setMsg] = useState(null);

  const variantQ = useQuery({
    queryKey: ['ProductVariants', 'one', vid],
    queryFn: () => odataGet('ProductVariants', vid),
    enabled: !!vid
  });

  const productQ = useQuery({
    queryKey: ['Products', pid, 'name'],
    queryFn: () =>
      odataGet('Products', pid, {
        select: ['ID', 'name', 'product_type']
      }),
    enabled: !!pid
  });

  const batchesQ = useQuery({
    queryKey: ['Batches', vid],
    queryFn: () =>
      odataList('Batches', {
        filter: `variant_ID eq '${vid}'`,
        expand: ['factory', 'supplier'],
        orderby: 'batch_number',
        top: 200
      }),
    enabled: !!vid
  });

  const label = variantLabel(variantQ.data);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Products', to: '/products' },
          {
            label: productQ.data?.name ?? 'Product',
            to: `/products/${pid}`
          },
          {
            label: label || 'Variant',
            to: `/products/${pid}/variants/${vid}`
          },
          { label: 'Batches' }
        ]}
      />

      <div>
        <h1 className="text-2xl font-semibold text-ink">Batches — {label}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          View batch components and manage item/DPP statuses. Components are
          read-only here.
        </p>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Card className="p-0">
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div>
            <CardTitle>Production batches</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              Batch View is for operational status control. Validation and
              publication readiness belong to the Validation page.
            </p>
          </div>

          <RequireRole role="company_advanced">
            <Link to={`/products/${pid}/variants/${vid}/batches/new`}>
              <Button size="sm">Add Batch</Button>
            </Link>
          </RequireRole>
        </div>

        {batchesQ.isLoading && (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">
            Loading…
          </p>
        )}

        {!batchesQ.isLoading && (batchesQ.data ?? []).length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">
            No batches yet.
          </p>
        )}

        {(batchesQ.data ?? []).map((b) => (
          <BatchRow
            key={b.ID}
            batch={b}
            pid={pid}
            vid={vid}
            onMsg={setMsg}
          />
        ))}
      </Card>
    </div>
  );
}