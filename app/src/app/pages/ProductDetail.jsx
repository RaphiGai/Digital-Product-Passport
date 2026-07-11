import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { odataGet, odataList } from '@/api/client';
import { useAction } from '@/api/hooks';
import { mergeVisibility, PRODUCT_CATALOGUE } from '@/lib/fieldCatalogue';
import { parseCustomFields } from '@/lib/customFields';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, StatusBadge } from '@/ui/Badge';
import { Breadcrumb } from '@/ui/Breadcrumb';
import { RequireRole } from '@/auth/RequireRole';
import { DocumentManager } from '@/ui/DocumentManager';
import { ExportDropdown } from '@/ui/ExportDropdown';
import { exportData } from '@/lib/exportExcel';

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
        <span className="text-xs font-mono text-ink">{item.ID}</span>
        {(item.upi || item.serial_number) && (
          <span className="ml-2 text-xs text-ink-muted">
            · {[item.upi, item.serial_number].filter(Boolean).join(' · ')}
          </span>
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
            <span className="font-mono">{batch.ID}</span>
            {[batch.production_date, batch.factory?.name].filter(Boolean).length > 0 && (
              <span>
                {' · '}
                {[batch.production_date, batch.factory?.name].filter(Boolean).join(' · ')}
              </span>
            )}
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
          <div className="text-xs text-ink-muted">
            <span className="font-mono">{variant.ID}</span>
            {variant.sku && <span> · {variant.sku}</span>}
          </div>
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
    queryFn: () => odataGet('Products', id, { expand: ['variants', 'category'] })
  });

  const archive = useAction('Products', { invalidate: [['Products', id], ['Products']] });

  const { refetch: fetchForExport, isFetching: isExportLoading } = useQuery({
    queryKey: ['Products', id, 'full-export'],
    queryFn: () => odataGet('Products', id, { expand: ['variants($expand=batches($expand=factory,supplier))'] }),
    enabled: false
  });

  async function handleExport(format = 'xlsx') {
    const { data: full } = await fetchForExport();
    const ep = full ?? p;
    const productRows = [{
      Name: ep.name ?? '',
      Brand: ep.brand ?? '',
      Category: ep.category ?? '',
      Type: ep.product_type ?? '',
      Model: ep.model ?? '',
      GTIN: ep.gtin ?? '',
      UPC: ep.upc ?? '',
      EAN: ep.ean ?? '',
      Status: ep.status ?? '',
      'Country of Origin': ep.country_of_origin ?? '',
      Description: ep.description ?? '',
      'Fibre Composition': ep.fibre_composition ?? '',
      'Care Instructions': ep.care_instructions ?? '',
      'Repair Instructions': ep.repair_instructions ?? '',
      'Disposal Instructions': ep.disposal_instructions ?? '',
      'Reuse Instructions': ep.reuse_instructions ?? '',
      'Substances of Concern': ep.substances_of_concern ?? '',
      'ESPR Compliance': ep.espr_compliance ?? '',
      'Durability Score': ep.durability_score ?? '',
      'Repairability Score': ep.repairability_score ?? '',
      'Care Video URL': ep.care_video_url ?? '',
      'Repair Video URL': ep.repair_video_url ?? '',
      'Disposal Video URL': ep.disposal_video_url ?? '',
      'Reuse Video URL': ep.reuse_video_url ?? '',
      'Care Products URL': ep.care_products_url ?? '',
      'Repair Products URL': ep.repair_products_url ?? '',
      'Reuse Products URL': ep.reuse_products_url ?? '',
      'Disposal Products URL': ep.disposal_products_url ?? '',
    }];
    const variantRows = (ep.variants ?? []).map((v) => ({
      SKU: v.sku ?? '',
      Color: v.color ?? '',
      Size: v.size ?? '',
      GTIN: v.gtin ?? '',
      'Weight (g)': v.weight_g ?? '',
      Status: v.status ?? '',
    }));
    const batchRows = (ep.variants ?? []).flatMap((v) =>
      (v.batches ?? []).map((b) => ({
        'Variant SKU': v.sku ?? '',
        'Batch Number': b.batch_number ?? '',
        'Production Date': b.production_date ?? '',
        'Country of Origin': b.country_of_origin ?? '',
        'Production Stage': b.production_stage ?? '',
        Factory: b.factory?.name ?? '',
        Supplier: b.supplier?.name ?? '',
        'CO₂ Footprint (kg)': b.co2_footprint_kg ?? '',
        'Recycled Content (%)': b.recycled_content_pct ?? '',
        Status: b.status ?? '',
      }))
    );
    const slug = (ep.name ?? 'product').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    exportData(
      [
        { name: 'Product', rows: productRows },
        { name: 'Variants', rows: variantRows },
        { name: 'Batches', rows: batchRows },
      ],
      `product-${slug}`,
      format
    );
  }

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!p) return <p className="text-ink-muted">Product not found.</p>;

  const variants = p.variants ?? [];
  // Effective per-field visibility (saved overrides → catalogue defaults; locked → public).
  const vis = mergeVisibility(PRODUCT_CATALOGUE, p.field_visibility);
  // User-defined additional fields — each entry carries its own visibility.
  const customFields = parseCustomFields(p.custom_fields);

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
              {[p.brand, p.category?.name, p.model].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportDropdown onExport={handleExport} label="Export" disabled={isExportLoading} />
          <RequireRole role="company_advanced">
            <Link to={`/products/${id}/edit`}>
              <Button variant="outline">Edit</Button>
            </Link>
            <Button
              variant="outline"
              disabled={p.status === 'archived' || archive.isPending}
              onClick={() => archive.mutate({ key: id, action: 'archiveProduct' })}
            >
              {p.status === 'archived' ? 'Archived' : 'Archive'}
            </Button>

          </RequireRole>
        </div>
      </div>

      {/* Product info cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Basic information</CardTitle>
          <div className="mt-2">
            <Row label="Product ID" value={p.ID} visibility="internal" />
            <Row label="Type" value={p.product_type} visibility={vis.product_type} />
            <Row label="Brand" value={p.brand} visibility={vis.brand} />
            <Row label="Category" value={p.category?.name} visibility={vis.category} />
            <Row label="GTIN" value={p.gtin} visibility={vis.gtin} />
            <Row label="UPC" value={p.upc} visibility={vis.upc} />
            <Row label="EAN" value={p.ean} visibility={vis.ean} />
            <Row label="Description" value={p.description} visibility={vis.description} />
          </div>
        </Card>

        <Card>
          <CardTitle>Material, care &amp; compliance</CardTitle>
          <div className="mt-2">
            <Row label="Fibre composition" value={p.fibre_composition} visibility={vis.fibre_composition} />
            <Row label="Substances of concern" value={p.substances_of_concern} visibility={vis.substances_of_concern} />
            <Row label="Country of origin" value={p.country_of_origin} visibility={vis.country_of_origin} />
            <Row
              label="Care & washing instructions"
              value={p.care_instructions}
              visibility={vis.care_instructions}
            />
            <Row
              label="Care video"
              value={
                p.care_video_url ? (
                  <a
                    href={p.care_video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    Open video
                  </a>
                ) : null
              }
              visibility={vis.care_video_url}
            />
            <Row
              label="Care recommended products"
              value={
                p.care_products_url ? (
                  <a href={p.care_products_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    Open link
                  </a>
                ) : null
              }
              visibility={vis.care_products_url}
            />

            <Row
              label="Repair instructions"
              value={p.repair_instructions}
              visibility={vis.repair_instructions}
            />
            <Row
              label="Repair video"
              value={
                p.repair_video_url ? (
                  <a
                    href={p.repair_video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    Open video
                  </a>
                ) : null
              }
              visibility={vis.repair_video_url}
            />
            <Row
              label="Repair recommended products"
              value={
                p.repair_products_url ? (
                  <a href={p.repair_products_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    Open link
                  </a>
                ) : null
              }
              visibility={vis.repair_products_url}
            />

            <Row
              label="Reuse instructions"
              value={p.reuse_instructions}
              visibility={vis.reuse_instructions}
            />
            <Row
              label="Reuse video"
              value={
                p.reuse_video_url ? (
                  <a
                    href={p.reuse_video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    Open video
                  </a>
                ) : null
              }
              visibility={vis.reuse_video_url}
            />
            <Row
              label="Reuse recommended products"
              value={
                p.reuse_products_url ? (
                  <a href={p.reuse_products_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    Open link
                  </a>
                ) : null
              }
              visibility={vis.reuse_products_url}
            />
            <Row label="Disposal instructions" value={p.disposal_instructions} visibility={vis.disposal_instructions} />
            <Row
              label="Disposal video"
              value={
                p.disposal_video_url ? (
                  <a
                    href={p.disposal_video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-700 hover:underline"
                  >
                    Open video
                  </a>
                ) : null
              }
              visibility={vis.disposal_video_url}
            />
            <Row
              label="Disposal recommended products"
              value={
                p.disposal_products_url ? (
                  <a href={p.disposal_products_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    Open link
                  </a>
                ) : null
              }
              visibility={vis.disposal_products_url}
            />
            <Row label="Durability score" value={p.durability_score != null ? `${p.durability_score} / 10` : null} visibility={vis.durability_score} />
            <Row label="Repairability score" value={p.repairability_score != null ? `${p.repairability_score} / 10` : null} visibility={vis.repairability_score} />
            <Row label="ESPR compliance" value={<StatusBadge status={p.espr_compliance} />} visibility={vis.espr_compliance} />
          </div>
        </Card>
      </div>

      {/* User-defined additional fields (per-entry visibility) */}
      {customFields.length > 0 && (
        <Card>
          <CardTitle>Additional fields</CardTitle>
          <div className="mt-2">
            {customFields.map((f) => (
              <Row key={f.label} label={f.label} value={f.value} visibility={f.visibility} />
            ))}
          </div>
        </Card>
      )}

      {/* Certificates & documents (read-only; managed via product edit) */}
      <DocumentManager scope="product" ownerId={id} readOnly />

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
