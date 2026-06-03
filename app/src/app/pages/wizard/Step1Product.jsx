import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '@/auth/useMe';
import { useCreate } from '@/api/hooks';
import { ApiError } from '@/api/client';
import {
  PRODUCT_CATALOGUE,
  PRODUCT_TYPES,
  PRODUCT_STATUSES,
  ESPR_STATUSES
} from '@/lib/fieldCatalogue';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { FieldCatalogueAside } from '@/ui/FieldCatalogueAside';
import { FormSection, FieldRow, Input, Textarea, RadioCards } from '@/ui/Form';

const EMPTY = {
  product_type: 'finished',
  name: '',
  brand: '',
  category: '',
  model: '',
  gtin: '',
  description: '',
  fibre_composition: '',
  substances_of_concern: '',
  country_of_origin: '',
  care_instructions: '',
  repair_instructions: '',
  disposal_instructions: '',
  status: 'draft',
  espr_compliance: 'draft'
};

const REQUIRED = [
  'name',
  'brand',
  'category',
  'fibre_composition',
  'substances_of_concern',
  'country_of_origin',
  'care_instructions',
  'repair_instructions',
  'disposal_instructions'
];

export function Step1Product({ ctx, setCtx, next }) {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const create = useCreate('Products', {
    invalidate: [['Products'], ['count', 'Products']],
    onSuccess: (row) => {
      setCtx((c) => ({ ...c, productId: row.ID, productName: row.name }));
      next();
    }
  });

  // If we already created the product (came back to step 1), keep moving forward.
  const alreadyCreated = Boolean(ctx.productId);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (alreadyCreated) return next();
    setError('');
    const missing = REQUIRED.filter((k) => !String(form[k]).trim());
    if (missing.length) {
      setError(`Please fill all mandatory fields (${missing.length} missing).`);
      return;
    }
    create.mutate(
      { ...form, gtin: form.gtin || null, owning_organization_ID: me?.organizationId },
      { onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the product.') }
    );
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && <Banner kind="error">{error}</Banner>}
      {alreadyCreated && (
        <Banner kind="success">Product “{ctx.productName}” already created — continue to the variant.</Banner>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-6">
          <FormSection title="Product type" description="Determines ESPR requirements and which fields appear on the public DPP.">
            <div className="md:col-span-2">
              <RadioCards
                columns={4}
                value={form.product_type}
                onChange={(v) => setForm((f) => ({ ...f, product_type: v }))}
                options={PRODUCT_TYPES}
              />
            </div>
          </FormSection>

          <FormSection title="Basic information" description="Name, Brand and Category appear publicly on the consumer DPP.">
            <FieldRow label="Product name" required visibility="public" htmlFor="name">
              <Input id="name" value={form.name} onChange={set('name')} placeholder="Classic T-Shirt" />
            </FieldRow>
            <FieldRow label="Brand" required visibility="public" htmlFor="brand">
              <Input id="brand" value={form.brand} onChange={set('brand')} placeholder="FashionCo" />
            </FieldRow>
            <FieldRow label="Category" required visibility="public" htmlFor="category">
              <Input id="category" value={form.category} onChange={set('category')} placeholder="Apparel / T-Shirt" />
            </FieldRow>
            <FieldRow label="Model" visibility="public" htmlFor="model" hint="Season or model line.">
              <Input id="model" value={form.model} onChange={set('model')} placeholder="AW 2025" />
            </FieldRow>
            <FieldRow label="GTIN" visibility="internal" htmlFor="gtin">
              <Input id="gtin" value={form.gtin} onChange={set('gtin')} placeholder="1234567890123" />
            </FieldRow>
            <FieldRow label="Description" visibility="public" htmlFor="desc" className="md:col-span-2" hint="Max 500 characters.">
              <Textarea id="desc" value={form.description} onChange={set('description')} maxLength={500} />
            </FieldRow>
          </FormSection>

          <FormSection title="Material & composition" description="Mandatory for EU textile labelling and ESPR compliance. All appear publicly.">
            <FieldRow label="Fibre composition" required visibility="public" htmlFor="fibre" hint="List all fibres with percentages and origin.">
              <Textarea id="fibre" value={form.fibre_composition} onChange={set('fibre_composition')} />
            </FieldRow>
            <FieldRow label="Substances of concern" required visibility="public" htmlFor="soc" hint="Enter 'None' if no substances apply (REACH / SCIP).">
              <Textarea id="soc" value={form.substances_of_concern} onChange={set('substances_of_concern')} />
            </FieldRow>
            <FieldRow label="Country of origin" required visibility="public" htmlFor="coo" className="md:col-span-2">
              <Input id="coo" value={form.country_of_origin} onChange={set('country_of_origin')} placeholder="Portugal (PT)" />
            </FieldRow>
          </FormSection>

          <FormSection title="Care, repair & end-of-life" description="Mandatory ESPR lifecycle information. All appear publicly.">
            <FieldRow label="Care instructions" required visibility="public" htmlFor="care" className="md:col-span-2">
              <Textarea id="care" value={form.care_instructions} onChange={set('care_instructions')} />
            </FieldRow>
            <FieldRow label="Repair instructions" required visibility="public" htmlFor="repair">
              <Textarea id="repair" value={form.repair_instructions} onChange={set('repair_instructions')} />
            </FieldRow>
            <FieldRow label="Disposal instructions" required visibility="public" htmlFor="disposal">
              <Textarea id="disposal" value={form.disposal_instructions} onChange={set('disposal_instructions')} />
            </FieldRow>
          </FormSection>

          <FormSection title="Product status" description="Defaults to Draft on creation. Internal only.">
            <div className="md:col-span-2">
              <RadioCards value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v }))} options={PRODUCT_STATUSES} />
            </div>
          </FormSection>

          <FormSection title="ESPR compliance status" description="Compliance assessment for EU ESPR. Summary shown publicly.">
            <div className="md:col-span-2">
              <RadioCards value={form.espr_compliance} onChange={(v) => setForm((f) => ({ ...f, espr_compliance: v }))} options={ESPR_STATUSES} />
            </div>
          </FormSection>

          <div className="flex items-center justify-end gap-3 border-t border-black/5 pt-5">
            <Button type="button" variant="outline" onClick={() => navigate('/products')}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Save & continue'}
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>Live preview</CardTitle>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Name', form.name],
                ['Brand', form.brand],
                ['Type', PRODUCT_TYPES.find((t) => t.value === form.product_type)?.label],
                ['Category', form.category],
                ['Country of origin', form.country_of_origin],
                ['Product status', form.status],
                ['ESPR status', form.espr_compliance]
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="text-right text-ink">{val || '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <FieldCatalogueAside fields={PRODUCT_CATALOGUE} />
        </div>
      </div>
    </form>
  );
}
