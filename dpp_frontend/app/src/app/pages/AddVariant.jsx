import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { odataGet } from '@/api/client';
import { Breadcrumb } from '@/ui/Breadcrumb';
import { Step2Variant } from './wizard/Step2Variant';

/**
 * Focused "add variant(s)" flow for an existing product (reached from the products list /
 * product detail). Reuses the wizard's variant step; "Done" returns to the product.
 */
export function AddVariant() {
  const { pid } = useParams();
  const navigate = useNavigate();

  const { data: product } = useQuery({
    queryKey: ['Products', pid],
    queryFn: () => odataGet('Products', pid, { select: ['ID', 'name'] })
  });

  const [ctx, setCtx] = useState({ productId: pid, productName: '', variantId: null, variantLabel: '' });
  // Keep productName in ctx once the product loads (for the variant list heading).
  if (product && ctx.productName !== product.name) {
    setCtx((c) => ({ ...c, productName: product.name }));
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Products', to: '/products' },
          { label: product?.name ?? 'Product', to: `/products/${pid}` },
          { label: 'Add variant' }
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-ink">Add variant</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Add one or more variants to {product?.name ?? 'this product'}.
        </p>
      </div>

      <Step2Variant
        ctx={ctx}
        setCtx={setCtx}
        onPrimary={() => navigate(`/products/${pid}`)}
        primaryLabel="Done"
      />
    </div>
  );
}
