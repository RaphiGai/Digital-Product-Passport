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

  const LIMITS = {
    name: 70,
    brand: 70,
    category: 60,
    model: 70,
    gtin: 14,
    description: 500,
    fibre_composition: 500,
    substances_of_concern: 500,
    country_of_origin: 2,
    care_instructions: 500,
    repair_instructions: 500,
    disposal_instructions: 500,
    reuse_instructions: 500,
    storytelling_title: 100,
    storytelling_body: 1000
  };

  const remaining = (value, max) => `${max - (value?.length ?? 0)} characters remaining`;

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
        } catch {
          /* ignore malformed storytelling JSON */
        }
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
        reuse_instructions: p.reuse_instructions ?? '',
        durability_score: p.durability_score ?? '',
        repairability_score: p.repairability_score ?? '',
        care_video_url: p.care_video_url ?? '',
        repair_video_url: p.repair_video_url ?? '',
        disposal_video_url: p.disposal_video_url ?? '',
        reuse_video_url: p.reuse_video_url ?? '',
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
    for (const [key, label] of [['durability_score', 'Durability'], ['repairability_score', 'Repairability']]) {
      const v = form[key];
      if (v !== '' && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > 10)) {
        setMsg({ kind: 'error', text: `${label} score must be a number between 0 and 10.` });
        return;
      }
    }
    const videoFields = ['care_video_url', 'repair_video_url', 'disposal_video_url', 'reuse_video_url'];
    for (const key of videoFields) {
      const v = form[key]?.trim();
      if (v && !/^https?:\/\//i.test(v)) {
        setMsg({ kind: 'error', text: 'Video links must start with https:// (or http://).' });
        return;
      }
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
          reuse_instructions: form.reuse_instructions || null,
          durability_score: form.durability_score === '' ? null : Number(form.durability_score),
          repairability_score: form.repairability_score === '' ? null : Number(form.repairability_score),
          care_video_url: form.care_video_url?.trim() || null,
          repair_video_url: form.repair_video_url?.trim() || null,
          disposal_video_url: form.disposal_video_url?.trim() || null,
          reuse_video_url: form.reuse_video_url?.trim() || null,
          status: form.status,
          espr_compliance: form.espr_compliance,
          storytelling: story.length ? JSON.stringify(story) : null
        }
      },
      {
        onSuccess: () => {
          setMsg({ kind: 'success', text: 'Product saved.' });
          navigate(`/products/${id}`);
        },
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
            <Input id="name" value={form.name} onChange={set('name')} maxLength={LIMITS.name} />
          </FieldRow>
          <FieldRow label="Brand" visibility="public" htmlFor="brand">
            <Input id="brand" value={form.brand} onChange={set('brand')} maxLength={LIMITS.brand} />
          </FieldRow>
          <FieldRow label="Category" visibility="public" htmlFor="category">
            <Input id="category" value={form.category} onChange={set('category')} maxLength={LIMITS.category} />
          </FieldRow>
          <FieldRow label="Model" visibility="public" htmlFor="model" hint="Season or model line.">
            <Input id="model" value={form.model} onChange={set('model')} maxLength={LIMITS.model} />
          </FieldRow>
          <FieldRow label="GTIN" visibility="internal" htmlFor="gtin">
            <Input
              id="gtin"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={14}
              value={form.gtin}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  gtin: e.target.value.replace(/\D/g, '')
                }))
              }
            />
          </FieldRow>
          <FieldRow
            label="Description"
            visibility="public"
            htmlFor="desc"
            className="md:col-span-2"
            hint={remaining(form.description, LIMITS.description)}
          >
            <Textarea id="desc" value={form.description} onChange={set('description')} maxLength={LIMITS.description} />
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
            hint={remaining(form.fibre_composition, LIMITS.fibre_composition)}
          >
            <Textarea id="fibre" value={form.fibre_composition} onChange={set('fibre_composition')} maxLength={LIMITS.fibre_composition} />
          </FieldRow>
          <FieldRow
            label="Substances of concern"
            visibility="public"
            htmlFor="soc"
            hint={remaining(form.substances_of_concern, LIMITS.substances_of_concern)}
          >
            <Textarea
              id="soc"
              value={form.substances_of_concern}
              onChange={set('substances_of_concern')}
              maxLength={LIMITS.substances_of_concern}
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
          title="Care, repair, reuse & end-of-life"
          description="Mandatory ESPR lifecycle information. All appear publicly. Each block can have an optional how-to video link, shown only when set."
        >
          <FieldRow label="Care & washing instructions" visibility="public" htmlFor="care" className="md:col-span-2" hint={remaining(form.care_instructions, LIMITS.care_instructions)}>
            <Textarea id="care" value={form.care_instructions} onChange={set('care_instructions')} maxLength={LIMITS.care_instructions} />
            <Input className="mt-2" value={form.care_video_url} onChange={set('care_video_url')} placeholder="Care/washing video link (optional, https://…)" />
          </FieldRow>
          <FieldRow label="Repair instructions" visibility="public" htmlFor="repair" hint={remaining(form.repair_instructions, LIMITS.repair_instructions)}>
            <Textarea id="repair" value={form.repair_instructions} onChange={set('repair_instructions')} maxLength={LIMITS.repair_instructions} />
            <Input className="mt-2" value={form.repair_video_url} onChange={set('repair_video_url')} placeholder="Repair video link (optional, https://…)" />
          </FieldRow>
          <FieldRow label="Disposal instructions" visibility="public" htmlFor="disposal" hint={remaining(form.disposal_instructions, LIMITS.disposal_instructions)}>
            <Textarea
              id="disposal"
              value={form.disposal_instructions}
              onChange={set('disposal_instructions')}
              maxLength={LIMITS.disposal_instructions}
            />
            <Input className="mt-2" value={form.disposal_video_url} onChange={set('disposal_video_url')} placeholder="Disposal video link (optional, https://…)" />
          </FieldRow>
          <FieldRow label="Reuse instructions" visibility="public" htmlFor="reuse" className="md:col-span-2" hint={remaining(form.reuse_instructions, LIMITS.reuse_instructions)}>
            <Textarea id="reuse" value={form.reuse_instructions} onChange={set('reuse_instructions')} maxLength={LIMITS.reuse_instructions} placeholder="Second-life / reuse guidance (resale, donation, repurposing…)" />
            <Input className="mt-2" value={form.reuse_video_url} onChange={set('reuse_video_url')} placeholder="Reuse video link (optional, https://…)" />
          </FieldRow>
        </FormSection>

        <FormSection
          title="Durability & repairability (ESPR)"
          description="ESPR scores on a 0–10 scale (one decimal). Shown publicly when set."
        >
          <FieldRow label="Durability score" visibility="public" htmlFor="durability" hint="0–10 (e.g. 8.5). Leave empty if not assessed.">
            <Input id="durability" type="number" min="0" max="10" step="0.1" value={form.durability_score} onChange={set('durability_score')} />
          </FieldRow>
          <FieldRow label="Repairability score" visibility="public" htmlFor="repairability" hint="0–10 (e.g. 7.0). Leave empty if not assessed.">
            <Input id="repairability" type="number" min="0" max="10" step="0.1" value={form.repairability_score} onChange={set('repairability_score')} />
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
                    maxLength={LIMITS.storytelling_title}
                  />

                  <p className="mt-1 text-xs text-ink-muted">
                    {remaining(s.title, LIMITS.storytelling_title)}
                  </p>

                  <Textarea
                    className="mt-2"
                    value={s.body}
                    onChange={setBlock(i, 'body')}
                    placeholder="Story text…"
                    maxLength={LIMITS.storytelling_body}
                  />

                  <p className="mt-1 text-xs text-ink-muted">
                    {remaining(s.body, LIMITS.storytelling_body)}
                  </p>
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
            Cancel
          </Button>
          <Button type="button" disabled={update.isPending} onClick={save}>
            {update.isPending ? 'Saving…' : 'Save product'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
