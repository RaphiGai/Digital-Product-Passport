import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { odataGet, odataList, ApiError } from '@/api/client';
import { useUpdate } from '@/api/hooks';
import { useHasRole } from '@/auth/useMe';
import { BATCH_CATALOGUE, catalogueByKey, mergeVisibility } from '@/lib/fieldCatalogue';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { FormSection, FieldRow, Input, Select, CountrySelect } from '@/ui/Form';
import { DocumentManager } from '@/ui/DocumentManager';

export function BatchEdit() {
  const { pid, vid, bid } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [fieldVis, setFieldVis] = useState(null);
  const [msg, setMsg] = useState(null);
  const isAdvanced = useHasRole('company_advanced');
  const BATCH_VIS = useMemo(() => catalogueByKey(BATCH_CATALOGUE), []);

  const visCtl = (key) => ({
    value: fieldVis?.[key] ?? 'public',
    onChange: (v) => setFieldVis((m) => ({ ...(m ?? {}), [key]: v })),
    locked: !!BATCH_VIS[key]?.locked,
    canEdit: isAdvanced
  });

  const today = new Date().toISOString().slice(0, 10);

  const toCo2Input = (value) => {
    if (value === null || value === undefined || value === '') return '';
    return String(value).replace('.', ',');
  };

  const co2ToNumber = (value) => Number(String(value).replace(',', '.'));

  const isPastDate = (value) => {
    if (!value) return true;
    return value < today;
  };

  const setCo2 = (e) => {
    let value = e.target.value;

    // only digits and comma
    value = value.replace(/[^\d,]/g, '');

    // only one comma
    const parts = value.split(',');
    if (parts.length > 2) {
      value = `${parts[0]},${parts.slice(1).join('')}`;
    }

    const [beforeComma = '', afterComma = ''] = value.split(',');

    // max 7 before comma, max 2 after comma
    const cleaned =
      value.includes(',')
        ? `${beforeComma.slice(0, 7)},${afterComma.slice(0, 2)}`
        : beforeComma.slice(0, 7);

    setForm((f) => ({ ...f, co2_footprint_kg: cleaned }));
  };

  const batchQ = useQuery({
    queryKey: ['Batches', 'one', bid],
    queryFn: () => odataGet('Batches', bid, { expand: ['factory', 'supplier'] })
  });
  const productQ = useQuery({
    queryKey: ['Products', pid, 'name'],
    queryFn: () => odataGet('Products', pid, { select: ['ID', 'name', 'product_type'] })
  });
  const variantQ = useQuery({
    queryKey: ['ProductVariants', 'one', vid],
    queryFn: () => odataGet('ProductVariants', vid)
  });
  const partnersQ = useQuery({
    queryKey: ['BusinessPartners', 'pickers'],
    queryFn: () => odataList('BusinessPartners', { orderby: 'name', top: 200 })
  });

  // Seed form once batch loads
  useEffect(() => {
    if (batchQ.data && !form) {
      const b = batchQ.data;
      setForm({
        batch_number:       b.batch_number ?? '',
        production_date:    b.production_date ?? '',
        country_of_origin:  b.country_of_origin ?? '',
        production_stage:   b.production_stage ?? '',
        factory_ID:         b.factory_ID ?? '',
        supplier_ID:        b.supplier_ID ?? '',
        co2_footprint_kg:   toCo2Input(b.co2_footprint_kg),
        recycled_content_pct: b.recycled_content_pct ?? '',
        status:             b.status ?? 'draft'
      });
      setFieldVis(mergeVisibility(BATCH_CATALOGUE, b.field_visibility));
    }
  }, [batchQ.data, form]);

  const update = useUpdate('Batches', {
    invalidate: [
      ['Batches', 'one', bid],
      ['Batches', vid],
      ['Batches', 'count', vid]
    ]
  });

  // Recycled content is a leaf-material input; a finished product's value is
  // computed (mass-weighted) from its BOM components, so it isn't entered here.
  const showRecycled = productQ.data?.product_type !== 'finished';

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = () => {
    setMsg(null);
    if (!form.batch_number.trim()) {
      setMsg({ kind: 'error', text: 'Batch number is required.' });
      return;
    }
    if (form.production_date && !isPastDate(form.production_date)) {
      setMsg({ kind: 'error', text: 'Production date must be in the past.' });
      return;
    }

    if (form.production_stage.trim().length > 60) {
      setMsg({ kind: 'error', text: 'Production stage can have maximum 60 characters.' });
      return;
    }

    if (
      form.co2_footprint_kg !== '' &&
      !/^\d{1,7}(,\d{1,2})?$/.test(form.co2_footprint_kg)
    ) {
      setMsg({
        kind: 'error',
        text: 'CO₂ footprint must have max. 7 digits before comma and max. 2 digits after comma.'
      });
      return;
    }
    if (form.recycled_content_pct !== '') {
      const rec = Number(form.recycled_content_pct);
      if (rec < 0 || rec > 100) {
        setMsg({ kind: 'error', text: 'Recycled content must be between 0 and 100 %.' });
        return;
      }
    }
    update.mutate(
      {
        key: bid,
        payload: {
          batch_number:         form.batch_number.trim(),
          production_date:      form.production_date || null,
          country_of_origin:    form.country_of_origin || null,
          production_stage:     form.production_stage || null,
          factory_ID:           form.factory_ID || null,
          supplier_ID:          form.supplier_ID || null,
          co2_footprint_kg:     form.co2_footprint_kg !== '' ? co2ToNumber(form.co2_footprint_kg) : null,
          recycled_content_pct: showRecycled && form.recycled_content_pct !== '' ? Number(form.recycled_content_pct) : null,
          status:               form.status,
          field_visibility:     JSON.stringify(fieldVis ?? {})
        }
      },
      {
        onSuccess: () => setMsg({ kind: 'success', text: 'Batch saved.' }),
        onError: (err) =>
          setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save.' })
      }
    );
  };

  if (batchQ.isLoading || !form) return <p className="text-ink-muted">Loading…</p>;
  if (!batchQ.data) return <p className="text-ink-muted">Batch not found.</p>;

  const variantLabel = variantQ.data
    ? [variantQ.data.color, variantQ.data.size].filter(Boolean).join(' / ') || variantQ.data.sku
    : 'Variant';

  const partnerOptions = [
    { value: '', label: '— none —' },
    ...(partnersQ.data ?? []).map((p) => ({ value: p.ID, label: p.name }))
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Products', to: '/products' },
          { label: productQ.data?.name ?? 'Product', to: `/products/${pid}` },
          { label: variantLabel, to: `/products/${pid}/variants/${vid}` },
          { label: 'Batches', to: `/products/${pid}/variants/${vid}/batches` },
          { label: form.batch_number || 'Edit batch' }
        ]}
      />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">
          Edit batch: {form.batch_number || batchQ.data.ID}
        </h1>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Card className="p-6">
        <FormSection
          title="Batch details"
          description="Production run information. Status controls DPP generation eligibility."
        >
          <FieldRow
            label="Batch number"
            visibilityControl={visCtl('batch_number')}
            htmlFor="Batch number"
          >
            <div className="rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700">
              {form.batch_number}
            </div>
          </FieldRow>
          <FieldRow label="Production date" visibilityControl={visCtl('production_date')} htmlFor="pd">
            <Input
              id="pd"
              type="date"
              max={today}
              value={form.production_date}
              onChange={set('production_date')}
            />
          </FieldRow>
          <FieldRow label="Country of origin" visibilityControl={visCtl('country_of_origin')} htmlFor="coo">
            <CountrySelect id="coo" value={form.country_of_origin} onChange={set('country_of_origin')} />
          </FieldRow>
          <FieldRow label="Production stage" visibility="internal" htmlFor="ps" hint="e.g. Cut & Sew">
            <Input
              id="ps"
              maxLength={60}
              value={form.production_stage}
              onChange={set('production_stage')}
              placeholder="Cut & Sew"
            /> 
          </FieldRow>
          <FieldRow label="Factory" visibility="internal" htmlFor="factory">
            <Select id="factory" value={form.factory_ID} onChange={set('factory_ID')} options={partnerOptions} />
          </FieldRow>
          <FieldRow label="Supplier" visibility="internal" htmlFor="supplier">
            <Select id="supplier" value={form.supplier_ID} onChange={set('supplier_ID')} options={partnerOptions} />
          </FieldRow>
          <FieldRow label="CO₂ footprint (own production)" visibilityControl={visCtl('co2_footprint_kg')} htmlFor="co2"
            hint="This product's OWN production, per its consumption unit: per finished piece for assembled/finished goods (added on top of components), per kg for a material sold by weight.">
            <Input
              id="co2"
              type="text"
              inputMode="decimal"
              maxLength={10}
              value={form.co2_footprint_kg}
              onChange={setCo2}
              placeholder="00,00"
            />
          </FieldRow>
          {showRecycled && (
            <FieldRow label="Recycled content (%)" visibilityControl={visCtl('recycled_content_pct')} htmlFor="rc"
              hint="Only for materials/components — a finished product's recycled content is computed from its BOM.">
              <Input id="rc" type="number" step="0.01" value={form.recycled_content_pct} onChange={set('recycled_content_pct')} />
            </FieldRow>
          )}
          <FieldRow label="Status" visibility="internal" htmlFor="status">
            <Select
              id="status"
              value={form.status}
              onChange={set('status')}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'approved', label: 'Approved' },
                { value: 'archived', label: 'Archived' }
              ]}
            />
          </FieldRow>
        </FormSection>

        <div className="flex justify-end gap-3 border-t border-black/5 pt-5">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/products/${pid}/variants/${vid}/batches`)}
          >
            Back to batches
          </Button>
          <Button type="button" disabled={update.isPending} onClick={save}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Card>

      {/* Certificates & proofs at batch level (e.g. per-run lab/test reports). */}
      <DocumentManager scope="batch" ownerId={bid} />
    </div>
  );
}
