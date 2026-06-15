import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { odataList } from '@/api/client';
import { DataTable } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { PageHeader } from './ComingSoon';

const variantLabel = (v) =>
  v ? [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID : '—';

function groupByVariant(lines) {
  const map = new Map();
  for (const line of lines) {
    const vid = line.parent_ID;
    if (!map.has(vid)) {
      map.set(vid, { variant: line.parent, product: line.parent?.product, lines: [] });
    }
    map.get(vid).lines.push(line);
  }
  return [...map.values()];
}

const columns = [
  {
    header: 'BOM',
    cell: (g) =>
      g.variant ? (
        <Link
          to={`/products/${g.product?.ID}/variants/${g.variant.ID}/view`}
          className="font-medium text-ink hover:text-brand-700"
        >
          BOM for {variantLabel(g.variant)}
        </Link>
      ) : (
        '—'
      )
  },
  {
    header: 'Product',
    cell: (g) =>
      g.product ? (
        <Link to={`/products/${g.product.ID}`} className="text-brand-700 hover:underline">
          {g.product.name}
        </Link>
      ) : (
        '—'
      )
  },
  {
    header: 'Brand',
    cell: (g) => g.product?.brand ?? '—'
  },
  {
    header: 'Components',
    cell: (g) => g.lines.length
  },
  {
    header: 'Variant status',
    cell: (g) => g.variant?.status ? <StatusBadge status={g.variant.status} /> : '—'
  }
];

export function Boms() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['ProductBOMs', 'all'],
    queryFn: () =>
      odataList('ProductBOMs', {
        expand: ['parent($expand=product)'],
        top: 1000
      })
  });

  const groups = groupByVariant(data ?? []);

  const filtered = search.trim()
    ? groups.filter((g) => {
        const q = search.toLowerCase();
        return (
          g.product?.name?.toLowerCase().includes(q) ||
          g.product?.brand?.toLowerCase().includes(q) ||
          variantLabel(g.variant).toLowerCase().includes(q)
        );
      })
    : groups;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bill of materials"
        subtitle={`${groups.length} variant BOM${groups.length !== 1 ? 's' : ''} across all products`}
      />

      <div className="max-w-sm">
        <input
          type="search"
          placeholder="Search by product, brand or variant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-black/15 px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        loading={isLoading}
        empty="No BOMs found."
      />
    </div>
  );
}
