import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { odataGet, odataList, odataCreate, newId, ApiError } from '@/api/client';
import { useCreate } from '@/api/hooks';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { DataTable } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { FormSection, FieldRow, Input, Select } from '@/ui/Form';

const EMPTY = {
  batch_number: '',
  production_date: '',
  country_of_origin: '',
  co2_footprint_kg: '',
  recycled_content_pct: '',
  factory_ID: ''
};

export function BatchView() {
  const { pid, vid } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  // supplier chosen per BOM line for the batch being added: { [bomId]: supplierId }
  const [componentSuppliers, setComponentSuppliers] = useState({});
  const [msg, setMsg] = useState(null);

  const variantQ = useQuery({ queryKey: ['ProductVariants', 'one', vid], queryFn: () => odataGet('ProductVariants', vid) });
  const productQ = useQuery({ queryKey: ['Products', pid, 'name'], queryFn: () => odataGet('Products', pid, { select: ['ID', 'name'] }) });

  const batchesQ = useQuery({
    queryKey: ['Batches', vid],
    queryFn: () =>
      odataList('Batches', { filter: `variant_ID eq '${vid}'`, expand: ['factory'], orderby: 'batch_number', top: 200 })
  });

  // Variant BOM lines → one supplier picker per component when adding a batch.
  const bomQ = useQuery({
    queryKey: ['ProductBOMs', vid],
    queryFn: () => odataList('ProductBOMs', { filter: `parent_ID eq '${vid}'`, top: 200 })
  });
  const productsQ = useQuery({
    queryKey: ['Products', 'bom-candidates'],
    queryFn: () => odataList('Products', { orderby: 'name', top: 200 })
  });
  const componentName = (id) => productsQ.data?.find((p) => p.ID === id)?.name ?? id;

  // Existing DPPs of this variant → map by batch so we can offer "open" vs "create".
  const dppsQ = useQuery({
    queryKey: ['DPPs', 'byVariant', vid],
    queryFn: () => odataList('DPPs', { filter: `variant_ID eq '${vid}'`, select: ['ID', 'batch_ID', 'status'], top: 200 })
  });
  const dppByBatch = {};
  (dppsQ.data ?? []).forEach((d) => {
    if (d.batch_ID) dppByBatch[d.batch_ID] = d;
  });

  const partnersQ = useQuery({
    queryKey: ['BusinessPartners', 'pickers'],
    queryFn: () => odataList('BusinessPartners', { orderby: 'name', top: 200 })
  });
  const partnerOptions = [
    { value: '', label: '— none —' },
    ...(partnersQ.data ?? []).map((p) => ({ value: p.ID, label: p.name }))
  ];

  const createDpp = useCreate('DPPs', { invalidate: [['DPPs', 'byVariant', vid], ['DPPs'], ['count', 'DPPs']] });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setSupplier = (bomId) => (e) =>
    setComponentSuppliers((m) => ({ ...m, [bomId]: e.target.value }));

  // Create the batch, then one BatchComponents row per BOM line that got a supplier.
  const addBatch = useMutation({
    mutationFn: async () => {
      const batch = await odataCreate('Batches', {
        ID: newId(),
        variant_ID: vid,
        batch_number: form.batch_number.trim(),
        production_date: form.production_date || null,
        country_of_origin: form.country_of_origin || null,
        co2_footprint_kg: form.co2_footprint_kg ? Number(form.co2_footprint_kg) : null,
        recycled_content_pct: form.recycled_content_pct ? Number(form.recycled_content_pct) : null,
        factory_ID: form.factory_ID || null,
        status: 'draft'
      });
      const entries = Object.entries(componentSuppliers).filter(([, s]) => s);
      await Promise.all(
        entries.map(([bomId, supplierId]) =>
          odataCreate('BatchComponents', { ID: newId(), batch_ID: batch.ID, bom_ID: bomId, supplier_ID: supplierId })
        )
      );
      return batch;
    },
    onSuccess: () => {
      setForm(EMPTY);
      setComponentSuppliers({});
      setMsg({ kind: 'success', text: 'Batch added.' });
      qc.invalidateQueries({ queryKey: ['Batches', vid] });
    },
    onError: (err) => setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not add batch.' })
  });

  const submit = (e) => {
    e.preventDefault();
    setMsg(null);
    if (!form.batch_number.trim()) {
      setMsg({ kind: 'error', text: 'Batch number is required.' });
      return;
    }
    addBatch.mutate();
  };

  const createDppFor = (batch) => {
    setMsg(null);
    createDpp.mutate(
      { product_ID: pid, variant_ID: vid, batch_ID: batch.ID, dpp_type: 'product', visibility: 'internal' },
      {
        onSuccess: (row) => navigate(`/dpps/${row.ID}`),
        onError: (err) => setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not create DPP.' })
      }
    );
  };

  const label = variantQ.data
    ? [variantQ.data.color, variantQ.data.size].filter(Boolean).join(' / ') || variantQ.data.sku
    : '';
  const bomLines = bomQ.data ?? [];

  const columns = [
    { header: 'Batch', cell: (b) => b.batch_number ?? b.ID },
    { header: 'Produced', cell: (b) => b.production_date ?? '—' },
    { header: 'Factory', cell: (b) => b.factory?.name ?? '—' },
    { header: 'Status', cell: (b) => <StatusBadge status={b.status} /> },
    {
      header: 'DPP',
      cell: (b) => {
        const dpp = dppByBatch[b.ID];
        return dpp ? (
          <Link to={`/dpps/${dpp.ID}`}>
            <Button variant="outline" size="sm">Open DPP</Button>
          </Link>
        ) : (
          <Button variant="primary" size="sm" disabled={createDpp.isPending} onClick={() => createDppFor(b)}>
            Create DPP
          </Button>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Products', to: '/products' },
          { label: productQ.data?.name ?? 'Product', to: `/products/${pid}` },
          { label: label || 'Variant', to: `/products/${pid}/variants/${vid}` },
          { label: 'Batches' }
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-ink">Batches — {label}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Add production batches (with per-component suppliers), then create the digital product
          passport (draft) per batch.
        </p>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Card className="p-0">
        <div className="px-5 pt-5">
          <CardTitle>Production batches</CardTitle>
        </div>
        <div className="mt-3">
          <DataTable columns={columns} rows={batchesQ.data ?? []} loading={batchesQ.isLoading} empty="No batches yet." />
        </div>
      </Card>

      <form onSubmit={submit}>
        <Card className="p-6">
          <FormSection title="Add batch" description="A concrete production run of this variant. Used daily.">
            <FieldRow label="Batch number" required visibility="internal" htmlFor="bn">
              <Input id="bn" value={form.batch_number} onChange={set('batch_number')} placeholder="2026-06-A" />
            </FieldRow>
            <FieldRow label="Production date" visibility="internal" htmlFor="pd">
              <Input id="pd" type="date" value={form.production_date} onChange={set('production_date')} />
            </FieldRow>
            <FieldRow label="Country of origin" visibility="public" htmlFor="coo">
              <Input id="coo" value={form.country_of_origin} onChange={set('country_of_origin')} placeholder="PT" />
            </FieldRow>
            <FieldRow label="Factory" visibility="internal" htmlFor="factory">
              <Select id="factory" value={form.factory_ID} onChange={set('factory_ID')} options={partnerOptions} />
            </FieldRow>
            <FieldRow label="CO₂ footprint (kg)" visibility="public" htmlFor="co2">
              <Input id="co2" type="number" step="0.001" value={form.co2_footprint_kg} onChange={set('co2_footprint_kg')} />
            </FieldRow>
            <FieldRow label="Recycled content (%)" visibility="public" htmlFor="rc">
              <Input id="rc" type="number" step="0.01" value={form.recycled_content_pct} onChange={set('recycled_content_pct')} />
            </FieldRow>
          </FormSection>

          <section className="border-t border-black/5 py-6">
            <h2 className="text-sm font-semibold text-ink">Component suppliers</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Assign the supplier that delivered each BOM component for this batch (optional).
            </p>
            <div className="mt-4 space-y-3">
              {bomLines.length === 0 && (
                <p className="text-sm text-ink-muted">
                  No bill of materials for this variant yet — add components in the variant editor.
                </p>
              )}
              {bomLines.map((line) => (
                <div key={line.ID} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1fr]">
                  <div className="text-sm text-ink">
                    {componentName(line.component_ID)}
                    {line.component_role && <span className="ml-2 text-xs text-ink-muted">{line.component_role}</span>}
                  </div>
                  <Select
                    value={componentSuppliers[line.ID] || ''}
                    onChange={setSupplier(line.ID)}
                    options={partnerOptions}
                  />
                </div>
              ))}
            </div>
          </section>

          <div className="flex justify-end border-t border-black/5 pt-5">
            <Button type="submit" disabled={addBatch.isPending}>
              {addBatch.isPending ? 'Adding…' : 'Add batch'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
