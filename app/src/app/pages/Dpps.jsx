import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { odataList } from '@/api/client';
import { DataTable, SortHeader } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { PageHeader } from './ComingSoon';

const variantLabel = (v) =>
  v ? [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID : null;

const fmtDate = (v) => {
  if (!v) return '—';
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(v).slice(0, 10);
};

function getSortValue(d, column) {
  switch (column) {
    case 'product':
      return d.product?.name ?? '';
    case 'variant':
      return variantLabel(d.variant || d.batch?.variant) ?? '';
    case 'batch':
      return d.batch?.batch_number ?? '';
    default:
      return d[column] ?? '';
  }
}

export function Dpps() {
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ column: 'createdAt', direction: 'desc' });

  const { data, isLoading } = useQuery({
    queryKey: ['DPPs', 'list'],
    queryFn: () =>
      odataList('DPPs', {
        expand: ['product', 'variant', 'batch($expand=variant)', 'item'],
        orderby: 'createdAt desc',
        top: 100
      })
  });

  function handleSort(column) {
    setSortConfig((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  }

  const filteredDpps = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return data ?? [];

    return (data ?? []).filter((d) => {
      const searchableText = [
        d.ID,
        d.product?.name,
        d.product_ID,
        variantLabel(d.variant || d.batch?.variant),
        d.batch?.batch_number,
        d.item?.serial_number,
        d.item?.upi,
        d.dpp_type,
        d.visibility,
        d.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [data, search]);

  const sortedDpps = useMemo(() => {
    return [...filteredDpps].sort((a, b) => {
      const aValue = String(getSortValue(a, sortConfig.column)).toLowerCase();
      const bValue = String(getSortValue(b, sortConfig.column)).toLowerCase();

      const result = aValue.localeCompare(bValue, 'en', {
        numeric: true,
        sensitivity: 'base'
      });

      return sortConfig.direction === 'asc' ? result : -result;
    });
  }, [filteredDpps, sortConfig]);

  const columns = useMemo(
    () => [
      {
        header: <SortHeader label="Passport" column="ID" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => (
          <Link to={`/dpps/${d.ID}`} className="font-mono text-xs text-ink hover:text-brand-700">
            {d.ID}
          </Link>
        )
      },
      {
        header: <SortHeader label="Product" column="product" sortConfig={sortConfig} onSort={handleSort} />,
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
      {
        header: <SortHeader label="Variant" column="variant" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => variantLabel(d.variant || d.batch?.variant) ?? '—'
      },
      {
        header: <SortHeader label="Batch" column="batch" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => d.batch?.batch_number ?? '—'
      },
      {
        header: <SortHeader label="Created" column="createdAt" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => fmtDate(d.createdAt)
      },
      {
        header: <SortHeader label="Type" column="dpp_type" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => d.dpp_type
      },
      {
        header: <SortHeader label="Version" column="current_version" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => d.current_version ?? '—'
      },
      {
        header: <SortHeader label="Visibility" column="visibility" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => <StatusBadge status={d.visibility} />
      },
      {
        header: <SortHeader label="Status" column="status" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => <StatusBadge status={d.status} />
      }
    ],
    [sortConfig]
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Digital product passports" subtitle="All passports across your products" />

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search passports..."
        className="w-full rounded-lg border border-black/10 bg-white px-4 py-2 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />

      <DataTable columns={columns} rows={sortedDpps} loading={isLoading} empty="No passports found." />
    </div>
  );
}
