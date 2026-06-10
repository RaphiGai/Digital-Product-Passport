import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { odataGet, odataList } from '@/api/client';
import { useAction } from '@/api/hooks';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, StatusBadge } from '@/ui/Badge';
import { Breadcrumb } from '@/ui/Breadcrumb';
import { RequireRole } from '@/auth/RequireRole';

// ── Helpers ──────────────────────────────────────────────────────────────────

function Row({ label, value, visibility }) {
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
      <span className="max-w-[60%] text-right text-sm text-ink">{value || '—'}</span>
    </div>
  );
}

// ── Item row (leaf level) ─────────────────────────────────────────────────────

function ItemRow({ item, dpp }) {
  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-4 border-b border-black/5 px-4 py-2.5 last:border-0 bg-white/40">
      <div>
        <span className="text-xs font-mono text-ink">{item.upi || item.serial_number || item.ID}</span>
        {item.serial_number && item.upi && (
          <span className="ml-2 text-xs text-ink-muted">· {item.serial_number}</span>
        )}
      </div>
      <StatusBadge status={item.status} />
      <span className="text-xs text-ink-muted">
        {dpp ? `DPP v${dpp.current_version ?? 1}` : 'No DPP'}
      </span>
      <div className="flex gap-1.5">
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
}

// ── Batch row (with collapsible items) ───────────────────────────────────────

function BatchRow({ batch, pid, vid }) {
  const [open, setOpen] = useState(false);

  const itemsQ = useQuery({
    queryKey: ['ProductItems', batch.ID],
    queryFn: () => odataList('ProductItems', {
      filter: `batch_ID eq '${batch.ID}'`,
      orderby: 'serial_number',
      top: 1000
    }),
    enabled: open
  });

  const dppsQ = useQuery({
    queryKey: ['DPPs', 'batch', batch.ID],
    queryFn: () => odataList('DPPs', {
      filter: `batch_ID eq '${batch.ID}'`,
      select: ['ID', 'item_ID', 'status', 'current_version'],
      top: 1000
    }),
    enabled: open
  });

  // Count items without opening the accordion (lightweight count query)
  const itemCountQ = useQuery({
    queryKey: ['ProductItems', 'count', batch.ID],
    queryFn: () => odataList('ProductItems', {
      filter: `batch_ID eq '${batch.ID}'`,
      select: ['ID'],
      top: 1000
    })
  });
  const itemCount = itemCountQ.data?.length ?? 0;

  const dppByItem = {};
  (dppsQ.data ?? []).forEach((d) => {
    if (d.item_ID) dppByItem[d.item_ID] = d;
  });

  const items = itemsQ.data ?? [];

  return (
    <div className="border-b border-black/5 last:border-0">
      {/* Batch header row */}
      <div className="grid grid-cols-[auto_2fr_1fr_1fr_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-black/[0.02]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-ink-muted hover:text-ink"
          aria-label={open ? 'Collapse items' : 'Expand items'}
        >
          {open
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <Link
          to={`/products/${pid}/variants/${vid}/batches/${batch.ID}`}
          className="min-w-0 hover:text-brand-700"
        >
          <span className="text-sm font-medium text-ink hover:text-brand-700">
            {batch.batch_number ?? batch.ID}
          </span>
          <div className="text-xs text-ink-muted">
            {[batch.production_date, batch.factory?.name].filter(Boolean).join(' · ')}
          </div>
        </Link>

        <StatusBadge status={batch.status} />

        <span className="text-xs text-ink-muted">
          {itemCountQ.isLoading ? '…' : `${itemCount} item${itemCount !== 1 ? 's' : ''}`}
        </span>

        <span className="text-xs text-ink-muted">
          {batch.co2_footprint_kg != null ? `${batch.co2_footprint_kg} kg CO₂` : '—'}
        </span>

        <RequireRole role="company_advanced">
          <Link to={`/products/${pid}/variants/${vid}/batches/${batch.ID}/edit`}>
            <Button variant="ghost" size="sm">Edit</Button>
          </Link>
        </RequireRole>
      </div>

      {/* Collapsible items list */}
      {open && (
        <div className="border-t border-black/5 bg-gray-50/60">
          {/* Items column headers */}
          <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            <span>UPI / Serial</span>
            <span>Status</span>
            <span>DPP</span>
            <span />
          </div>

          {itemsQ.isLoading && (
            <p className="px-4 py-3 text-xs text-ink-muted">Loading items…</p>
          )}

          {!itemsQ.isLoading && items.length === 0 && (
            <p className="px-4 py-3 text-xs text-ink-muted">
              No items yet —{' '}
              <Link to={`/products/${pid}/variants/${vid}/batches`} className="text-brand-700 hover:underline">
                add items from the batch page
              </Link>
            </p>
          )}

          {/* Show first 20 items inline, link to full list beyond that */}
          {items.slice(0, 20).map((item) => (
            <ItemRow key={item.ID} item={item} dpp={dppByItem[item.ID] ?? null} />
          ))}

          {items.length > 20 && (
            <div className="px-4 py-2.5 text-xs text-ink-muted">
              + {items.length - 20} more items ·{' '}
              <Link to={`/products/${pid}/variants/${vid}/batches`} className="text-brand-700 hover:underline">
                view all on batch page
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Variant row (with collapsible batches) ────────────────────────────────────

function VariantRow({ variant, pid }) {
  const [open, setOpen] = useState(false);

  const batchesQ = useQuery({
    queryKey: ['Batches', variant.ID],
    queryFn: () => odataList('Batches', {
      filter: `variant_ID eq '${variant.ID}'`,
      expand: ['factory'],
      orderby: 'batch_number',
      top: 100
    }),
    enabled: open
  });

  // Lightweight batch count (always fetched for the summary)
  const batchCountQ = useQuery({
    queryKey: ['Batches', 'count', variant.ID],
    queryFn: () => odataList('Batches', {
      filter: `variant_ID eq '${variant.ID}'`,
      select: ['ID'],
      top: 100
    })
  });
  const batchCount = batchCountQ.data?.length ?? 0;

  const batches = batchesQ.data ?? [];
  const label = [variant.color, variant.size].filter(Boolean).join(' / ') || variant.sku || variant.ID;

  return (
    <div className="border-b border-black/5 last:border-0">
      {/* Variant header row */}
      <div className="grid grid-cols-[auto_2fr_1fr_1fr_1fr_auto] items-center gap-3 px-5 py-3.5 hover:bg-black/[0.02]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-ink-muted hover:text-ink"
          aria-label={open ? 'Collapse batches' : 'Expand batches'}
        >
          {open
            ? <ChevronDown className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />}
        </button>

        <Link to={`/products/${pid}/variants/${variant.ID}/view`} className="min-w-0 hover:text-brand-700">
          <span className="font-medium text-ink hover:text-brand-700">{label}</span>
          <div className="text-xs text-ink-muted">{variant.sku}</div>
        </Link>

        <StatusBadge status={variant.status} />

        <span className="text-xs text-ink-muted">
          {batchCountQ.isLoading ? '…' : `${batchCount} batch${batchCount !== 1 ? 'es' : ''}`}
        </span>

        <span className="text-xs text-ink-muted">
          {variant.gtin ?? '—'}
        </span>

        <RequireRole role="company_advanced">
          <div className="flex gap-1.5">
            <Link to={`/products/${pid}/variants/${variant.ID}`}>
              <Button variant="outline" size="sm">Edit</Button>
            </Link>
            <Link to={`/products/${pid}/variants/${variant.ID}/batches`}>
              <Button variant="ghost" size="sm">Batches</Button>
            </Link>
          </div>
        </RequireRole>
      </div>

      {/* Collapsible batches */}
      {open && (
        <div className="border-t border-black/5 bg-gray-50/40 pl-8">
          {/* Batch column headers */}
          <div className="grid grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            <span />
            <span>Batch</span>
            <span>Status</span>
            <span>Items</span>
            <span>CO₂</span>
            <span />
          </div>

          {batchesQ.isLoading && (
            <p className="px-4 py-3 text-sm text-ink-muted">Loading batches…</p>
          )}

          {!batchesQ.isLoading && batches.length === 0 && (
            <div className="px-4 py-3 text-sm text-ink-muted">
              No batches yet —{' '}
              <Link
                to={`/products/${pid}/variants/${variant.ID}/batches`}
                className="text-brand-700 hover:underline"
              >
                add a batch
              </Link>
            </div>
          )}

          {batches.map((batch) => (
            <BatchRow key={batch.ID} batch={batch} pid={pid} vid={variant.ID} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ProductDetail ────────────────────────────────────────────────────────

export function ProductDetail() {
  const { id } = useParams();

  const { data: p, isLoading } = useQuery({
    queryKey: ['Products', id],
    queryFn: () => odataGet('Products', id, { expand: ['variants'] })
  });

  const archive = useAction('Products', { invalidate: [['Products', id], ['Products']] });

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!p) return <p className="text-ink-muted">Product not found.</p>;

  const variants = p.variants ?? [];

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Products', to: '/products' },
          { label: p.name }
        ]}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{p.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            <StatusBadge status={p.espr_compliance} />
            <span className="text-sm text-ink-muted">
              {[p.brand, p.category, p.model].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
        <RequireRole role="company_advanced">
          <div className="flex gap-2">
            <Link to={`/products/${id}/edit`}>
              <Button variant="outline">Edit</Button>
            </Link>
            <Button
              variant="danger"
              disabled={p.status === 'archived' || archive.isPending}
              onClick={() => archive.mutate({ key: id, action: 'archiveProduct' })}
            >
              {p.status === 'archived' ? 'Archived' : 'Archive'}
            </Button>
          </div>
        </RequireRole>
      </div>

      {/* Product info cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Basic information</CardTitle>
          <div className="mt-2">
            <Row label="Type" value={p.product_type} visibility="internal" />
            <Row label="Brand" value={p.brand} visibility="public" />
            <Row label="Category" value={p.category} visibility="public" />
            <Row label="GTIN" value={p.gtin} visibility="internal" />
            <Row label="Description" value={p.description} visibility="public" />
          </div>
        </Card>

        <Card>
          <CardTitle>Material, care &amp; compliance</CardTitle>
          <div className="mt-2">
            <Row label="Fibre composition" value={p.fibre_composition} visibility="public" />
            <Row label="Substances of concern" value={p.substances_of_concern} visibility="public" />
            <Row label="Country of origin" value={p.country_of_origin} visibility="public" />
            <Row label="Care instructions" value={p.care_instructions} visibility="public" />
            <Row label="Repair instructions" value={p.repair_instructions} visibility="public" />
            <Row label="Disposal instructions" value={p.disposal_instructions} visibility="public" />
            <Row label="ESPR compliance" value={<StatusBadge status={p.espr_compliance} />} visibility="public" />
          </div>
        </Card>
      </div>

      {/* Product hierarchy explorer */}
      <Card className="p-0">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <CardTitle>Product hierarchy</CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              {variants.length} variant{variants.length !== 1 ? 's' : ''} · expand to see batches and items
            </p>
          </div>
          <RequireRole role="company_advanced">
            <Link to={`/products/${id}/variants/new`}>
              <Button variant="outline" size="sm">+ Add variant</Button>
            </Link>
          </RequireRole>
        </div>

        {/* Variant column headers */}
        {variants.length > 0 && (
          <div className="grid grid-cols-[auto_2fr_1fr_1fr_1fr_auto] gap-3 border-t border-b border-black/5 px-5 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            <span />
            <span>Variant</span>
            <span>Status</span>
            <span>Batches</span>
            <span>GTIN</span>
            <span />
          </div>
        )}

        {variants.length === 0 && (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-ink-muted">No variants yet.</p>
            <Link to={`/products/${id}/variants/new`} className="mt-2 inline-block">
              <Button variant="outline" size="sm">Add first variant</Button>
            </Link>
          </div>
        )}

        {variants.map((v) => (
          <VariantRow key={v.ID} variant={v} pid={id} />
        ))}
      </Card>
    </div>
  );
}
