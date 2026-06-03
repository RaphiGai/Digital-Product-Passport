import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { odataList, ApiError } from '@/api/client';
import { useCreate } from '@/api/hooks';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { FormSection, FieldRow, Input, Select } from '@/ui/Form';
import { WizardContext } from './Step2Variant';

const EMPTY = {
  batch_number: '',
  production_date: '',
  country_of_origin: '',
  production_stage: '',
  co2_footprint_kg: '',
  recycled_content_pct: '',
  factory_ID: '',
  supplier_ID: ''
};

export function Step4Batch({ ctx, setCtx, next, back }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const { data: partners } = useQuery({
    queryKey: ['BusinessPartners', 'batch-pickers'],
    queryFn: () => odataList('BusinessPartners', { orderby: 'name', top: 200 })
  });
  const partnerOptions = [
    { value: '', label: '— none —' },
    ...(partners ?? []).map((p) => ({ value: p.ID, label: p.name }))
  ];

  const create = useCreate('Batches', {
    invalidate: [['Products', ctx.productId]],
    onSuccess: (row) => {
      setCtx((c) => ({ ...c, batchId: row.ID }));
      next();
    }
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    setError('');
    if (!form.batch_number.trim()) {
      setError('Batch number is required.');
      return;
    }
    create.mutate(
      {
        variant_ID: ctx.variantId,
        batch_number: form.batch_number.trim(),
        production_date: form.production_date || null,
        country_of_origin: form.country_of_origin || null,
        production_stage: form.production_stage || null,
        co2_footprint_kg: form.co2_footprint_kg ? Number(form.co2_footprint_kg) : null,
        recycled_content_pct: form.recycled_content_pct ? Number(form.recycled_content_pct) : null,
        factory_ID: form.factory_ID || null,
        supplier_ID: form.supplier_ID || null,
        status: 'draft'
      },
      { onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the batch.') }
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
          title="Production batch"
          description="A batch is a concrete production run of the variant. Optional — you can skip and add batches later."
        >
          <FieldRow label="Batch number" required visibility="internal" htmlFor="bn">
            <Input id="bn" value={form.batch_number} onChange={set('batch_number')} placeholder="2026-05-A" />
          </FieldRow>
          <FieldRow label="Production date" visibility="internal" htmlFor="pd">
            <Input id="pd" type="date" value={form.production_date} onChange={set('production_date')} />
          </FieldRow>
          <FieldRow label="Country of origin" visibility="public" htmlFor="coo">
            <Input id="coo" value={form.country_of_origin} onChange={set('country_of_origin')} placeholder="PT" />
          </FieldRow>
          <FieldRow label="Production stage" visibility="internal" htmlFor="ps">
            <Input id="ps" value={form.production_stage} onChange={set('production_stage')} placeholder="Cut & Sew" />
          </FieldRow>
          <FieldRow label="CO₂ footprint (kg)" visibility="public" htmlFor="co2">
            <Input id="co2" type="number" step="0.001" value={form.co2_footprint_kg} onChange={set('co2_footprint_kg')} />
          </FieldRow>
          <FieldRow label="Recycled content (%)" visibility="public" htmlFor="rc">
            <Input id="rc" type="number" step="0.01" value={form.recycled_content_pct} onChange={set('recycled_content_pct')} />
          </FieldRow>
          <FieldRow label="Factory" visibility="internal" htmlFor="factory">
            <Select id="factory" value={form.factory_ID} onChange={set('factory_ID')} options={partnerOptions} />
          </FieldRow>
          <FieldRow label="Supplier" visibility="internal" htmlFor="supplier">
            <Select id="supplier" value={form.supplier_ID} onChange={set('supplier_ID')} options={partnerOptions} />
          </FieldRow>
        </FormSection>

        <div className="flex items-center justify-between border-t border-black/5 pt-5">
          <Button type="button" variant="ghost" onClick={back}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={next}>
              Skip
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Save & continue'}
            </Button>
          </div>
        </div>
      </Card>

      <WizardContext ctx={ctx} />
    </form>
  );
}
