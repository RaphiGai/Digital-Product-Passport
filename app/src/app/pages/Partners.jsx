import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { odataList } from '@/api/client';
import { DataTable } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { RequireRole } from '@/auth/RequireRole';
import { PageHeader } from './ComingSoon';

/** @type {import('@/ui/Table').Column<import('@/api/types').BusinessPartner>[]} */
const columns = [
  {
    header: 'Partner',
    cell: (p) => (
      <Link to={`/partners/${p.ID}`} className="font-medium text-ink hover:text-brand-700">
        {p.name}
      </Link>
    )
  },
  { header: 'Country', cell: (p) => p.country_iso2 ?? '—' },
  { header: 'City', cell: (p) => p.city ?? '—' },
  { header: 'Status', cell: (p) => <StatusBadge status={p.archived ? 'archived' : 'active'} /> }
];

export function Partners() {
  const { data, isLoading } = useQuery({
    queryKey: ['BusinessPartners'],
    queryFn: () => odataList('BusinessPartners', { orderby: 'name', top: 100 })
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Business partners" subtitle="Suppliers, factories, recyclers" />
        <RequireRole role="company_advanced">
          <Link to="/partners/new">
            <Button>Create business partner</Button>
          </Link>
        </RequireRole>
      </div>
      <DataTable columns={columns} rows={data ?? []} loading={isLoading} />
    </div>
  );
}
