import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { odataGet, ApiError } from '@/api/client';
import { useUpdate } from '@/api/hooks';
import { PRODUCT_TYPES, PRODUCT_STATUSES, ESPR_STATUSES } from '@/lib/fieldCatalogue';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { FormSection, FieldRow, Input, Textarea, RadioCards, CountrySelect } from '@/ui/Form';

export function ProductEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);

  const productQ = useQuery({
    queryKey: ['Products', id],
    queryFn: () => odataGet('Products', id)
  });

  useEffect(() => {
    if (productQ.data && !form) {
      const p = productQ.data;
      let storytelling = [{ title: '', body: '' }];
      if (p.storytelling) {
        try {
          const parsed = JSON.parse(p.storytelling);
          if (Array.isArray(parsed) && parsed.length) storytelling = parsed;
        } catch {}
      }
      setForm({
        product_type: p.product_type ?? 'finished',
        name: p.name ?? '',
        brand: p.brand ?? '',
        category: p.category ?? '',
        model: p.model ?? '',
        gtin: p.gtin ?? '',
        description: p.description ?? '',
        fibre_composition: p.fibre_composition ?? '',
        substances_of_concern: p.substances_of_concern ?? '',
        country_of_origin: p.country_of_origin ?? '',
        care_instructions: p.care_instructions ?? '',
        repair_instructions: p.repair_instructions ?? '',
        disposal_instructions: p.disposal_instructions ?? '',
        status: p.status ?? 'draft',
        espr_compliance: p.espr_compliance ?? 'draft',
        storytelling
      });
    }
  }, [productQ.data, form]);

  const update = useUpdate('Products', {
    invalidate: [['Products', id], ['Products']]
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setVal = (key) => (v) => setForm((f) => ({ ...f, [key]: v }));

  const setBlock = (i, key) => (e) =>
    setForm((f) => ({
      ...f,
      storytelling: f.storytelling.map((s, idx) => (idx === i ? { ...s, [key]: e.target.value } : s))
    }));
  const addBlock = () =>
    setForm((f) => ({ ...f, storytelling: [...f.storytelling, { title: '', body: '' }] }));
  const removeBlock = (i) =>
    setForm((f) => ({ ...f, storytelling: f.storytelling.filter((_, idx) => idx !== i) }));

  const save = () => {
    setMsg(null);
    if (!form.name.trim()) {
      setMsg({ kind: 'error', text: 'Product name is required.' });
      return;
    }
    const story = form.storytelling
      .map((s) => ({ title: s.title.trim(), body: s.body.trim() }))
      .filter((s) => s.title || s.body);
    update.mutate(
      {
        key: id,
        payload: {
          product_type: form.product_type,
          name: form.name.trim(),
          brand: form.brand || null,
          category: form.category || null,
          model: form.model || null,
          gtin: form.gtin || null,
          description: form.description || null,
          fibre_composition: form.fibre_composition || null,
          substances_of_concern: form.substances_of_concern || null,
          country_of_origin: form.country_of_origin || null,
          care_instructions: form.care_instructions || null,
          repair_instructions: form.repair_instructions || null,
          disposal_instructions: form.disposal_instructions || null,
          status: form.status,
          espr_compliance: form.espr_compliance,
          storytelling: story.length ? JSON.stringify(story) : null
        }
      },
      {
        onSuccess: () => setMsg({ kind: 'success', text: 'Product saved.' }),
        onError: (err) =>
          setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save.' })
      }
    );
  };

  if (productQ.isLoading || !form) return <p className="text-ink-muted">Loading…</p>;
  if (!productQ.data) return <p className="text-ink-muted">Product not found.</p>;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Products', to: '/products' },
          { label: productQ.data.name, to: `/products/${id}` },
          { label: 'Edit' }
        ]}
      />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">{productQ.data.name}</h1>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Card className="p-6">
        <FormSection
          title="Product type"
          description="Determines ESPR requirements and which fields appear on the public DPP."
        >
          <div className="md:col-span-2">
            <RadioCards
              columns={4}
              value={form.product_type}
              onChange={setVal('product_type')}
              options={PRODUCT_TYPES}
            />
          </div>
        </FormSection>

        <FormSection
          title="Basic information"
          description="Name, Brand and Category appear publicly on the consumer DPP."
        >
          <FieldRow label="Product name" required visibility="public" htmlFor="name">
            <Input id="name" value={form.name} onChange={set('name')} />
          </FieldRow>
          <FieldRow label="Brand" visibility="public" htmlFor="brand">
            <Input id="brand" value={form.brand} onChange={set('brand')} />
          </FieldRow>
          <FieldRow label="Category" visibility="public" htmlFor="category">
            <Input id="category" value={form.category} onChange={set('category')} />
          </FieldRow>
          <FieldRow label="Model" visibility="public" htmlFor="model" hint="Season or model line.">
            <Input id="model" value={form.model} onChange={set('model')} />
          </FieldRow>
          <FieldRow label="GTIN" visibility="internal" htmlFor="gtin">
            <Input id="gtin" value={form.gtin} onChange={set('gtin')} />
          </FieldRow>
          <FieldRow
            label="Description"
            visibility="public"
            htmlFor="desc"
            className="md:col-span-2"
            hint="Max 500 characters."
          >
            <Textarea id="desc" value={form.description} onChange={set('description')} maxLength={500} />
          </FieldRow>
        </FormSection>

        <FormSection
          title="Material & composition"
          description="Mandatory for EU textile labelling and ESPR compliance. All appear publicly."
        >
          <FieldRow
            label="Fibre composition"
            visibility="public"
            htmlFor="fibre"
            hint="List all fibres with percentages and origin."
          >
            <Textarea id="fibre" value={form.fibre_composition} onChange={set('fibre_composition')} />
          </FieldRow>
          <FieldRow
            label="Substances of concern"
            visibility="public"
            htmlFor="soc"
            hint="Enter 'None' if no substances apply (REACH / SCIP)."
          >
            <Textarea
              id="soc"
              value={form.substances_of_concern}
              onChange={set('substances_of_concern')}
            />
          </FieldRow>
          <FieldRow
            label="Country of origin"
            visibility="public"
            htmlFor="coo"
            className="md:col-span-2"
          >
            <CountrySelect id="coo" value={form.country_of_origin} onChange={set('country_of_origin')} />
          </FieldRow>
        </FormSection>

        <FormSection
          title="Care, repair & end-of-life"
          description="Mandatory ESPR lifecycle information. All appear publicly."
        >
          <FieldRow label="Care instructions" visibility="public" htmlFor="care" className="md:col-span-2">
            <Textarea id="care" value={form.care_instructions} onChange={set('care_instructions')} />
          </FieldRow>
          <FieldRow label="Repair instructions" visibility="public" htmlFor="repair">
            <Textarea id="repair" value={form.repair_instructions} onChange={set('repair_instructions')} />
          </FieldRow>
          <FieldRow label="Disposal instructions" visibility="public" htmlFor="disposal">
            <Textarea
              id="disposal"
              value={form.disposal_instructions}
              onChange={set('disposal_instructions')}
            />
          </FieldRow>
        </FormSection>

        <FormSection
          title="Storytelling"
          description="Optional brand / sustainability story shown on the consumer passport. Add one or more blocks (title + text)."
        >
          <div className="space-y-3 md:col-span-2">
            {form.storytelling.map((s, i) => (
              <div key={i} className="rounded-lg border border-black/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                    Block {i + 1}
                  </span>
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
                <Input
                  value={s.title}
                  onChange={setBlock(i, 'title')}
                  placeholder="Title (e.g. Sustainable sourcing)"
                />
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

        <FormSection title="Product status" description="Internal only.">
          <div className="md:col-span-2">
            <RadioCards
              value={form.status}
              onChange={setVal('status')}
              options={PRODUCT_STATUSES}
            />
          </div>
        </FormSection>

        <FormSection
          title="ESPR compliance status"
          description="Compliance assessment for EU ESPR. Summary shown publicly."
        >
          <div className="md:col-span-2">
            <RadioCards
              value={form.espr_compliance}
              onChange={setVal('espr_compliance')}
              options={ESPR_STATUSES}
            />
          </div>
        </FormSection>

        <div className="flex justify-end gap-3 border-t border-black/5 pt-5">
          <Button type="button" variant="outline" onClick={() => navigate(`/products/${id}`)}>
            Back to product
          </Button>
          <Button type="button" disabled={update.isPending} onClick={save}>
            {update.isPending ? 'Saving…' : 'Save product'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
