import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCreate } from '@/api/hooks';
import { ApiError, odataList } from '@/api/client';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { FormSection, FieldRow, Input, Select, SizeSelect } from '@/ui/Form';
import { validateGtin } from '@/lib/gtin';
import { ImageUpload } from '@/ui/ImageUpload';

const EMPTY = { color: '', size: '', sku: '', gtin: '', weight_g: '', image_url: '', image_data: '', status: 'active' };

/**
 * Add one or more variants to ctx.productId. Reused by the wizard and the focused
 * "add variant" page.
 * @param {{ ctx, setCtx, onPrimary: () => void, primaryLabel: string, onBack?: () => void }} props
 */
export function Step2Variant({ ctx, setCtx, onPrimary, primaryLabel, onBack }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  // Existing variants of this product (so the list reflects reality on re-entry too).
  const existing = useQuery({
    queryKey: ['ProductVariants', ctx.productId],
    queryFn: () =>
      odataList('ProductVariants', { filter: `product_ID eq '${ctx.productId}'`, orderby: 'sku', top: 200 }),
    enabled: !!ctx.productId
  });

  const create = useCreate('ProductVariants', {
    invalidate: [['ProductVariants', ctx.productId], ['Products', ctx.productId], ['Products']],
    onSuccess: (row) => {
      setCtx((c) => ({
        ...c,
        variantId: row.ID,
        variantLabel: [row.color, row.size].filter(Boolean).join(' / ') || row.sku
      }));
      setForm(EMPTY);
    }
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const add = () => {
    setError('');
    if (!form.sku.trim()) {
      setError('SKU is required for a variant.');
      return;
    }
    // Mirror VariantEdit so invalid input is caught here, with a clear message,
    // before the backend rejects it.
    const gtinError = validateGtin(form.gtin);
    if (gtinError) {
      setError(gtinError);
      return;
    }
    if (form.weight_g !== '' && Number(form.weight_g) <= 0) {
      setError('Weight must be a positive number (in grams).');
      return;
    }
    create.mutate(
      {
        product_ID: ctx.productId,
        color: form.color || null,
        size: form.size || null,
        sku: form.sku.trim(),
        gtin: form.gtin || null,
        weight_g: form.weight_g ? Number(form.weight_g) : null,
        image_url: form.image_url.trim() || null,
        image_data: form.image_data || null,
        status: form.status
      },
      { onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the variant.') }
    );
  };

  const variants = existing.data ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-6">
        {error && (
          <div className="mb-4">
            <Banner kind="error">{error}</Banner>
          </div>
        )}
        <FormSection
          title="Add variant"
          description="A variant is a concrete colour/size of the product, identified by a SKU. Add as many as you need."
        >
          <FieldRow label="Colour" visibility="public" htmlFor="color">
            <Input id="color" value={form.color} onChange={set('color')} placeholder="Blue" />
          </FieldRow>
          <FieldRow label="Size" visibility="public" htmlFor="size">
            <SizeSelect id="size" value={form.size} onChange={set('size')} />
          </FieldRow>
          <FieldRow label="SKU" required visibility="internal" htmlFor="sku">
            <Input id="sku" value={form.sku} onChange={set('sku')} placeholder="TSH-BLU-M" />
          </FieldRow>
          <FieldRow label="GTIN" visibility="internal" htmlFor="gtin">
            <Input id="gtin" value={form.gtin} onChange={set('gtin')} placeholder="1234567890123" />
          </FieldRow>
          <FieldRow label="Weight (g)" visibility="internal" htmlFor="weight"
            hint="Mass basis for rolling component CO₂/recycled content up to this product">
            <Input id="weight" type="number" value={form.weight_g} onChange={set('weight_g')} placeholder="180" />
          </FieldRow>
          <FieldRow label="Product image" visibility="public" htmlFor="img" className="md:col-span-2"
            hint="Colour-correct product image — shown top-right in the green header of the consumer passport.">
            <ImageUpload
              value={form.image_data || null}
              onChange={(dataUrl) => setForm((f) => ({ ...f, image_data: dataUrl ?? '' }))}
            />
            <Input
              id="img"
              className="mt-2"
              value={form.image_url}
              onChange={set('image_url')}
              placeholder="…or paste an image URL (https://…)"
            />
          </FieldRow>
          <FieldRow label="Status" visibility="internal" htmlFor="status">
            <Select
              id="status"
              value={form.status}
              onChange={set('status')}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'archived', label: 'Archived' }
              ]}
            />
          </FieldRow>
        </FormSection>

        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={create.isPending} onClick={add}>
            {create.isPending ? 'Adding…' : '+ Add variant'}
          </Button>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-black/5 pt-5">
          {onBack ? (
            <Button type="button" variant="ghost" onClick={onBack}>
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={onPrimary}>
            {primaryLabel}
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Variants of {ctx.productName || 'this product'}</CardTitle>
        <ul className="mt-3 space-y-1.5">
          {variants.map((v) => (
            <li key={v.ID} className="flex justify-between gap-3 text-sm">
              <span className="text-ink">{[v.color, v.size].filter(Boolean).join(' / ') || v.sku}</span>
              <span className="text-ink-muted">{v.sku}</span>
            </li>
          ))}
          {variants.length === 0 && <li className="text-sm text-ink-muted">No variants yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
