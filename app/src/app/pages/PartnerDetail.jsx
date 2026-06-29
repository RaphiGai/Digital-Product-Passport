import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { odataGet, odataList } from '@/api/client';
import { useUpdate } from '@/api/hooks';
import { PARTNER_ROLES } from '@/lib/fieldCatalogue';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, StatusBadge } from '@/ui/Badge';
import { Breadcrumb } from '@/ui/Breadcrumb';
import { DataTable } from '@/ui/Table';
import { RequireRole } from '@/auth/RequireRole';
import { formatDateTime, formatDate } from '@/lib/formatters';
import { exportData } from '@/lib/exportExcel';
import { ExportDropdown } from '@/ui/ExportDropdown';

const roleLabel = (v) => PARTNER_ROLES.find((r) => r.value === v)?.label ?? v;

/** @param {{ label: string, value: React.ReactNode, visibility?: 'public' | 'internal' }} props */
function Row({ label, value, visibility }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/5 py-3 last:border-0">
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        {label}
        {visibility && (
          <Badge tone={visibility === 'public' ? 'green' : 'gray'} className="font-normal">
            {visibility === 'public' ? 'Public' : 'Internal'}
          </Badge>
        )}
      </span>
      <span className="text-right text-sm text-ink">{value ?? '—'}</span>
    </div>
  );
}

export function PartnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: bp, isLoading } = useQuery({
    queryKey: ['BusinessPartners', id],
    queryFn: () => odataGet('BusinessPartners', id, { expand: ['roles'] })
  });

  const { data: batches } = useQuery({
    queryKey: ['BusinessPartners', id, 'batches'],
    queryFn: () =>
      odataList('Batches', {
        filter: `factory_ID eq '${id}' or supplier_ID eq '${id}'`,
        expand: ['variant($expand=product)'],
        top: 100
      }).catch(() => [])
  });

  const archive = useUpdate('BusinessPartners', { invalidate: [['BusinessPartners', id]] });

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!bp) return <p className="text-ink-muted">Partner not found.</p>;

  const roles = bp.roles ?? [];
  const activeBatches = (batches ?? []).filter((b) => b.status === 'active').length;

  function handleExport(format = 'xlsx') {
    const partnerRows = [{
      ID: bp.ID,
      Name: bp.name,
      Country: bp.country_iso2 ?? '',
      City: bp.city ?? '',
      Address: bp.address ?? '',
      'Contact Person': bp.contact_person ?? '',
      'Contact Email': bp.contact_email ?? '',
      Identifier: bp.identifier ?? '',
      Roles: roles.map((r) => roleLabel(r.role)).join(', '),
      Status: bp.archived ? 'Archived' : 'Active',
      'Created At': formatDateTime(bp.createdAt) ?? '',
      'Last Changed': formatDateTime(bp.lastChange ?? bp.modifiedAt) ?? '',
    }];

    const batchRows = (batches ?? []).map((b) => ({
      'Batch Number': b.batch_number ?? '',
      Product: b.variant?.product?.name ?? '',
      'Variant SKU': b.variant?.sku ?? '',
      'Production Date': b.production_date ?? '',
      'Country of Origin': b.country_of_origin ?? '',
      'Production Stage': b.production_stage ?? '',
      'CO₂ Footprint (kg)': b.co2_footprint_kg ?? '',
      'Recycled Content (%)': b.recycled_content_pct ?? '',
      Status: b.status ?? '',
    }));

    exportData(
      [
        { name: 'Partner Info', rows: partnerRows },
        { name: 'Linked Batches', rows: batchRows },
      ],
      `partner-${bp.name.replace(/\s+/g, '-').toLowerCase()}`,
      format
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Business partners', to: '/partners' },
          { label: bp.name }
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-100 text-base font-semibold text-brand-800">
            {bp.name?.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-ink">{bp.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={bp.archived ? 'archived' : 'active'} />
              {roles.map((r) => (
                <Badge key={r.ID ?? r.role} tone="green">
                  {roleLabel(r.role)}
                </Badge>
              ))}
              <span className="text-sm text-ink-muted">
                {[bp.city, bp.country_iso2].filter(Boolean).join(', ')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportDropdown onExport={handleExport} label="Export" />
          <RequireRole role="company_advanced">
            <Button
              variant="danger"
              disabled={bp.archived || archive.isPending}
              onClick={() => archive.mutate({ key: id, payload: { archived: true } })}
            >
              {bp.archived ? 'Archived' : 'Archive'}
            </Button>
            <Button variant="outline" onClick={() => navigate(`/partners/${id}/edit`)}>
              Edit partner
            </Button>
          </RequireRole>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Identity &amp; contact</CardTitle>
            <div className="mt-2">
              <Row label="Business partner ID" value={<span className="font-mono text-xs">{bp.ID}</span>} visibility="internal" />
              <Row label="Name" value={bp.name} visibility="public" />
              <Row label="Country" value={bp.country_iso2} visibility="public" />
              <Row label="City" value={bp.city} visibility="internal" />
              <Row label="Address" value={bp.address} visibility="internal" />
              <Row label="External identifier" value={bp.identifier} visibility="internal" />
              <Row label="Contact person" value={bp.contact_person} visibility="internal" />
              <Row
                label="Contact email"
                value={
                  bp.contact_email ? (
                    <a href={`mailto:${bp.contact_email}`} className="text-brand-700 hover:underline">
                      {bp.contact_email}
                    </a>
                  ) : null
                }
                visibility="internal"
              />
              <Row label="Status" value={<StatusBadge status={bp.archived ? 'archived' : 'active'} />} visibility="internal" />
            </div>
          </Card>

          <Card>
            <CardTitle>Supply chain roles</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              {roles.length ? (
                roles.map((r) => (
                  <Badge key={r.ID ?? r.role} tone="green">
                    {roleLabel(r.role)}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-ink-muted">No roles assigned.</span>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Audit fields</CardTitle>
            <div className="mt-2 grid grid-cols-2 gap-x-6">
              <Row label="Created at" value={formatDateTime(bp.createdAt)} />
              <Row label="Created by" value={bp.createdBy ?? bp.createdBy_ID} />
              <Row label="Last changed" value={formatDateTime(bp.lastChange ?? bp.modifiedAt)} />
              <Row label="Changed by" value={bp.changedBy ?? bp.changedBy_ID ?? bp.modifiedBy} />
            </div>
          </Card>

          <Card className="p-0">
            <div className="px-5 pt-5">
              <CardTitle>Linked production batches</CardTitle>
            </div>
            <div className="mt-3">
              <DataTable
                columns={[
                  { header: 'Batch', cell: (b) => b.batch_number ?? b.ID },
                  { header: 'Product', cell: (b) => b.variant?.product?.name ?? '—' },
                  { header: 'Status', cell: (b) => <StatusBadge status={b.status} /> }
                ]}
                rows={batches ?? []}
                empty="No batches link to this partner."
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Partner summary</CardTitle>
            <div className="mt-2">
              <Row label="Total batches linked" value={(batches ?? []).length} />
              <Row label="Active batches" value={activeBatches} />
              <Row label="Roles" value={roles.length} />
              <Row label="Status" value={<StatusBadge status={bp.archived ? 'archived' : 'active'} />} />
              <Row label="Partner since" value={formatDate(bp.createdAt)} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
