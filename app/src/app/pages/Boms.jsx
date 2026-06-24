import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { odataList } from '@/api/client';
import { SortHeader } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { Card } from '@/ui/Card';
import { PageHeader } from './ComingSoon';

const variantLabel = (v) =>
  v ? [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID : '—';

function groupByVariant(lines) {
  const map = new Map();

  for (const line of lines) {
    const vid = line.parent_ID;

    if (!map.has(vid)) {
      map.set(vid, {
        variant: line.parent,
        product: line.parent?.product,
        lines: []
      });
    }

    map.get(vid).lines.push(line);
  }

  return [...map.values()];
}

// The raw ProductBOMs line IDs of a variant's BOM (shown as a tooltip / used in search).
function bomIds(g) {
  return g.lines.map((l) => l.ID).filter(Boolean).join(', ');
}

// A BOM is the set of lines of exactly one variant → derive a single, convention-
// consistent identifier from the variant ID (prod-… / var-… → bom-…). The real
// ProductBOMs line IDs (also bom-…) stay available as a tooltip and in search.
const bomKey = (g) => {
  const vid = g.variant?.ID || '';
  if (!vid) return '';
  return /^var-/.test(vid) ? vid.replace(/^var-/, 'bom-') : `bom-${vid}`;
};

function getSortValue(g, column) {
  if (column === 'bom_id') return bomKey(g);
  if (column === 'bom') return variantLabel(g.variant);
  if (column === 'product') return g.product?.name ?? '';
  if (column === 'brand') return g.product?.brand ?? '';
  if (column === 'components') return g.lines.length;
  if (column === 'status') return g.variant?.status ?? '';
  return '';
}

export function Boms() {
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({
    column: 'product',
    direction: 'asc'
  });

  const { data, isLoading } = useQuery({
    queryKey: ['ProductBOMs', 'all'],
    queryFn: () =>
      odataList('ProductBOMs', {
        expand: ['parent($expand=product)'],
        top: 1000
      })
  });

  const groups = useMemo(() => groupByVariant(data ?? []), [data]);

  function handleSort(column) {
    setSortConfig((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return groups;

    return groups.filter((g) =>
      [
        bomKey(g),
        g.variant?.ID,
        bomIds(g),
        variantLabel(g.variant),
        g.product?.name,
        g.product?.brand,
        g.variant?.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [groups, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aValue = String(getSortValue(a, sortConfig.column)).toLowerCase();
      const bValue = String(getSortValue(b, sortConfig.column)).toLowerCase();

      const result = aValue.localeCompare(bValue, 'en', {
        numeric: true,
        sensitivity: 'base'
      });

      return sortConfig.direction === 'asc' ? result : -result;
    });
  }, [filtered, sortConfig]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bill of materials"
        subtitle={`${groups.length} variant BOM${groups.length !== 1 ? 's' : ''} across all products`}
      />

      <div className="max-w-sm">
        <input
          type="search"
          placeholder="Search by BOM ID, product, brand or variant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-black/15 px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <Card className="p-0">
        <div className="grid grid-cols-[1.5fr_2fr_1.5fr_1fr_1fr_1fr] gap-4 border-b border-black/5 px-5 py-2.5 text-xs uppercase tracking-wider text-ink-muted">
          <SortHeader label="BOM ID" column="bom_id" sortConfig={sortConfig} onSort={handleSort} />
          <SortHeader label="BOM" column="bom" sortConfig={sortConfig} onSort={handleSort} />
          <SortHeader label="Product" column="product" sortConfig={sortConfig} onSort={handleSort} />
          <SortHeader label="Brand" column="brand" sortConfig={sortConfig} onSort={handleSort} />
          <SortHeader label="Components" column="components" sortConfig={sortConfig} onSort={handleSort} />
          <SortHeader label="Variant status" column="status" sortConfig={sortConfig} onSort={handleSort} />
        </div>

        {isLoading ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">No BOMs found.</p>
        ) : (
          sorted.map((g) => (
            <div
              key={g.variant?.ID ?? bomIds(g)}
              className="grid grid-cols-[1.5fr_2fr_1.5fr_1fr_1fr_1fr] items-center gap-4 border-b border-black/5 px-5 py-3 text-sm last:border-0"
            >
              <span className="font-mono text-xs text-ink-muted" title={bomIds(g) || undefined}>
                {bomKey(g) || '—'}
              </span>

              <span>
                {g.variant ? (
                  <Link
                    to={`/products/${g.product?.ID}/variants/${g.variant.ID}/view`}
                    className="font-medium text-ink hover:text-brand-700"
                  >
                    BOM for {variantLabel(g.variant)}
                  </Link>
                ) : (
                  '—'
                )}
              </span>

              <span>
                {g.product ? (
                  <Link to={`/products/${g.product.ID}`} className="text-brand-700 hover:underline">
                    {g.product.name}
                  </Link>
                ) : (
                  '—'
                )}
              </span>

              <span>{g.product?.brand ?? '—'}</span>
              <span>{g.lines.length}</span>
              <span>{g.variant?.status ? <StatusBadge status={g.variant.status} /> : '—'}</span>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}