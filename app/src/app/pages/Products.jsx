import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { odataList } from '@/api/client';
import { DataTable } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { RequireRole } from '@/auth/RequireRole';
import { PageHeader } from './ComingSoon';

/** @type {import('@/ui/Table').Column<import('@/api/types').Product>[]} */
const columns = [
  {
    header: 'Product',
    cell: (p) => (
      <div>
        <Link to={`/products/${p.ID}`} className="font-medium text-ink hover:text-brand-700">
          {p.name}
        </Link>
        <div className="text-xs text-ink-muted">
          {[p.brand, p.gtin && `GTIN ${p.gtin}`].filter(Boolean).join(' · ')}
        </div>
      </div>
    )
  },
  { header: 'Category', cell: (p) => p.category ?? '—' },
  { header: 'Type', cell: (p) => p.product_type },
  { header: 'ESPR', cell: (p) => <StatusBadge status={p.espr_compliance} /> },
  { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> }
];

export function Products() {
  const { data, isLoading } = useQuery({
    queryKey: ['Products'],
    queryFn: () => odataList('Products', { orderby: 'name', top: 100 })
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Products" subtitle="Models, variants, batches and DPPs" />
        <RequireRole role="company_advanced">
          <Link to="/products/new">
            <Button>Create product</Button>
          </Link>
        </RequireRole>
      </div>
      <DataTable columns={columns} rows={data ?? []} loading={isLoading} />
    </div>
  );
}
