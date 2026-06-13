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

const LIMITS = {
  color: 70,
  size: 30,
  gtin: 14,
  image_url: 500
};

export function VariantEdit() {
  const { pid, vid } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);

  const remaining = (value, max) => `${max - (value?.length ?? 0)} characters remaining`;

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
    queryFn: () =>
      odataList('ProductVariants', {
        filter: `product_ID eq '${pid}'`,
        orderby: 'sku',
        top: 200
      })
  });

  useEffect(() => {
    if (variantQ.data && !form) {
      const v = variantQ.data;
      setForm({
        color: v.color ?? '',
        size: v.size ?? '',
        gtin: v.gtin ?? '',
        weight_g: v.weight_g ?? '',
        image_url: v.image_url ?? '',
        status: v.status ?? 'active'
      });
    }
  }, [variantQ.data, form]);

  const update = useUpdate('ProductVariants', {
    invalidate: [
      ['ProductVariants', 'one', vid],
      ['ProductVariants', pid],
      ['Products', pid],
      ['Products']
    ]
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = () => {
    setMsg(null);

    if (form.gtin && form.gtin.length < 8) {
      setMsg({ kind: 'error', text: 'GTIN must contain at least 8 digits.' });
      return;
    }

    if (form.weight_g !== '' && Number(form.weight_g) <= 0) {
      setMsg({ kind: 'error', text: 'Weight must be a positive number (in grams).' });
      return;
    }

    if (form.image_url?.trim() && !/^https?:\/\//i.test(form.image_url.trim())) {
      setMsg({ kind: 'error', text: 'Image URL must start with https:// or http://.' });
      return;
    }

    update.mutate(
      {
        key: vid,
        payload: {
          color: form.color || null,
          size: form.size || null,
          gtin: form.gtin || null,
          weight_g: form.weight_g === '' ? null : Number(form.weight_g),
          image_url: form.image_url?.trim() || null,
          status: form.status
        }
      },
      {
        onSuccess: () => {
          navigate(`/products/${pid}/variants/${vid}/view`);
        },
        onError: (err) =>
          setMsg({
            kind: 'error',
            text: err instanceof ApiError ? err.message : 'Could not save.'
          })
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
        <FormSection
          title="Variant details"
          description="Identifies a concrete colour/size of the product."
        >
          <FieldRow
            label="SKU"
            visibility="internal"
            htmlFor="sku"
            hint="Automatically generated. Cannot be changed."
          >
            <div className="rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700">
              {variantQ.data?.sku}
            </div>
          </FieldRow>
          <FieldRow
            label="Colour"
            visibility="public"
            htmlFor="color"
            hint={remaining(form.color, LIMITS.color)}
          >
            <Input
              id="color"
              value={form.color}
              onChange={set('color')}
              maxLength={LIMITS.color}
            />
          </FieldRow>

          <FieldRow
            label="Size"
            visibility="public"
            htmlFor="size"
            hint={remaining(form.size, LIMITS.size)}
          >
            <Input
              id="size"
              value={form.size}
              onChange={set('size')}
              maxLength={LIMITS.size}
            />
          </FieldRow>

          

          <FieldRow
            label="GTIN"
            visibility="internal"
            htmlFor="gtin"
            hint={
              form.gtin && form.gtin.length < 8
                ? 'GTIN must contain at least 8 digits.'
                : remaining(form.gtin, LIMITS.gtin)
            }
          >
            <Input
              id="gtin"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={LIMITS.gtin}
              value={form.gtin}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  gtin: e.target.value.replace(/\D/g, '').slice(0, LIMITS.gtin)
                }))
              }
            />
          </FieldRow>

          <FieldRow
            label="Weight (g)"
            visibility="internal"
            htmlFor="weight"
            hint="Mass basis for rolling component CO₂/recycled content up to this product."
          >
            <Input
              id="weight"
              type="number"
              min="1"
              step="1"
              value={form.weight_g}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  weight_g: e.target.value.replace(/\D/g, '')
                }))
              }
            />
          </FieldRow>

          <FieldRow
            label="Image URL"
            visibility="public"
            htmlFor="img"
            hint={remaining(form.image_url, LIMITS.image_url)}
          >
            <Input
              id="img"
              value={form.image_url}
              onChange={set('image_url')}
              maxLength={LIMITS.image_url}
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

        <div className="flex justify-end gap-3 border-t border-black/5 pt-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/products/${pid}/variants/${vid}/view`)}
          >
            Cancel
          </Button>

          <Button type="button" disabled={update.isPending} onClick={save}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Card>

      <BomEditor productId={pid} variantId={vid} variants={siblingsQ.data ?? []} />
    </div>
  );
}