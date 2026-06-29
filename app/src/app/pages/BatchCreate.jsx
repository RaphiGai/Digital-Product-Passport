import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { odataGet, odataList, odataCreate, newId, ApiError } from '@/api/client';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { FormSection, FieldRow, Input, Select, CountrySelect, CheckboxCard } from '@/ui/Form';
import { RequireRole } from '@/auth/RequireRole';

const EMPTY = {
  batch_number: '',
  production_date: '',
  production_stage: '',
  country_of_origin: '',
  co2_footprint_kg: '00,00',
  recycled_content_pct: '',
  factory_ID: '',
  supplier_ID: ''
};

const isExternalLine = (b) => !!b.external_dpp_url || !b.component_ID;

function pickDefaultComponentBatch(candidates) {
  if (!candidates?.length) return null;

  const byDateDesc = [...candidates].sort((a, b) =>
    String(b.production_date || '').localeCompare(String(a.production_date || ''))
  );

  return byDateDesc.find((c) => c.status === 'approved') ?? byDateDesc[0];
}

function BatchSourcingPicker({
  boms,
  batchesFor,
  nameOf,
  loadingBatches,
  selectionFor,
  onToggleBatch,
  onSetExtNo,
  disabled
}) {
  return (
    <div className="space-y-4">
      {boms.map((b) => {
        const external = isExternalLine(b);
        const sel = selectionFor(b.ID);
        const label = (b.component_ID ? nameOf(b.component_ID) : b.component_name) || '—';
        const candidates = batchesFor(b.component_ID);

        return (
          <div key={b.ID} className="rounded-lg border border-black/5 bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
              <span>{label}</span>

              {b.component_role && (
                <span className="text-xs font-normal text-ink-muted">
                  {b.component_role}
                </span>
              )}

              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-normal text-ink-muted">
                {external ? 'External' : 'Internal'}
              </span>
            </div>

            {external ? (
              <FieldRow
                label="Supplier batch number"
                htmlFor={`extbn-${b.ID}`}
                hint="Traceability info only — footprint values come from the BOM line."
              >
                <Input
                  id={`extbn-${b.ID}`}
                  key={`extbn-${b.ID}-${sel.extNo}`}
                  defaultValue={sel.extNo}
                  maxLength={40}
                  placeholder="e.g. ELA-2026-04"
                  disabled={disabled}
                  onBlur={(e) => onSetExtNo(b.ID, e.target.value.trim())}
                />
              </FieldRow>
            ) : loadingBatches ? (
              <p className="text-xs text-ink-muted">Loading batches…</p>
            ) : candidates.length ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {candidates.map((cb) => (
                  <CheckboxCard
                    key={cb.ID}
                    checked={sel.batchIds.has(cb.ID)}
                    onChange={(on) => onToggleBatch(b.ID, cb.ID, on)}
                    title={cb.batch_number || cb.ID}
                    hint={cb.status}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-600">
                No production batches for this component yet.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function useVariantSourcing(vid) {
  const bomsQ = useQuery({
    queryKey: ['ProductBOMs', 'variant', vid],
    queryFn: () =>
      odataList('ProductBOMs', {
        filter: `parent_ID eq '${vid}'`,
        top: 200
      }),
    enabled: !!vid
  });

  const productsQ = useQuery({
    queryKey: ['Products', 'sourcing-names'],
    queryFn: () =>
      odataList('Products', {
        select: ['ID', 'name'],
        orderby: 'name',
        top: 500
      })
  });

  const boms = bomsQ.data ?? [];
  const componentIds = [...new Set(boms.map((b) => b.component_ID).filter(Boolean))];

  const compBatchesQ = useQuery({
    queryKey: ['Batches', 'component-candidates', componentIds.join(',')],
    queryFn: () =>
      odataList('Batches', {
        filter: componentIds.map((id) => `variant/product_ID eq '${id}'`).join(' or '),
        expand: ['variant'],
        orderby: 'batch_number',
        top: 500
      }),
    enabled: componentIds.length > 0
  });

  const componentBatches = compBatchesQ.data ?? [];

  return {
    boms,
    componentBatches,
    nameOf: (id) => productsQ.data?.find((p) => p.ID === id)?.name ?? id,
    batchesFor: (componentId) =>
      componentBatches.filter((b) => b.variant?.product_ID === componentId),
    loadingBatches: compBatchesQ.isLoading
  };
}

function formatCo2Input(value) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (!digits) return '00,00';

  const padded = digits.padStart(3, '0');
  const whole = padded.slice(0, -2);
  const decimal = padded.slice(-2);

  return `${whole},${decimal}`;
}

function parseCo2(value) {
  return Number(value.replace(',', '.'));
}

function isPastDate(value) {
  if (!value) return true;

  const selected = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return selected < today;
}

export function BatchCreate() {
  const { pid, vid } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState(null);
  const [sourcing, setSourcing] = useState({});

  const productQ = useQuery({
    queryKey: ['Products', pid, 'name'],
    queryFn: () =>
      odataGet('Products', pid, {
        select: ['ID', 'name', 'product_type']
      }),
    enabled: !!pid
  });

  const variantQ = useQuery({
    queryKey: ['ProductVariants', 'one', vid],
    queryFn: () => odataGet('ProductVariants', vid),
    enabled: !!vid
  });

  const batchesQ = useQuery({
    queryKey: ['Batches', vid],
    queryFn: () =>
      odataList('Batches', {
        filter: `variant_ID eq '${vid}'`,
        top: 200
      }),
    enabled: !!vid
  });

  const partnersQ = useQuery({
    queryKey: ['BusinessPartners', 'pickers'],
    queryFn: () =>
      odataList('BusinessPartners', {
        orderby: 'name',
        top: 200
      })
  });

  const {
    boms,
    componentBatches,
    nameOf,
    batchesFor,
    loadingBatches
  } = useVariantSourcing(vid);

  const partnerOptions = [
    { value: '', label: '— none —' },
    ...(partnersQ.data ?? []).map((p) => ({
      value: p.ID,
      label: p.name
    }))
  ];

  const showRecycled = productQ.data?.product_type !== 'finished';

  const buildInitialSourcing = useCallback(() => {
    const init = {};

    for (const b of boms) {
      if (isExternalLine(b)) {
        init[b.ID] = {
          batchIds: new Set(),
          extNo: ''
        };
        continue;
      }

      const candidates = componentBatches.filter(
        (cb) => cb.variant?.product_ID === b.component_ID
      );

      const def = pickDefaultComponentBatch(candidates);

      init[b.ID] = {
        batchIds: new Set(def ? [def.ID] : []),
        extNo: ''
      };
    }

    return init;
  }, [boms, componentBatches]);

  useEffect(() => {
    if (!boms.length || loadingBatches) return;

    setSourcing((prev) =>
      Object.keys(prev).length ? prev : buildInitialSourcing()
    );
  }, [boms, loadingBatches, buildInitialSourcing]);

  const set = (key) => (e) => {
    const value = e.target.value;

    if (key === 'co2_footprint_kg') {
      setForm((f) => ({
        ...f,
        [key]: formatCo2Input(value)
      }));
      return;
    }

    setForm((f) => ({
      ...f,
      [key]: value
    }));
  };

  const toggleSourcingBatch = (bomId, batchId, on) => {
    setSourcing((prev) => {
      const cur = prev[bomId] ?? {
        batchIds: new Set(),
        extNo: ''
      };

      const batchIds = new Set(cur.batchIds);

      if (on) batchIds.add(batchId);
      else batchIds.delete(batchId);

      return {
        ...prev,
        [bomId]: {
          ...cur,
          batchIds
        }
      };
    });
  };

  const setSourcingExtNo = (bomId, value) => {
    setSourcing((prev) => ({
      ...prev,
      [bomId]: {
        ...(prev[bomId] ?? { batchIds: new Set() }),
        extNo: value
      }
    }));
  };

  const addBatch = useMutation({
    mutationFn: async () => {
      const batchId = newId();

      await odataCreate('Batches', {
        ID: batchId,
        variant_ID: vid,
        batch_number: form.batch_number.trim(),
        production_date: form.production_date || null,
        production_stage: form.production_stage.trim() || null,
        country_of_origin: form.country_of_origin || null,
        co2_footprint_kg: parseCo2(form.co2_footprint_kg),
        recycled_content_pct:
          showRecycled && form.recycled_content_pct !== ''
            ? Number(form.recycled_content_pct)
            : null,
        factory_ID: form.factory_ID || null,
        supplier_ID: form.supplier_ID || null,
        status: 'draft'
      });

      for (const b of boms) {
        const sel = sourcing[b.ID];
        if (!sel) continue;

        if (isExternalLine(b)) {
          if (sel.extNo) {
            await odataCreate('BatchComponents', {
              ID: newId(),
              batch_ID: batchId,
              bom_ID: b.ID,
              external_batch_number: sel.extNo
            });
          }
        } else {
          for (const cbId of sel.batchIds) {
            await odataCreate('BatchComponents', {
              ID: newId(),
              batch_ID: batchId,
              bom_ID: b.ID,
              component_batch_ID: cbId
            });
          }
        }
      }

      return batchId;
    },
    onSuccess: (batchId) => {
      qc.invalidateQueries({ queryKey: ['Batches', vid] });
      qc.invalidateQueries({ queryKey: ['BatchComponents'] });
      navigate(`/products/${pid}/variants/${vid}/batches/${batchId}`);
    },
    onError: (err) => {
      setMsg({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Could not add batch.'
      });
    }
  });

  const submit = (e) => {
    e.preventDefault();
    setMsg(null);

    const batchNumber = form.batch_number.trim();
    const productionStage = form.production_stage.trim();

    if (!batchNumber) {
      setMsg({ kind: 'error', text: 'Batch number is required.' });
      return;
    }

    if (batchNumber.length > 40) {
      setMsg({
        kind: 'error',
        text: 'Batch number can have maximum 40 characters.'
      });
      return;
    }

    if (productionStage.length > 60) {
      setMsg({
        kind: 'error',
        text: 'Production stage can have maximum 60 characters.'
      });
      return;
    }

    const exists = (batchesQ.data ?? []).some(
      (b) => b.batch_number?.trim().toLowerCase() === batchNumber.toLowerCase()
    );

    if (exists) {
      setMsg({
        kind: 'error',
        text: 'This batch number already exists.'
      });
      return;
    }

    if (!isPastDate(form.production_date)) {
      setMsg({
        kind: 'error',
        text: 'Production date must be in the past.'
      });
      return;
    }

    if (form.recycled_content_pct !== '') {
      const rec = Number(form.recycled_content_pct);

      if (Number.isNaN(rec) || rec < 0 || rec > 100) {
        setMsg({
          kind: 'error',
          text: 'Recycled content must be between 0 and 100 %.'
        });
        return;
      }
    }

    addBatch.mutate();
  };

  const label = variantQ.data
    ? [variantQ.data.color, variantQ.data.size].filter(Boolean).join(' / ') ||
      variantQ.data.sku
    : '';

  return (
    <RequireRole role="company_advanced">
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: 'Dashboard', to: '/' },
            { label: 'Products', to: '/products' },
            {
              label: productQ.data?.name ?? 'Product',
              to: `/products/${pid}`
            },
            {
              label: label || 'Variant',
              to: `/products/${pid}/variants/${vid}`
            },
            {
              label: 'Batches',
              to: `/products/${pid}/variants/${vid}/batches`
            },
            { label: 'Add Batch' }
          ]}
        />

        <div>
          <h1 className="text-2xl font-semibold text-ink">Add Batch</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Create a new production batch for this variant.
          </p>
        </div>

        {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

        <form onSubmit={submit}>
          <Card className="p-6">
            <FormSection title="Batch information">
              <FieldRow
                label="Batch number"
                required
                visibility="internal"
                htmlFor="bn"
              >
                <Input
                  id="bn"
                  value={form.batch_number}
                  onChange={set('batch_number')}
                  maxLength={40}
                  placeholder="2026-06-A"
                />
              </FieldRow>

              <FieldRow
                label="Production date"
                visibility="internal"
                htmlFor="pd"
              >
                <Input
                  id="pd"
                  type="date"
                  value={form.production_date}
                  onChange={set('production_date')}
                />
              </FieldRow>

              <FieldRow
                label="Production stage"
                visibility="internal"
                htmlFor="ps"
                hint="Maximum 60 characters."
              >
                <Input
                  id="ps"
                  value={form.production_stage}
                  onChange={set('production_stage')}
                  maxLength={60}
                  placeholder="Cut & Sew"
                />
              </FieldRow>

              <FieldRow
                label="Country of origin"
                visibility="public"
                htmlFor="coo"
              >
                <CountrySelect
                  id="coo"
                  value={form.country_of_origin}
                  onChange={set('country_of_origin')}
                />
              </FieldRow>

              <FieldRow label="Factory" visibility="internal" htmlFor="factory">
                <Select
                  id="factory"
                  value={form.factory_ID}
                  onChange={set('factory_ID')}
                  options={partnerOptions}
                />
              </FieldRow>

              <FieldRow label="Supplier" visibility="internal" htmlFor="supplier">
                <Select
                  id="supplier"
                  value={form.supplier_ID}
                  onChange={set('supplier_ID')}
                  options={partnerOptions}
                />
              </FieldRow>

              <FieldRow
                label="CO₂ footprint"
                visibility="public"
                htmlFor="co2"
                hint="Enter digits only. The comma is inserted automatically."
              >
                <Input
                  id="co2"
                  inputMode="numeric"
                  value={form.co2_footprint_kg}
                  onChange={set('co2_footprint_kg')}
                  placeholder="00,00"
                />
              </FieldRow>

              {showRecycled && (
                <FieldRow
                  label="Recycled content (%)"
                  visibility="public"
                  htmlFor="rc"
                >
                  <Input
                    id="rc"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.recycled_content_pct}
                    onChange={set('recycled_content_pct')}
                  />
                </FieldRow>
              )}
            </FormSection>

            {boms.length > 0 && (
              <div className="mt-6 border-t border-black/5 pt-5">
                <h3 className="text-sm font-semibold text-ink">
                  Component sourcing
                </h3>
                <p className="mb-3 mt-0.5 text-xs text-ink-muted">
                  Select which component batches were consumed in this production run.
                </p>

                <BatchSourcingPicker
                  boms={boms}
                  batchesFor={batchesFor}
                  nameOf={nameOf}
                  loadingBatches={loadingBatches}
                  selectionFor={(bomId) =>
                    sourcing[bomId] ?? {
                      batchIds: new Set(),
                      extNo: ''
                    }
                  }
                  onToggleBatch={toggleSourcingBatch}
                  onSetExtNo={setSourcingExtNo}
                  disabled={addBatch.isPending}
                />
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2 border-t border-black/5 pt-5">
              <Link to={`/products/${pid}/variants/${vid}/batches`}>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>

              <Button type="submit" disabled={addBatch.isPending}>
                {addBatch.isPending ? 'Adding…' : 'Add Batch'}
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </RequireRole>
  );
}