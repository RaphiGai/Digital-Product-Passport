import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { odataGet } from '@/api/client';
import { mergeVisibility, VARIANT_CATALOGUE, PRODUCT_CATALOGUE } from '@/lib/fieldCatalogue';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, StatusBadge } from '@/ui/Badge';
import { Breadcrumb } from '@/ui/Breadcrumb';
import { BomEditor } from '@/ui/BomEditor';
import { RequireRole } from '@/auth/RequireRole';

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

export function VariantView() {
  const { pid, vid } = useParams();

  const productQ = useQuery({
    queryKey: ['Products', pid],
    queryFn: () => odataGet('Products', pid)
  });

  const variantQ = useQuery({
    queryKey: ['ProductVariants', 'one', vid],
    queryFn: () => odataGet('ProductVariants', vid)
  });

  const p = productQ.data;
  const v = variantQ.data;

  if (productQ.isLoading || variantQ.isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!v) return <p className="text-ink-muted">Variant not found.</p>;

  const label = [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID;
  // Effective per-field visibility (saved overrides → catalogue defaults; locked → public).
  const variantVis = mergeVisibility(VARIANT_CATALOGUE, v.field_visibility);
  const productVis = mergeVisibility(PRODUCT_CATALOGUE, p?.field_visibility);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Products', to: '/products' },
          { label: p?.name ?? 'Product', to: `/products/${pid}` },
          { label: label }
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{label}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={v.status} />
            {v.sku && <span className="text-sm text-ink-muted">{v.sku}</span>}
            {p && (
              <span className="text-sm text-ink-muted">
                {[p.brand, p.category].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to={`/products/${pid}/variants/${vid}/batches`}>
            <Button variant="ghost">Batches</Button>
          </Link>
          <RequireRole role="company_advanced">
            <Link to={`/products/${pid}/variants/${vid}`}>
              <Button variant="outline">Edit</Button>
            </Link>
          </RequireRole>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Variant details */}
        <Card>
          <CardTitle>Variant details</CardTitle>
          {(v.image_data || v.image_url) && (
            <img
              src={v.image_data || v.image_url}
              alt={label}
              className="mb-3 mt-3 h-32 w-32 rounded-lg border border-black/10 object-cover"
            />
          )}
          <div className="mt-2">
            <InfoRow
              label="Variant ID"
              value={<span className="font-mono">{v.ID}</span>}
              visibility="internal"
            />
            <InfoRow label="Colour" value={v.color} visibility={variantVis.color} />
            <InfoRow label="Size" value={v.size} visibility={variantVis.size} />
            <InfoRow label="SKU" value={v.sku} visibility={variantVis.sku} />
            <InfoRow label="GTIN" value={v.gtin} visibility={variantVis.gtin} />
            <InfoRow
              label="Weight"
              value={v.weight_g != null ? `${v.weight_g} g` : null}
              visibility="internal"
            />
            <InfoRow label="Status" value={<StatusBadge status={v.status} />} visibility="internal" />
          </div>
        </Card>

        {/* Product-level information pulled from the parent product */}
        <Card>
          <CardTitle>Product information</CardTitle>
          <div className="mt-2">
            <InfoRow
              label="Product ID"
              value={<span className="font-mono">{p?.ID}</span>}
              visibility="internal"
            />
            <InfoRow label="Brand" value={p?.brand} visibility={productVis.brand} />
            <InfoRow label="Category" value={p?.category} visibility={productVis.category} />
            <InfoRow label="Description" value={p?.description} visibility={productVis.description} />
            <InfoRow label="Fibre composition" value={p?.fibre_composition} visibility={productVis.fibre_composition} />
            <InfoRow label="Country of origin" value={p?.country_of_origin} visibility={productVis.country_of_origin} />

            <InfoRow label="Care & washing instructions" value={p?.care_instructions} visibility={productVis.care_instructions} />
            <InfoRow
              label="Care video"
              value={
                p?.care_video_url ? (
                  <a href={p.care_video_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    Open video
                  </a>
                ) : null
              }
              visibility={productVis.care_video_url}
            />

            <InfoRow label="Repair instructions" value={p?.repair_instructions} visibility={productVis.repair_instructions} />
            <InfoRow
              label="Repair video"
              value={
                p?.repair_video_url ? (
                  <a href={p.repair_video_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    Open video
                  </a>
                ) : null
              }
              visibility={productVis.repair_video_url}
            />

            <InfoRow label="Reuse instructions" value={p?.reuse_instructions} visibility={productVis.reuse_instructions} />
            <InfoRow
              label="Reuse video"
              value={
                p?.reuse_video_url ? (
                  <a href={p.reuse_video_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    Open video
                  </a>
                ) : null
              }
              visibility={productVis.reuse_video_url}
            />

            <InfoRow label="Disposal instructions" value={p?.disposal_instructions} visibility={productVis.disposal_instructions} />
            <InfoRow
              label="Disposal video"
              value={
                p?.disposal_video_url ? (
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
              visibility={productVis.disposal_video_url}
            />

            <InfoRow
              label="Durability score"
              value={p?.durability_score != null ? `${p.durability_score} / 10` : null}
              visibility={productVis.durability_score}
            />
            <InfoRow
              label="Repairability score"
              value={p?.repairability_score != null ? `${p.repairability_score} / 10` : null}
              visibility={productVis.repairability_score}
            />
            <InfoRow
              label="ESPR compliance"
              value={p ? <StatusBadge status={p.espr_compliance} /> : null}
              visibility={productVis.espr_compliance}
            />
          </div>
        </Card>
      </div>

      {/* BOM section header + read-only BOM */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-ink">BOM for {label}</h2>

      </div>
      <BomEditor productId={pid} variantId={vid} readOnly />
    </div>
  );
}
