import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { odataList } from '@/api/client';
import { DataTable } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { PageHeader } from './ComingSoon';

const variantLabel = (v) =>
  v ? [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID : null;

const fmtDate = (v) => {
  if (!v) return '—';
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(v).slice(0, 10);
};

/** @type {import('@/ui/Table').Column<import('@/api/types').DPP>[]} */
const columns = [
  {
    header: 'Passport',
    cell: (d) => (
      <Link to={`/dpps/${d.ID}`} className="font-mono text-xs text-ink hover:text-brand-700">
        {d.ID}
      </Link>
    )
  },
  {
    header: 'Product',
    cell: (d) =>
      d.product?.name ? (
        <Link to={`/products/${d.product_ID}`} className="text-ink hover:text-brand-700">
          {d.product.name}
        </Link>
      ) : (
        '—'
      )
  },
  // Variant: directly linked, else resolved via the batch (batch-level DPPs have no own variant link).
  { header: 'Variant', cell: (d) => variantLabel(d.variant || d.batch?.variant) ?? '—' },
  { header: 'Batch', cell: (d) => d.batch?.batch_number ?? '—' },
  { header: 'Created', cell: (d) => fmtDate(d.createdAt) },
  { header: 'Type', cell: (d) => d.dpp_type },
  { header: 'Version', cell: (d) => d.current_version ?? '—' },
  { header: 'Visibility', cell: (d) => <StatusBadge status={d.visibility} /> },
  { header: 'Status', cell: (d) => <StatusBadge status={d.status} /> }
];

export function Dpps() {
  const { data, isLoading } = useQuery({
    queryKey: ['DPPs', 'list'],
    queryFn: () =>
      odataList('DPPs', {
        expand: ['product', 'variant', 'batch($expand=variant)'],
        orderby: 'createdAt desc',
        top: 100
      })
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Digital product passports" subtitle="All passports across your products" />
      <DataTable columns={columns} rows={data ?? []} loading={isLoading} />
    </div>
  );
}
