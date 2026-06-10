import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { odataGet, odataList, ApiError } from '@/api/client';
import { useUpdate } from '@/api/hooks';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { FormSection, FieldRow, Input, Select } from '@/ui/Form';
import { BomEditor } from '@/ui/BomEditor';

export function VariantEdit() {
  const { pid, vid } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);

  const variantQ = useQuery({
    queryKey: ['ProductVariants', 'one', vid],
    queryFn: () => odataGet('ProductVariants', vid)
  });
  const productQ = useQuery({
    queryKey: ['Products', pid, 'name'],
    queryFn: () => odataGet('Products', pid, { select: ['ID', 'name'] })
  });
  const siblingsQ = useQuery({
    queryKey: ['ProductVariants', pid],
    queryFn: () => odataList('ProductVariants', { filter: `product_ID eq '${pid}'`, orderby: 'sku', top: 200 })
  });

  // Seed the form once the variant loads.
  useEffect(() => {
    if (variantQ.data && !form) {
      const v = variantQ.data;
      setForm({
        color: v.color ?? '',
        size: v.size ?? '',
        sku: v.sku ?? '',
        gtin: v.gtin ?? '',
        weight_g: v.weight_g ?? '',
        image_url: v.image_url ?? '',
        status: v.status ?? 'active'
      });
    }
  }, [variantQ.data, form]);

  const update = useUpdate('ProductVariants', {
    invalidate: [['ProductVariants', 'one', vid], ['ProductVariants', pid], ['Products', pid], ['Products']]
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = () => {
    setMsg(null);
    if (!form.sku.trim()) {
      setMsg({ kind: 'error', text: 'SKU is required.' });
      return;
    }
    update.mutate(
      {
        key: vid,
        payload: {
          color: form.color || null,
          size: form.size || null,
          sku: form.sku.trim(),
          gtin: form.gtin || null,
          weight_g: form.weight_g === '' ? null : Number(form.weight_g),
          image_url: form.image_url?.trim() || null,
          status: form.status
        }
      },
      {
        onSuccess: () => setMsg({ kind: 'success', text: 'Variant saved.' }),
        onError: (err) => setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save.' })
      }
    );
  };

  if (variantQ.isLoading || !form) return <p className="text-ink-muted">Loading…</p>;
  if (!variantQ.data) return <p className="text-ink-muted">Variant not found.</p>;

  const label = [form.color, form.size].filter(Boolean).join(' / ') || form.sku;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Products', to: '/products' },
          { label: productQ.data?.name ?? 'Product', to: `/products/${pid}` },
          { label: label }
        ]}
      />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Variant: {label}</h1>
        <Link to={`/products/${pid}/variants/${vid}/batches`}>
          <Button variant="outline">Batches</Button>
        </Link>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Card className="p-6">
        <FormSection title="Variant details" description="Identifies a concrete colour/size of the product.">
          <FieldRow label="Colour" visibility="public" htmlFor="color">
            <Input id="color" value={form.color} onChange={set('color')} />
          </FieldRow>
          <FieldRow label="Size" visibility="public" htmlFor="size">
            <Input id="size" value={form.size} onChange={set('size')} />
          </FieldRow>
          <FieldRow label="SKU" required visibility="internal" htmlFor="sku">
            <Input id="sku" value={form.sku} onChange={set('sku')} />
          </FieldRow>
          <FieldRow label="GTIN" visibility="internal" htmlFor="gtin">
            <Input id="gtin" value={form.gtin} onChange={set('gtin')} />
          </FieldRow>
          <FieldRow label="Weight (g)" visibility="internal" htmlFor="weight"
            hint="Mass basis for rolling component CO₂/recycled content up to this product">
            <Input id="weight" type="number" value={form.weight_g} onChange={set('weight_g')} />
          </FieldRow>
          <FieldRow label="Image URL" visibility="public" htmlFor="img"
            hint="Colour-correct product image — shown in the consumer story for this variant.">
            <Input id="img" value={form.image_url} onChange={set('image_url')} />
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
        <div className="flex justify-end gap-3 border-t border-black/5 pt-5">
          <Button type="button" variant="outline" onClick={() => navigate(`/products/${pid}`)}>
            Back to product
          </Button>
          <Button type="button" disabled={update.isPending} onClick={save}>
            {update.isPending ? 'Saving…' : 'Save variant'}
          </Button>
        </div>
      </Card>

      <BomEditor productId={pid} variantId={vid} variants={siblingsQ.data ?? []} />
    </div>
  );
}
