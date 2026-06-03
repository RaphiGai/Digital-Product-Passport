import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { odataList } from '@/api/client';
import { DataTable } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { PageHeader } from './ComingSoon';

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
  { header: 'Type', cell: (d) => d.dpp_type },
  { header: 'Version', cell: (d) => d.current_version ?? '—' },
  { header: 'Visibility', cell: (d) => <StatusBadge status={d.visibility} /> },
  { header: 'Status', cell: (d) => <StatusBadge status={d.status} /> }
];

export function Dpps() {
  const { data, isLoading } = useQuery({
    queryKey: ['DPPs'],
    queryFn: () => odataList('DPPs', { top: 100 })
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Digital product passports" subtitle="All passports across your products" />
      <DataTable columns={columns} rows={data ?? []} loading={isLoading} />
    </div>
  );
}
