import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { odataList } from '@/api/client';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { FieldRow, Select } from '@/ui/Form';
import { BomEditor } from '@/ui/BomEditor';

/**
 * Wizard step: pick a target variant and edit its bill of materials (reusable editor,
 * incl. "copy from another variant"). The target variant can be switched to define BOMs
 * for several variants in one pass. Last wizard step → "Finish".
 * @param {{ ctx, onBack: () => void, onPrimary: () => void, primaryLabel: string }} props
 */
export function Step3Bom({ ctx, onBack, onPrimary, primaryLabel }) {
  const [variantId, setVariantId] = useState(ctx.variantId || '');

  const variantsQ = useQuery({
    queryKey: ['ProductVariants', ctx.productId],
    queryFn: () =>
      odataList('ProductVariants', { filter: `product_ID eq '${ctx.productId}'`, orderby: 'sku', top: 200 }),
    enabled: !!ctx.productId
  });
  const variants = variantsQ.data ?? [];

  // Default the target to the last-added (ctx) variant, else the first available.
  useEffect(() => {
    const list = variantsQ.data ?? [];
    if (!variantId && list.length) setVariantId(ctx.variantId || list[0].ID);
  }, [variantsQ.data, variantId, ctx.variantId]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardTitle>Bill of materials</CardTitle>
          <p className="mt-1 text-sm text-ink-muted">
            BOM is defined per variant. Pick a variant, add its components — or copy another
            variant&apos;s BOM as a starting point and adjust.
          </p>
          <div className="mt-4 max-w-sm">
            <FieldRow label="Variant" htmlFor="bom-variant">
              <Select
                id="bom-variant"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                options={[
                  { value: '', label: variants.length ? 'Select a variant…' : 'No variants — add one first' },
                  ...variants.map((v) => ({
                    value: v.ID,
                    label: [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID
                  }))
                ]}
              />
            </FieldRow>
          </div>
        </Card>

        {variantId && <BomEditor productId={ctx.productId} variantId={variantId} variants={variants} />}

        <div className="flex items-center justify-between border-t border-black/5 pt-5">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button type="button" onClick={onPrimary}>
            {primaryLabel}
          </Button>
        </div>
      </div>

      <Card>
        <CardTitle>This product</CardTitle>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Product</dt>
            <dd className="text-right text-ink">{ctx.productName || '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Variants</dt>
            <dd className="text-right text-ink">{variants.length}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-muted">
          Batches and the digital product passport are created later from each variant&apos;s
          batch view.
        </p>
      </Card>
    </div>
  );
}
