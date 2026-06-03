import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { odataGet } from '@/api/client';
import { useAction } from '@/api/hooks';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, StatusBadge } from '@/ui/Badge';
import { Breadcrumb } from '@/ui/Breadcrumb';
import { DataTable } from '@/ui/Table';
import { RequireRole } from '@/auth/RequireRole';

/** @param {{ label: string, value: React.ReactNode, visibility?: 'public' | 'internal' }} props */
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

export function ProductDetail() {
  const { id } = useParams();

  const { data: p, isLoading } = useQuery({
    queryKey: ['Products', id],
    queryFn: () => odataGet('Products', id, { expand: ['variants'] })
  });

  const archive = useAction('Products', { invalidate: [['Products', id], ['Products']] });

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!p) return <p className="text-ink-muted">Product not found.</p>;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Products', to: '/products' },
          { label: p.name }
        ]}
      />

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
          <Button
            variant="danger"
            disabled={p.status === 'archived' || archive.isPending}
            onClick={() => archive.mutate({ key: id, action: 'archiveProduct' })}
          >
            {p.status === 'archived' ? 'Archived' : 'Archive product'}
          </Button>
        </RequireRole>
      </div>

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
            <Row label="ESPR compliance" value={<StatusBadge status={p.espr_compliance} />} visibility="public" />
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <div className="px-5 pt-5">
          <CardTitle>Variants</CardTitle>
        </div>
        <div className="mt-3">
          <DataTable
            columns={[
              { header: 'SKU', cell: (v) => v.sku ?? v.ID },
              { header: 'Color', cell: (v) => v.color ?? '—' },
              { header: 'Size', cell: (v) => v.size ?? '—' },
              { header: 'GTIN', cell: (v) => v.gtin ?? '—' },
              { header: 'Status', cell: (v) => <StatusBadge status={v.status} /> }
            ]}
            rows={p.variants ?? []}
            empty="No variants yet. (Adding variants is part of the next wizard step.)"
          />
        </div>
      </Card>
    </div>
  );
}
