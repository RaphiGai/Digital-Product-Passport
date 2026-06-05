import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { odataList } from '@/api/client';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { StatusBadge } from '@/ui/Badge';
import { RequireRole } from '@/auth/RequireRole';
import { PageHeader } from './ComingSoon';
import { cn } from '@/lib/cn';

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
        <div className="min-w-0 flex-1">
          <Link to={`/products/${product.ID}`} className="font-medium text-ink hover:text-brand-700">
            {product.name}
          </Link>
          <div className="text-xs text-ink-muted">
            {[product.brand, product.category].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span className="text-xs text-ink-muted">{variants.length} variants</span>
        <StatusBadge status={product.status} />
      </div>

      {open && (
        <div className="border-t border-black/5 bg-gray-50 px-5 py-3 pl-12">
          <ul className="space-y-1.5">
            {variants.map((v) => (
              <li key={v.ID} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">
                  {[v.color, v.size].filter(Boolean).join(' / ') || v.sku}
                  <span className="ml-2 text-xs text-ink-muted">{v.sku}</span>
                </span>
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
  const { data, isLoading } = useQuery({
    queryKey: ['Products'],
    queryFn: () => odataList('Products', { expand: ['variants'], orderby: 'name', top: 100 })
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

      <Card className="p-0">
        {isLoading ? (
          <p className="px-5 py-8 text-center text-ink-muted">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <p className="px-5 py-8 text-center text-ink-muted">No products yet.</p>
        ) : (
          (data ?? []).map((p) => <ProductRow key={p.ID} product={p} />)
        )}
      </Card>
    </div>
  );
}
