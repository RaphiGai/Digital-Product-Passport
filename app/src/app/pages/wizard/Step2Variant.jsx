import { useState } from 'react';
import { useCreate } from '@/api/hooks';
import { ApiError } from '@/api/client';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { FormSection, FieldRow, Input, Select } from '@/ui/Form';

const EMPTY = { color: '', size: '', sku: '', gtin: '', weight_g: '', status: 'active' };

export function Step2Variant({ ctx, setCtx, next, back }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const create = useCreate('ProductVariants', {
    invalidate: [['Products', ctx.productId]],
    onSuccess: (row) => {
      setCtx((c) => ({
        ...c,
        variantId: row.ID,
        variantLabel: [row.color, row.size].filter(Boolean).join(' / ') || row.sku
      }));
      next();
    }
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.sku.trim()) {
      setError('SKU is required for a variant.');
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
        status: form.status
      },
      { onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the variant.') }
    );
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-6">
        {error && (
          <div className="mb-4">
            <Banner kind="error">{error}</Banner>
          </div>
        )}
        <FormSection
          title="Add variant"
          description="A variant is a concrete colour/size of the product, identified by a SKU."
        >
          <FieldRow label="Colour" visibility="public" htmlFor="color">
            <Input id="color" value={form.color} onChange={set('color')} placeholder="Blue" />
          </FieldRow>
          <FieldRow label="Size" visibility="public" htmlFor="size">
            <Input id="size" value={form.size} onChange={set('size')} placeholder="M" />
          </FieldRow>
          <FieldRow label="SKU" required visibility="internal" htmlFor="sku">
            <Input id="sku" value={form.sku} onChange={set('sku')} placeholder="TSH-BLU-M" />
          </FieldRow>
          <FieldRow label="GTIN" visibility="internal" htmlFor="gtin">
            <Input id="gtin" value={form.gtin} onChange={set('gtin')} placeholder="1234567890123" />
          </FieldRow>
          <FieldRow label="Weight (g)" visibility="internal" htmlFor="weight">
            <Input id="weight" type="number" value={form.weight_g} onChange={set('weight_g')} placeholder="180" />
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

        <div className="flex items-center justify-between border-t border-black/5 pt-5">
          <Button type="button" variant="ghost" onClick={back}>
            Back
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Save & continue'}
          </Button>
        </div>
      </Card>

      <WizardContext ctx={ctx} />
    </form>
  );
}

/** Small shared context panel used by steps 2-5. */
export function WizardContext({ ctx }) {
  return (
    <Card>
      <CardTitle>This product</CardTitle>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Product</dt>
          <dd className="text-right text-ink">{ctx.productName || '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Variant</dt>
          <dd className="text-right text-ink">{ctx.variantLabel || '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">Batch</dt>
          <dd className="text-right text-ink">{ctx.batchId ? 'created' : '—'}</dd>
        </div>
      </dl>
    </Card>
  );
}
