import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  odataGet,
  odataList,
  odataCreate,
  odataUpdate,
  newId,
  ApiError
} from '@/api/client';
import { useUpdate } from '@/api/hooks';
import { useHasRole } from '@/auth/useMe';
import { BATCH_CATALOGUE, catalogueByKey, mergeVisibility } from '@/lib/fieldCatalogue';
import { parseCustomFields, serializeCustomFields, validateCustomFields } from '@/lib/customFields';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { FormSection, FieldRow, Input, Select, CountrySelect } from '@/ui/Form';
import { CustomFieldsEditor } from '@/ui/CustomFieldsEditor';
import { DocumentManager } from '@/ui/DocumentManager';

function SortButton({ label, column, sort, onSort }) {
  const active = sort.column === column;
  const arrow = !active ? '↕' : sort.dir === 'asc' ? '↑' : '↓';

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="inline-flex items-center gap-1 font-medium uppercase tracking-wide hover:text-ink"
    >
      {label} <span>{arrow}</span>
    </button>
  );
}

export function BatchEdit() {
  const { pid, vid, bid } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState(null);
  const [fieldVis, setFieldVis] = useState(null);
  const [msg, setMsg] = useState(null);

  const [itemCount, setItemCount] = useState('');
  const [showItems, setShowItems] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [draftItems, setDraftItems] = useState([]);
  const [originalItems, setOriginalItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [itemsDirty, setItemsDirty] = useState(false);

  const isAdvanced = useHasRole('company_advanced');
  const BATCH_VIS = useMemo(() => catalogueByKey(BATCH_CATALOGUE), []);
  const today = new Date().toISOString().slice(0, 10);
  const [itemSort, setItemSort] = useState({ column: 'upi', dir: 'asc' });


  const batchQ = useQuery({
    queryKey: ['Batches', 'one', bid],
    queryFn: () => odataGet('Batches', bid, { expand: ['factory', 'supplier'] }),
    enabled: !!bid
  });

  const productQ = useQuery({
    queryKey: ['Products', pid, 'name'],
    queryFn: () => odataGet('Products', pid, { select: ['ID', 'name', 'product_type'] }),
    enabled: !!pid
  });

  const variantQ = useQuery({
    queryKey: ['ProductVariants', 'one', vid],
    queryFn: () => odataGet('ProductVariants', vid),
    enabled: !!vid
  });

  const partnersQ = useQuery({
    queryKey: ['BusinessPartners', 'pickers'],
    queryFn: () => odataList('BusinessPartners', { orderby: 'name', top: 200 })
  });

  const itemsQ = useQuery({
    queryKey: ['ProductItems', bid],
    queryFn: () =>
      odataList('ProductItems', {
        filter: `batch_ID eq '${bid}'`,
        orderby: 'serial_number',
        top: 1000
      }),
    enabled: !!bid
  });

  const dppsQ = useQuery({
    queryKey: ['DPPs', 'batch', bid],
    queryFn: () =>
      odataList('DPPs', {
        filter: `batch_ID eq '${bid}'`,
        select: ['ID', 'item_ID', 'status'],
        top: 1000
      }),
    enabled: !!bid
  });

  useEffect(() => {
    if (itemsQ.data && !itemsDirty) {
      const normalized = itemsQ.data.map((item) => ({ ...item, __new: false }));
      setDraftItems(normalized);
      setOriginalItems(normalized);
      setSelectedItems(new Set());
    }
  }, [itemsQ.data, itemsDirty]);

  useEffect(() => {
    if (batchQ.data && !form) {
      const b = batchQ.data;

      setForm({
        batch_number: b.batch_number ?? '',
        production_date: b.production_date ?? '',
        country_of_origin: b.country_of_origin ?? '',
        production_stage: b.production_stage ?? '',
        factory_ID: b.factory_ID ?? '',
        supplier_ID: b.supplier_ID ?? '',
        co2_footprint_kg:
          b.co2_footprint_kg === null || b.co2_footprint_kg === undefined
            ? ''
            : String(b.co2_footprint_kg).replace('.', ','),
        recycled_content_pct: b.recycled_content_pct ?? '',
        status: b.status ?? 'draft',
        custom_fields: parseCustomFields(b.custom_fields)
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

  const saveItemsMutation = useMutation({
    mutationFn: async () => {
      const dpps = dppsQ.data ?? [];

      const originalById = Object.fromEntries(originalItems.map((i) => [i.ID, i]));
      const originalIds = new Set(originalItems.map((i) => i.ID));

      const toCreate = draftItems.filter((i) => !originalIds.has(i.ID));

      const toUpdate = draftItems.filter((i) => {
        const original = originalById[i.ID];
        return original && (original.upi ?? '') !== (i.upi ?? '');
      });

      const toArchive = draftItems.filter((i) => {
        const original = originalById[i.ID];
        return original && original.status !== 'archived' && i.status === 'archived';
      });

      for (const item of toUpdate) {
        await odataUpdate('ProductItems', item.ID, {
          upi: item.upi?.trim() || null
        });
      }

      for (const item of toArchive) {
        const relatedDpp = dpps.find((d) => d.item_ID === item.ID);

        await odataUpdate('ProductItems', item.ID, {
          status: 'archived'
        });

        if (relatedDpp) {
          await odataUpdate('DPPs', relatedDpp.ID, {
            status: 'archived'
          });
        }
      }

      for (const item of toCreate) {
        await odataCreate('ProductItems', {
          ID: item.ID,
          batch_ID: bid,
          upi: item.upi?.trim() || null,
          serial_number: item.serial_number,
          status: item.status || 'active'
        });
      }
    },
    onSuccess: () => {
      setItemsDirty(false);
      setSelectedItems(new Set());
      qc.invalidateQueries({ queryKey: ['ProductItems', bid] });
      qc.invalidateQueries({ queryKey: ['DPPs', 'batch', bid] });
      qc.invalidateQueries({ queryKey: ['DPPs'] });
      qc.invalidateQueries({ queryKey: ['DigitalProductPassports'] });
      setMsg({ kind: 'success', text: 'Item changes saved.' });
    },
    onError: (err) =>
      setMsg({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Could not save item changes.'
      })
  });

  const showRecycled = productQ.data?.product_type !== 'finished';

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const setCo2 = (e) => {
    let value = e.target.value.replace(/[^\d,]/g, '');
    const parts = value.split(',');

    if (parts.length > 2) value = `${parts[0]},${parts.slice(1).join('')}`;

    const [beforeComma = '', afterComma = ''] = value.split(',');
    const cleaned = value.includes(',')
      ? `${beforeComma.slice(0, 7)},${afterComma.slice(0, 2)}`
      : beforeComma.slice(0, 7);

    setForm((f) => ({ ...f, co2_footprint_kg: cleaned }));
  };

  const visCtl = (key) => ({
    value: fieldVis?.[key] ?? 'public',
    onChange: (v) => setFieldVis((m) => ({ ...(m ?? {}), [key]: v })),
    locked: !!BATCH_VIS[key]?.locked,
    canEdit: isAdvanced
  });

  const saveBatch = () => {
    setMsg(null);

    if (!form.batch_number.trim()) {
      setMsg({ kind: 'error', text: 'Batch number is required.' });
      return;
    }

    if (!form.production_date) {
      setMsg({ kind: 'error', text: 'Production date is required.' });
      return;
    }

    if (form.production_date >= today) {
      setMsg({ kind: 'error', text: 'Production date must be in the past.' });
      return;
    }

    if (form.production_stage.trim().length > 60) {
      setMsg({ kind: 'error', text: 'Production stage can have maximum 60 characters.' });
      return;
    }

    if (form.co2_footprint_kg !== '' && !/^\d{1,7}(,\d{1,2})?$/.test(form.co2_footprint_kg)) {
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

    const cfError = validateCustomFields(form.custom_fields);
    if (cfError) {
      setMsg({ kind: 'error', text: cfError });
      return;
    }

    update.mutate(
      {
        key: bid,
        payload: {
          batch_number: form.batch_number.trim(),
          production_date: form.production_date || null,
          country_of_origin: form.country_of_origin || null,
          production_stage: form.production_stage || null,
          factory_ID: form.factory_ID || null,
          supplier_ID: form.supplier_ID || null,
          co2_footprint_kg:
            form.co2_footprint_kg !== ''
              ? Number(String(form.co2_footprint_kg).replace(',', '.'))
              : null,
          recycled_content_pct:
            showRecycled && form.recycled_content_pct !== ''
              ? Number(form.recycled_content_pct)
              : null,
          status: form.status,
          custom_fields: serializeCustomFields(form.custom_fields),
          field_visibility: JSON.stringify(fieldVis ?? {})
        }
      },
      {
        onSuccess: () => setMsg({ kind: 'success', text: 'Batch saved.' }),
        onError: (err) =>
          setMsg({
            kind: 'error',
            text: err instanceof ApiError ? err.message : 'Could not save.'
          })
      }
    );
  };

  const addDraftItems = () => {
    const count = parseInt(itemCount, 10);
    if (!count || count < 1) return;

    const existingCount = draftItems.length;
    const prefix = form.batch_number || bid;

    const created = Array.from({ length: count }, (_, i) => {
      const serial = `${prefix}-${String(existingCount + i + 1).padStart(4, '0')}`;

      return {
        ID: newId(),
        batch_ID: bid,
        upi: '',
        serial_number: serial,
        status: 'active',
        __new: true
      };
    });

    setDraftItems((old) => [...old, ...created]);
    setItemCount('');
    setShowItems(true);
    setItemsDirty(true);
  };

  const updateDraftItem = (id, key, value) => {
    setDraftItems((old) =>
      old.map((item) => (item.ID === id ? { ...item, [key]: value } : item))
    );
    setItemsDirty(true);
  };

  const archiveDraftItems = (ids) => {
    const archiveIds = new Set(ids);
    const originalIds = new Set(originalItems.map((i) => i.ID));

    setDraftItems((old) =>
      old
        .filter((item) => {
          // New unsaved items can simply disappear before save
          if (!originalIds.has(item.ID) && archiveIds.has(item.ID)) return false;
          return true;
        })
        .map((item) =>
          archiveIds.has(item.ID)
            ? { ...item, status: 'archived' }
            : item
        )
    );

    setSelectedItems(new Set());
    setItemsDirty(true);
  };

  const cancelItemChanges = () => {
    setDraftItems(originalItems);
    setSelectedItems(new Set());
    setItemCount('');
    setItemsDirty(false);
    setMsg({ kind: 'success', text: 'Item changes cancelled.' });
  };

  const toggleSelected = (id, checked) => {
    setSelectedItems((old) => {
      const next = new Set(old);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleSort = (column) => {
    setItemSort((old) =>
      old.column === column
        ? { column, dir: old.dir === 'asc' ? 'desc' : 'asc' }
        : { column, dir: 'asc' }
    );
  };

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();

    return draftItems
      .filter((item) => {
        if (!q) return true;

        return [item.ID, item.upi, item.serial_number, item.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const av = String(a[itemSort.column] ?? '').toLowerCase();
        const bv = String(b[itemSort.column] ?? '').toLowerCase();

        if (av < bv) return itemSort.dir === 'asc' ? -1 : 1;
        if (av > bv) return itemSort.dir === 'asc' ? 1 : -1;
        return 0;
      });
  }, [draftItems, itemSearch, itemSort]);

  const allVisibleSelected =
    filteredItems.length > 0 && filteredItems.every((item) => selectedItems.has(item.ID));

  const toggleAllVisible = (checked) => {
    setSelectedItems((old) => {
      const next = new Set(old);

      for (const item of filteredItems) {
        if (checked) next.add(item.ID);
        else next.delete(item.ID);
      }

      return next;
    });
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

  const itemsBusy = saveItemsMutation.isPending;
  const parsedCount = parseInt(itemCount, 10);

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

      <div className="flex items-center justify-between gap-4">
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
          <FieldRow label="Batch number" visibilityControl={visCtl('batch_number')}>
            <div className="rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700">
              {form.batch_number}
            </div>
          </FieldRow>

          <FieldRow label="Production date" visibilityControl={visCtl('production_date')}>
            <Input type="date" max={today} value={form.production_date} onChange={set('production_date')} />
          </FieldRow>

          <FieldRow label="Country of origin" visibilityControl={visCtl('country_of_origin')}>
            <CountrySelect value={form.country_of_origin} onChange={set('country_of_origin')} />
          </FieldRow>

          <FieldRow label="Production stage" visibilityControl={visCtl('production_stage')} hint="e.g. Cut & Sew">
            <Input maxLength={60} value={form.production_stage} onChange={set('production_stage')} />
          </FieldRow>

          <FieldRow label="Factory" visibilityControl={visCtl('factory')}>
            <Select value={form.factory_ID} onChange={set('factory_ID')} options={partnerOptions} />
          </FieldRow>

          <FieldRow label="Supplier" visibilityControl={visCtl('supplier')}>
            <Select value={form.supplier_ID} onChange={set('supplier_ID')} options={partnerOptions} />
          </FieldRow>

          <FieldRow
            label="CO₂ footprint (own production)"
            visibilityControl={visCtl('co2_footprint_kg')}
          >
            <Input
              type="text"
              inputMode="decimal"
              maxLength={10}
              value={form.co2_footprint_kg}
              onChange={setCo2}
              placeholder="00,00"
            />
          </FieldRow>

          {showRecycled && (
            <FieldRow label="Recycled content (%)" visibilityControl={visCtl('recycled_content_pct')}>
              <Input
                type="number"
                step="0.01"
                value={form.recycled_content_pct}
                onChange={set('recycled_content_pct')}
              />
            </FieldRow>
          )}

          <FieldRow label="Status" visibility="internal">
            <Select
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

        <FormSection
          title="Additional fields"
          description="Your own name/value fields for this batch. Each field has its own Public/Internal setting — Public fields appear on the consumer passport after the passport is (re-)published."
        >
          <CustomFieldsEditor
            rows={form.custom_fields}
            onChange={(rows) => setForm((f) => ({ ...f, custom_fields: rows }))}
            canEditVisibility={isAdvanced}
          />
        </FormSection>

        <div className="flex justify-end gap-3 border-t border-black/5 pt-5">
          <Button variant="outline" onClick={() => navigate(`/products/${pid}/variants/${vid}/batches`)}>
            Back to batches
          </Button>
          <Button disabled={update.isPending} onClick={saveBatch}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">
              Items in this batch ({draftItems.length})
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Add or remove items first. Changes are saved only after clicking Save items.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              min="1"
              max="100000"
              value={itemCount}
              onChange={(e) => setItemCount(e.target.value)}
              placeholder="Quantity"
              className="h-10 w-24"
            />

            <Button
              type="button"
              disabled={!parsedCount || parsedCount < 1 || itemsBusy}
              onClick={addDraftItems}
            >
              Add items
            </Button>

            {draftItems.length > 0 && (
              <Button variant="outline" type="button" onClick={() => setShowItems((v) => !v)}>
                {showItems ? 'Hide items' : `Show items (${draftItems.length})`}
              </Button>
            )}

            <Button
              type="button"
              disabled={!itemsDirty || itemsBusy}
              onClick={() => saveItemsMutation.mutate()}
            >
              {itemsBusy ? 'Saving…' : 'Save items'}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={!itemsDirty || itemsBusy}
              onClick={cancelItemChanges}
            >
              Cancel
            </Button>
          </div>
        </div>

        {showItems && (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <Input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Search items..."
                className="h-10 max-w-sm"
              />

              <Button
                type="button"
                variant="outline"
                disabled={selectedItems.size === 0 || itemsBusy}
                onClick={() => archiveDraftItems([...selectedItems])}
              >
                Archive selected ({selectedItems.size})
              </Button>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-black/10">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs text-ink-muted">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={(e) => toggleAllVisible(e.target.checked)}
                      />
                    </th>
                    <th className="px-4 py-3">
                      <SortButton label="Item ID" column="ID" sort={itemSort} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3">
                      <SortButton label="UPI" column="upi" sort={itemSort} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3">
                      <SortButton
                        label="Serial number"
                        column="serial_number"
                        sort={itemSort}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-4 py-3">
                      <SortButton label="Status" column="status" sort={itemSort} onSort={handleSort} />
                    </th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {itemsQ.isLoading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-ink-muted">
                        Loading items…
                      </td>
                    </tr>
                  )}

                  {!itemsQ.isLoading && filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-ink-muted">
                        No items found.
                      </td>
                    </tr>
                  )}

                  {filteredItems.map((item) => (
                    <tr key={item.ID} className="border-t border-black/5">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.ID)}
                          onChange={(e) => toggleSelected(item.ID, e.target.checked)}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {item.ID}
                         {!originalItems.some((original) => original.ID === item.ID) && (
                          <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700">
                            new
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                          <Input
                              value={item.upi ?? ''}
                              onChange={(e) => updateDraftItem(item.ID, 'upi', e.target.value)}
                              disabled={!isAdvanced || itemsBusy || item.status === 'archived'}
                              placeholder="UPI"
                              className="h-9 min-w-40 font-mono text-xs"
                              maxLength={80}
                          />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{item.serial_number || '—'}</td>
                      <td className="px-4 py-3">{item.status || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={itemsBusy}
                          onClick={() => archiveDraftItems([item.ID])}
                        >
                          Archive
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <DocumentManager scope="batch" ownerId={bid} />
    </div>
  );
}