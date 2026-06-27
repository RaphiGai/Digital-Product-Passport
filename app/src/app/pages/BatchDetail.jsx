import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { odataGet, odataList, odataUpdate, ApiError } from '@/api/client';
import { printLabels } from '@/lib/printLabels';
import { mergeVisibility, BATCH_CATALOGUE, VARIANT_CATALOGUE, PRODUCT_CATALOGUE } from '@/lib/fieldCatalogue';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, StatusBadge } from '@/ui/Badge';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { RequireRole } from '@/auth/RequireRole';
import { DocumentManager } from '@/ui/DocumentManager';

const ITEM_STATUSES = ['active', 'sold', 'repaired', 'archived'];
const DPP_STATUSES = ['draft', 'in_review', 'approved', 'published', 'archived'];

function statusLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
          <option key={s} value={s}>{statusLabel(s)}</option>
        ))}
      </select>
    </label>
  );
}

function InfoRow({ label, value, visibility }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-black/5 py-3 last:border-0">
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        {label}
        {visibility && (
          <Badge tone={visibility === 'public' ? 'green' : 'gray'} className="font-normal">
            {visibility === 'public' ? 'Public' : 'Internal'}
          </Badge>
        )}
      </span>
      <span className="max-w-[60%] text-right text-sm text-ink">{value ?? '—'}</span>
    </div>
  );
}
const SORT_COLUMNS = [
  { key: 'id', label: 'Item ID' },
  { key: 'upi', label: 'UPI' },
  { key: 'serial', label: 'Serial' },
  { key: 'itemStatus', label: 'Item status' },
  { key: 'dppStatus', label: 'DPP status' },
  { key: 'dppId', label: 'DPP ID' }
];

function SortButton({ column, sort, onSort, children }) {
  const active = sort.column === column;
  const icon = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <button
      type="button"
      onClick={() =>
        onSort((old) =>
          old.column === column
            ? { column, dir: old.dir === 'asc' ? 'desc' : 'asc' }
            : { column, dir: 'asc' }
        )
      }
      className="text-left text-xs font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
    >
      {children}{icon}
    </button>
  );
}

function itemSearchText(item, dpp) {
  return [
    item.ID,
    item.upi,
    item.serial_number,
    item.status,
    dpp?.ID,
    dpp?.status,
    dpp?.current_version,
    dpp?.qr_token
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getItemSortValue(item, dpp, column) {
  switch (column) {
    case 'id':
      return item.ID ?? '';
    case 'upi':
      return item.upi ?? '';
    case 'serial':
      return item.serial_number ?? '';
    case 'itemStatus':
      return item.status ?? '';
    case 'dppStatus':
      return dpp?.status ?? '';
    case 'dppId':
      return dpp?.ID ?? '';
    default:
      return '';
  }
}

export function BatchDetail() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState([]);
  const { pid, vid, bid } = useParams();
  const [msg, setMsg] = useState(null);
  const [itemSearch, setItemSearch] = useState('');
  const [itemSort, setItemSort] = useState({ column: 'serial', dir: 'asc' });

  const batchQ = useQuery({
    queryKey: ['Batches', 'one', bid],
    queryFn: () => odataGet('Batches', bid, { expand: ['factory', 'supplier'] })
  });
  const productQ = useQuery({
    queryKey: ['Products', pid],
    queryFn: () => odataGet('Products', pid)
  });
  const variantQ = useQuery({
    queryKey: ['ProductVariants', 'one', vid],
    queryFn: () => odataGet('ProductVariants', vid)
  });
  const itemsQ = useQuery({
    queryKey: ['ProductItems', bid],
    queryFn: () =>
      odataList('ProductItems', { filter: `batch_ID eq '${bid}'`, orderby: 'serial_number', top: 1000 })
  });
  const dppsQ = useQuery({
    queryKey: ['DPPs', 'batch', bid],
    queryFn: () =>
      odataList('DPPs', {
        filter: `batch_ID eq '${bid}'`,
        select: ['ID', 'item_ID', 'status', 'current_version', 'qr_token'],
        top: 1000
      })
  });
  // Owning organization's website — printed on the QR labels.
  const orgQ = useQuery({
    queryKey: ['Organizations', productQ.data?.owning_organization_ID],
    queryFn: () =>
      odataGet('Organizations', productQ.data.owning_organization_ID, { select: ['ID', 'website_url'] }),
    enabled: !!productQ.data?.owning_organization_ID
  });

  const b = batchQ.data;
  const p = productQ.data;
  const v = variantQ.data;
  const items = itemsQ.data ?? [];
  const dpps = dppsQ.data ?? [];
  const dppByItem = Object.fromEntries(dpps.map((d) => [d.item_ID, d]));
  const publishedCount = dpps.filter((d) => d.status === 'published').length;

  const visibleItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();

    return [...items]
      .filter((item) => {
        if (!q) return true;
        return itemSearchText(item, dppByItem[item.ID]).includes(q);
      })
      .sort((a, b) => {
        const av = getItemSortValue(a, dppByItem[a.ID], itemSort.column);
        const bv = getItemSortValue(b, dppByItem[b.ID], itemSort.column);

        const result = String(av).localeCompare(String(bv), undefined, {
          numeric: true,
          sensitivity: 'base'
        });

        return itemSort.dir === 'asc' ? result : -result;
      });
  }, [items, dppByItem, itemSearch, itemSort]);

  const selectedItems = items.filter((i) => selected.includes(i.ID));
  const selectedDpps = selectedItems.map((i) => dppByItem[i.ID]).filter(Boolean);

  const invalidateAll = () => {
  qc.invalidateQueries({ queryKey: ['ProductItems', bid] });
  qc.invalidateQueries({ queryKey: ['DPPs', 'batch', bid] });
};

const updateItemStatus = useMutation({
  mutationFn: async ({ itemIds, status }) => {
    await Promise.all(
      itemIds.map(async (id) => {
        await odataUpdate('ProductItems', id, { status });

        if (status === 'archived' && dppByItem[id]?.ID) {
          await odataUpdate('DPPs', dppByItem[id].ID, {
            status: 'archived',
            visibility: 'internal'
          });
        }
      })
    );
  },
  onSuccess: () => {
    invalidateAll();
    setSelected([]);
    setMsg({ kind: 'success', text: 'Item status updated.' });
  },
  onError: (err) =>
    setMsg({
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
          ...(status === 'published' ? { visibility: 'public' } : {}),
          ...(status === 'archived' ? { visibility: 'internal' } : {})
        })
      )
    );
  },
  onSuccess: () => {
    invalidateAll();
    setSelected([]);
    setMsg({ kind: 'success', text: 'DPP status updated.' });
  },
  onError: (err) =>
    setMsg({
      kind: 'error',
      text: err instanceof ApiError ? err.message : 'Could not update DPP status.'
    })
});

const busy = updateItemStatus.isPending || updateDppStatus.isPending;

const allSelected =
  visibleItems.length > 0 && visibleItems.every((i) => selected.includes(i.ID));

const toggleAll = (on) =>
  setSelected((old) => {
    const visibleIds = visibleItems.map((i) => i.ID);
    return on
      ? [...new Set([...old, ...visibleIds])]
      : old.filter((id) => !visibleIds.includes(id));
  });

const toggleOne = (id, on) =>
  setSelected((old) => (on ? [...new Set([...old, id])] : old.filter((x) => x !== id)));

  // Printable QR labels for every item that already has a QR token (US6.13).
  const printableLabels = items
    .map((it) => {
      const d = dppByItem[it.ID];
      return d?.qr_token
        ? {
            token: d.qr_token,
            name: p?.name,
            brand: p?.brand,
            dpp_id: d.ID,
            product_id: p?.ID,
            batch_number: b?.batch_number,
            serial_number: it.serial_number,
            upi: it.upi,
            website: orgQ.data?.website_url
          }
        : null;
    })
    .filter(Boolean);

  const handlePrintLabels = () => {
    const ok = printLabels(printableLabels, { title: `QR labels — batch ${b?.batch_number ?? bid}` });
    if (!ok) {
      setMsg({
        kind: 'error',
        text: 'Could not open the print window — allow pop-ups for this site, or create/publish item DPPs first.'
      });
    }
  };

  if (batchQ.isLoading || variantQ.isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!b) return <p className="text-ink-muted">Batch not found.</p>;

  const variantLabel = v ? [v.color, v.size].filter(Boolean).join(' / ') || v.sku : 'Variant';
  const batchLabel = b.batch_number ?? b.ID;

  // Effective per-field visibility (saved overrides → catalogue defaults; locked → public).
  const batchVis = mergeVisibility(BATCH_CATALOGUE, b.field_visibility);
  const variantVis = mergeVisibility(VARIANT_CATALOGUE, v?.field_visibility);
  const productVis = mergeVisibility(PRODUCT_CATALOGUE, p?.field_visibility);

return (
  <div className="space-y-6">
    <Breadcrumb
      items={[
        { label: 'Dashboard', to: '/' },
        { label: 'Products', to: '/products' },
        { label: p?.name ?? 'Product', to: `/products/${pid}` },
        { label: variantLabel, to: `/products/${pid}/variants/${vid}/view` },
        { label: batchLabel }
      ]}
    />

    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{batchLabel}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusBadge status={b.status} />
          {b.production_date && (
            <span className="text-sm text-ink-muted">{b.production_date}</span>
          )}
          {[b.factory?.name, b.supplier?.name].filter(Boolean).length > 0 && (
            <span className="text-sm text-ink-muted">
              · {[b.factory?.name, b.supplier?.name].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <Link to={`/products/${pid}/variants/${vid}/batches`}>
          <Button variant="ghost">All batches</Button>
        </Link>

        <RequireRole role="company_advanced">
          <Link to={`/products/${pid}/variants/${vid}/batches/${bid}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
        </RequireRole>
      </div>
    </div>

    {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle>Batch details</CardTitle>
        <div className="mt-2">
          <InfoRow label="Batch ID" value={<span className="font-mono">{b.ID}</span>} visibility="internal" />
          <InfoRow label="Batch number" value={b.batch_number} visibility={batchVis.batch_number} />
          <InfoRow label="Production date" value={b.production_date} visibility={batchVis.production_date} />
          <InfoRow label="Country of origin" value={b.country_of_origin} visibility={batchVis.country_of_origin} />
          <InfoRow label="Production stage" value={b.production_stage} visibility="internal" />
          <InfoRow label="Factory" value={b.factory?.name} visibility="internal" />
          <InfoRow label="Supplier" value={b.supplier?.name} visibility="internal" />
          <InfoRow
            label="CO₂ footprint"
            value={b.co2_footprint_kg != null ? `${b.co2_footprint_kg} kg CO₂/kg` : null}
            visibility={batchVis.co2_footprint_kg}
          />
          {p?.product_type !== 'finished' && (
            <InfoRow
              label="Recycled content"
              value={b.recycled_content_pct != null ? `${b.recycled_content_pct}%` : null}
              visibility={batchVis.recycled_content_pct}
            />
          )}
          <InfoRow label="Status" value={<StatusBadge status={b.status} />} visibility="internal" />
        </div>
      </Card>

      <Card>
        <CardTitle>Variant &amp; Product</CardTitle>
        <div className="mt-2">
          <InfoRow label="Product ID" value={<span className="font-mono">{p?.ID}</span>} visibility="internal" />
          <InfoRow label="Variant ID" value={<span className="font-mono">{v?.ID}</span>} visibility="internal" />
          <InfoRow label="Colour" value={v?.color} visibility={variantVis.color} />
          <InfoRow label="Size" value={v?.size} visibility={variantVis.size} />
          <InfoRow label="SKU" value={v?.sku} visibility={variantVis.sku} />
          <InfoRow label="GTIN" value={v?.gtin} visibility={variantVis.gtin} />
          <InfoRow label="Weight" value={v?.weight_g != null ? `${v.weight_g} g` : null} visibility="internal" />
          <InfoRow label="Brand" value={p?.brand} visibility={productVis.brand} />
          <InfoRow label="Category" value={p?.category} visibility={productVis.category} />
          <InfoRow label="Care instructions" value={p?.care_instructions} visibility={productVis.care_instructions} />
          <InfoRow label="Country of origin (product)" value={p?.country_of_origin} visibility={productVis.country_of_origin} />
        </div>
      </Card>
    </div>

    <DocumentManager scope="batch" ownerId={bid} readOnly />

    <Card className="p-0">
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <CardTitle>Items</CardTitle>

          <div className="px-5 pb-3">
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search items by ID, UPI, serial, status, DPP…"
              className="h-9 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            {itemsQ.isLoading ? '…' : `${items.length} item${items.length !== 1 ? 's' : ''}`}
            {dpps.length > 0 &&
              ` · ${publishedCount} of ${dpps.length} DPP${dpps.length !== 1 ? 's' : ''} published`}
          </p>
        </div>

        {printableLabels.length > 0 && (
          <Button variant="outline" size="sm" onClick={handlePrintLabels}>
            <Printer className="h-4 w-4" /> Print all labels ({printableLabels.length})
          </Button>
        )}
      </div>

      <RequireRole role="company_advanced">
        {visibleItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-b border-black/5 px-5 py-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => toggleAll(e.target.checked)}
              />
              Select all
            </label>

            <span className="text-xs text-ink-muted">{selected.length} selected</span>

            <SelectStatus
              label="Item status"
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
              label="DPP status"
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

            <Button
              size="sm"
              variant="ghost"
              disabled={selected.length === 0 || busy}
              onClick={() => setSelected([])}
            >
              Clear
            </Button>
          </div>
        )}
      </RequireRole>

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-[auto_2fr_1fr_1fr_auto] gap-4 border-b border-black/5 px-5 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            <RequireRole role="company_advanced">
              <span />
            </RequireRole>
            <SortButton column="id" sort={itemSort} onSort={setItemSort}>Item</SortButton>
            <SortButton column="itemStatus" sort={itemSort} onSort={setItemSort}>Status</SortButton>
            <SortButton column="dppStatus" sort={itemSort} onSort={setItemSort}>DPP</SortButton>
            <span />
          </div>

          {visibleItems.map((item) => {
            const dpp = dppByItem[item.ID];

            return (
              <div
                key={item.ID}
                className="grid grid-cols-[auto_2fr_1fr_1fr_auto] items-center gap-4 border-b border-black/5 px-5 py-2.5 last:border-0"
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
                  <span className="font-mono text-xs text-ink">{item.ID}</span>
                  {(item.upi || item.serial_number) && (
                    <span className="ml-2 text-xs text-ink-muted">
                      · {[item.upi, item.serial_number].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>

                <StatusBadge status={item.status} />

                <span className="text-xs">
                  {dpp ? <StatusBadge status={dpp.status} /> : <span className="text-ink-muted">No DPP</span>}
                </span>

                <div>
                  {dpp ? (
                    <Link to={`/dpps/${dpp.ID}`}>
                      <Button variant="outline" size="sm">Open DPP</Button>
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-muted italic">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {!itemsQ.isLoading && items.length > 0 && visibleItems.length === 0 && (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-ink-muted">No items match your search.</p>
        </div>
      )}

      {!itemsQ.isLoading && items.length === 0 && (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-ink-muted">No items yet.</p>
          <Link to={`/products/${pid}/variants/${vid}/batches`} className="mt-2 inline-block">
            <Button variant="outline" size="sm">Go to batch management</Button>
          </Link>
        </div>
      )}
    </Card>
  </div>
);
}
