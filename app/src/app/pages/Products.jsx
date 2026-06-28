import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { odataList } from '@/api/client';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { StatusBadge, Badge } from '@/ui/Badge';
import { SortHeader } from '@/ui/Table';
import { RequireRole } from '@/auth/RequireRole';
import { PageHeader } from './ComingSoon';
import { PRODUCT_TYPES } from '@/lib/fieldCatalogue';
import { formatLabel } from '@/lib/formatters';
import { cn } from '@/lib/cn';

const PRODUCT_TYPE_LABELS = Object.fromEntries(PRODUCT_TYPES.map((t) => [t.value, t.label]));
const typeLabel = (t) => PRODUCT_TYPE_LABELS[t] ?? formatLabel(t);

function getSortValue(product, column) {
  if (column === 'variants') return (product.variants ?? []).length;
  if (column === 'product_type') return typeLabel(product.product_type);
  return product[column] ?? '';
}

function ProductRow({ product }) {
  const [open, setOpen] = useState(false);
  const variants = product.variants ?? [];

  return (
    <div className="border-b border-black/5 last:border-0">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-ink-muted hover:text-ink"
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
        </button>

        <span className="w-44 shrink-0 font-mono text-xs text-ink-muted">
          {product.ID}
        </span>

        <div className="min-w-0 flex-1">
          <Link to={`/products/${product.ID}`} className="font-medium text-ink hover:text-brand-700">
            {product.name}
          </Link>
          <div className="text-xs text-ink-muted">
            {[product.brand, product.category?.name].filter(Boolean).join(' · ')}
          </div>
        </div>

        <span className="flex w-40 shrink-0">
          <Badge tone="gray">{typeLabel(product.product_type)}</Badge>
        </span>

        <span className="w-24 shrink-0 text-right text-xs text-ink-muted">
          {variants.length} variants
        </span>

        <span className="flex w-28 shrink-0 justify-end">
          <StatusBadge status={product.status} />
        </span>
      </div>

      {open && (
        <div className="border-t border-black/5 bg-gray-50 px-5 py-3 pl-12">
          <ul className="space-y-1.5">
            {variants.map((v) => (
              <li key={v.ID} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/products/${product.ID}/variants/${v.ID}/view`}
                    className="text-sm font-medium text-ink hover:text-brand-700"
                  >
                    {[v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID}
                  </Link>

                  <div className="text-xs text-ink-muted">
                    <span className="font-mono">{v.ID}</span>
                    {v.sku && <span> · {v.sku}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={v.status} />
                  <RequireRole role="company_advanced">
                    <Link to={`/products/${product.ID}/variants/${v.ID}`}>
                      <Button variant="outline" size="sm">Edit</Button>
                    </Link>
                    <Link to={`/products/${product.ID}/variants/${v.ID}/batches`}>
                      <Button variant="ghost" size="sm">Batches</Button>
                    </Link>
                  </RequireRole>
                </div>
              </li>
            ))}
            {variants.length === 0 && <li className="text-sm text-ink-muted">No variants yet.</li>}
          </ul>
          <RequireRole role="company_advanced">
            <Link to={`/products/${product.ID}/variants/new`} className="mt-3 inline-block">
              <Button variant="outline" size="sm">
                <Plus className="h-3.5 w-3.5" /> Add variant
              </Button>
            </Link>
          </RequireRole>
        </div>
      )}
    </div>
  );
}

export function Products() {
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ column: 'name', direction: 'asc' });

  const { data, isLoading } = useQuery({
    queryKey: ['Products'],
    queryFn: () => odataList('Products', { expand: ['variants', 'category'], orderby: 'name', top: 100 })
  });

  function handleSort(column) {
    setSortConfig((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  }

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return data ?? [];

    return (data ?? []).filter((p) => {
        const searchableText = [
          p.ID,
          p.name,
          p.brand,
          p.category?.name,
          typeLabel(p.product_type),
          p.status,
          ...(p.variants ?? []).flatMap((v) => [v.ID, v.sku, v.color, v.size])
        ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [data, search]);

  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      const aValue = String(getSortValue(a, sortConfig.column)).toLowerCase();
      const bValue = String(getSortValue(b, sortConfig.column)).toLowerCase();

      const result = aValue.localeCompare(bValue, 'en', {
        numeric: true,
        sensitivity: 'base'
      });

      return sortConfig.direction === 'asc' ? result : -result;
    });
  }, [filteredProducts, sortConfig]);

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

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products..."
        className="w-full rounded-lg border border-black/10 bg-white px-4 py-2 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />

      <Card className="p-0">
        {isLoading ? (
          <p className="px-5 py-8 text-center text-ink-muted">Loading…</p>
        ) : sortedProducts.length === 0 ? (
          <p className="px-5 py-8 text-center text-ink-muted">
            {(data ?? []).length === 0 ? 'No products yet.' : 'No products found.'}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-black/5 px-5 py-2.5 text-xs uppercase tracking-wider text-ink-muted">
              <span className="h-4 w-4 shrink-0" aria-hidden="true" />

                <span className="w-44 shrink-0">
                <SortHeader label="ID" column="ID" sortConfig={sortConfig} onSort={handleSort} />
              </span>

              <span className="min-w-0 flex-1">
                <SortHeader label="PRODUCT NAME" column="name" sortConfig={sortConfig} onSort={handleSort} />
              </span>
              <span className="w-40 shrink-0">
                <SortHeader label="TYPE" column="product_type" sortConfig={sortConfig} onSort={handleSort} />
              </span>
              <span className="flex w-24 shrink-0 justify-end">
                <SortHeader label="VARIANTS" column="variants" sortConfig={sortConfig} onSort={handleSort} />
              </span>
              <span className="flex w-28 shrink-0 justify-end">
                <SortHeader label="STATUS" column="status" sortConfig={sortConfig} onSort={handleSort} />
              </span>
            </div>
            {sortedProducts.map((p) => <ProductRow key={p.ID} product={p} />)}
          </>
        )}
      </Card>
    </div>
  );
}
