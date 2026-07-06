import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useMe } from '@/auth/useMe';
import { useCreate } from '@/api/hooks';
import { ApiError, odataList } from '@/api/client';
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
import { FormSection, FieldRow, Input, Textarea, RadioCards, CountrySelect, Select } from '@/ui/Form';

const EMPTY = {
  product_type: 'finished',
  name: '',
  brand: '',
  category_code: '',
  model: '',
  gtin: '',
  upc: '',
  ean: '',
  description: '',
  fibre_composition: '',
  substances_of_concern: '',
  country_of_origin: '',
  care_instructions: '',
  repair_instructions: '',
  disposal_instructions: '',
  reuse_instructions: '',
  durability_score: '',
  repairability_score: '',
  care_video_url: '',
  repair_video_url: '',
  disposal_video_url: '',
  reuse_video_url: '',
  care_products_url: '',
  repair_products_url: '',
  reuse_products_url: '',
  disposal_products_url: '',
  status: 'draft',
  espr_compliance: 'draft',
  storytelling: [{ title: '', body: '' }]
};

const REQUIRED = [
  'name',
  'brand',
  'category_code',
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

  // Category options from the ProductCategories code list (single source of truth).
  const categoriesQ = useQuery({
    queryKey: ['ProductCategories'],
    queryFn: () => odataList('ProductCategories', { select: ['code', 'name'], orderby: 'name' })
  });
  const categoryOptions = categoriesQ.data ?? [];

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

  // Storytelling block editor — serialized to a JSON array string on submit.
  const setBlock = (i, key) => (e) =>
    setForm((f) => ({
      ...f,
      storytelling: f.storytelling.map((s, idx) => (idx === i ? { ...s, [key]: e.target.value } : s))
    }));
  const addBlock = () => setForm((f) => ({ ...f, storytelling: [...f.storytelling, { title: '', body: '' }] }));
  const removeBlock = (i) =>
    setForm((f) => ({ ...f, storytelling: f.storytelling.filter((_, idx) => idx !== i) }));

  const submit = (e) => {
    e.preventDefault();
    if (alreadyCreated) return next();
    setError('');
    const missing = REQUIRED.filter((k) => !String(form[k]).trim());
    if (missing.length) {
      setError(`Please fill all mandatory fields (${missing.length} missing).`);
      return;
    }
    for (const [key, label] of [['durability_score', 'Durability'], ['repairability_score', 'Repairability']]) {
      const v = form[key];
      if (v !== '' && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > 10)) {
        setError(`${label} score must be a number between 0 and 10.`);
        return;
      }
    }
    for (const key of [
      'care_video_url', 'repair_video_url', 'disposal_video_url', 'reuse_video_url',
      'care_products_url', 'repair_products_url', 'reuse_products_url', 'disposal_products_url'
    ]) {
      const v = form[key]?.trim();
      if (v && !/^https?:\/\//i.test(v)) {
        setError('Links must start with https:// (or http://).');
        return;
      }
    }
    const story = form.storytelling
      .map((s) => ({ title: s.title.trim(), body: s.body.trim() }))
      .filter((s) => s.title || s.body);
    create.mutate(
      {
        ...form,
        gtin: form.gtin || null,
        upc: form.upc || null,
        ean: form.ean || null,
        reuse_instructions: form.reuse_instructions || null,
        durability_score: form.durability_score === '' ? null : Number(form.durability_score),
        repairability_score: form.repairability_score === '' ? null : Number(form.repairability_score),
        care_video_url: form.care_video_url?.trim() || null,
        repair_video_url: form.repair_video_url?.trim() || null,
        disposal_video_url: form.disposal_video_url?.trim() || null,
        reuse_video_url: form.reuse_video_url?.trim() || null,
        care_products_url: form.care_products_url?.trim() || null,
        repair_products_url: form.repair_products_url?.trim() || null,
        reuse_products_url: form.reuse_products_url?.trim() || null,
        disposal_products_url: form.disposal_products_url?.trim() || null,
        storytelling: story.length ? JSON.stringify(story) : null,
        owning_organization_ID: me?.organizationId
      },
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
              <Select
                id="category"
                value={form.category_code}
                onChange={set('category_code')}
                options={[
                  { value: '', label: 'Select category…' },
                  ...categoryOptions.map((c) => ({ value: c.code, label: c.name }))
                ]}
              />
            </FieldRow>
            <FieldRow label="Model" visibility="public" htmlFor="model" hint="Season or model line.">
              <Input id="model" value={form.model} onChange={set('model')} placeholder="AW 2025" />
            </FieldRow>
            <FieldRow label="GTIN" visibility="internal" htmlFor="gtin">
              <Input id="gtin" value={form.gtin} onChange={set('gtin')} placeholder="1234567890123" />
            </FieldRow>
            <FieldRow label="UPC" visibility="internal" htmlFor="upc" hint="Universal Product Code (optional).">
              <Input id="upc" value={form.upc} onChange={set('upc')} placeholder="012345678905" />
            </FieldRow>
            <FieldRow label="EAN" visibility="internal" htmlFor="ean" hint="European Article Number (optional).">
              <Input id="ean" value={form.ean} onChange={set('ean')} placeholder="4012345678901" />
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
              <CountrySelect id="coo" value={form.country_of_origin} onChange={set('country_of_origin')} />
            </FieldRow>
          </FormSection>

          <FormSection title="Care, repair, reuse & end-of-life" description="Mandatory ESPR lifecycle information. All appear publicly. Each block can have an optional how-to video link and a “recommended products” shop link, shown only when set.">
            <FieldRow label="Care & washing instructions" required visibility="public" htmlFor="care" className="md:col-span-2">
              <Textarea id="care" value={form.care_instructions} onChange={set('care_instructions')} />
              <Input className="mt-2" value={form.care_video_url} onChange={set('care_video_url')} placeholder="Care/washing video link (optional, https://…)" />
              <Input className="mt-2" value={form.care_products_url} onChange={set('care_products_url')} placeholder="Recommended products link (optional, https://…)" />
            </FieldRow>
            <FieldRow label="Repair instructions" required visibility="public" htmlFor="repair">
              <Textarea id="repair" value={form.repair_instructions} onChange={set('repair_instructions')} />
              <Input className="mt-2" value={form.repair_video_url} onChange={set('repair_video_url')} placeholder="Repair video link (optional, https://…)" />
              <Input className="mt-2" value={form.repair_products_url} onChange={set('repair_products_url')} placeholder="Recommended products link (optional, https://…)" />
            </FieldRow>
            <FieldRow label="Disposal instructions" required visibility="public" htmlFor="disposal">
              <Textarea id="disposal" value={form.disposal_instructions} onChange={set('disposal_instructions')} />
              <Input className="mt-2" value={form.disposal_video_url} onChange={set('disposal_video_url')} placeholder="Disposal video link (optional, https://…)" />
              <Input className="mt-2" value={form.disposal_products_url} onChange={set('disposal_products_url')} placeholder="Recommended products link (optional, https://…)" />
            </FieldRow>
            <FieldRow label="Reuse instructions" visibility="public" htmlFor="reuse" className="md:col-span-2" hint="Second-life / reuse guidance (resale, donation, repurposing…).">
              <Textarea id="reuse" value={form.reuse_instructions} onChange={set('reuse_instructions')} />
              <Input className="mt-2" value={form.reuse_video_url} onChange={set('reuse_video_url')} placeholder="Reuse video link (optional, https://…)" />
              <Input className="mt-2" value={form.reuse_products_url} onChange={set('reuse_products_url')} placeholder="Recommended products link (optional, https://…)" />
            </FieldRow>
          </FormSection>

          <FormSection title="Durability & repairability (ESPR)" description="ESPR scores on a 0–10 scale (one decimal). Shown publicly when set.">
            <FieldRow label="Durability score" visibility="public" htmlFor="durability" hint="0–10 (e.g. 8.5). Leave empty if not assessed.">
              <Input id="durability" type="number" min="0" max="10" step="0.1" value={form.durability_score} onChange={set('durability_score')} placeholder="8.5" />
            </FieldRow>
            <FieldRow label="Repairability score" visibility="public" htmlFor="repairability" hint="0–10 (e.g. 7.0). Leave empty if not assessed.">
              <Input id="repairability" type="number" min="0" max="10" step="0.1" value={form.repairability_score} onChange={set('repairability_score')} placeholder="7.0" />
            </FieldRow>
          </FormSection>

          <FormSection title="Storytelling" description="Optional brand / sustainability story shown on the consumer passport. Add one or more blocks (title + text). The colour-correct image is set per variant.">
            <div className="space-y-3 md:col-span-2">
              {form.storytelling.map((s, i) => (
                <div key={i} className="rounded-lg border border-black/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Block {i + 1}</span>
                    {form.storytelling.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBlock(i)}
                        className="text-xs text-ink-muted hover:text-red-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <Input value={s.title} onChange={setBlock(i, 'title')} placeholder="Title (e.g. Sustainable sourcing)" />
                  <Textarea
                    className="mt-2"
                    value={s.body}
                    onChange={setBlock(i, 'body')}
                    placeholder="Story text…"
                    maxLength={1000}
                  />
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addBlock}>
                + Add story block
              </Button>
            </div>
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
                ['Category', categoryOptions.find((c) => c.code === form.category_code)?.name],
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
