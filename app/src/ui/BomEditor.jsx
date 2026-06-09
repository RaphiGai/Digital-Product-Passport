import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Trash2, Pencil, ExternalLink } from 'lucide-react';
import { odataList, odataCreate, odataUpdate, odataDelete, newId, ApiError } from '@/api/client';
import { Card, CardTitle } from './Card';
import { Button } from './Button';
import { Banner } from './Breadcrumb';
import { FieldRow, Input, Select } from './Form';

const EMPTY_ROW = {
  component_ID: '',
  component_name: '',
  component_category: '',
  component_fibre: '',
  quantity: '',
  unit: 'g',
  component_role: '',
  dpp_source: 'internal',
  external_dpp_url: '',
  ext_co2: '',
  ext_recycled: ''
};

const COLS =
  'grid-cols-[minmax(0,2.4fr)_minmax(84px,auto)_minmax(104px,auto)_minmax(84px,auto)_minmax(0,2fr)_minmax(76px,auto)]';

// Pick the component DPP that best represents its footprint. The footprint lives
// on the batch, so require a batch; prefer a published, batch-level passport, but
// fall back to item-/product-level DPPs (the standard "batch + item → publish"
// flow only produces item-level DPPs).
function pickComponentDpp(dpps) {
  if (!dpps?.length) return null;
  const score = (d) =>
    (d.batch_ID ? 8 : 0) +
    (d.status === 'published' ? 4 : 0) +
    (d.dpp_type === 'batch' ? 2 : d.dpp_type === 'product' ? 1 : 0);
  return [...dpps].sort((a, b) => score(b) - score(a))[0]?.ID ?? null;
}

/**
 * Reusable Bill-of-Materials editor for a single variant.
 *
 * Each line sources its CO₂/recycled footprint either from the component's own
 * INTERNAL DPP (linked automatically, aggregated live) or from an EXTERNAL
 * supplier — in which case the supplier URL and the footprint values are entered
 * on the line and used directly in the aggregation. Lines can be edited or removed.
 *
 * @param {{ productId: string, variantId: string }} props
 */
export function BomEditor({ productId, variantId }) {
  const qc = useQueryClient();
  const [row, setRow] = useState(EMPTY_ROW);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState(null);

  const bom = useQuery({
    queryKey: ['ProductBOMs', variantId],
    queryFn: () => odataList('ProductBOMs', { filter: `parent_ID eq '${variantId}'`, top: 200 }),
    enabled: !!variantId
  });

  const products = useQuery({
    queryKey: ['Products', 'bom-candidates'],
    queryFn: () => odataList('Products', { orderby: 'name', top: 200 })
  });

  // Resolve the linked internal DPPs (+ their batch footprint) so the table can
  // show the CO₂ intensity / recycled content each internal line contributes.
  const subDppIds = [...new Set((bom.data ?? []).map((r) => r.sub_dpp_ID).filter(Boolean))];
  const subDpps = useQuery({
    queryKey: ['DPPs', 'bom-sub', variantId, subDppIds.join(',')],
    queryFn: () =>
      odataList('DPPs', {
        filter: subDppIds.map((id) => `ID eq '${id}'`).join(' or '),
        expand: ['batch'],
        top: 200
      }),
    enabled: subDppIds.length > 0
  });
  const dppById = Object.fromEntries((subDpps.data ?? []).map((d) => [d.ID, d]));

  const nameOf = (id) => products.data?.find((p) => p.ID === id)?.name ?? id;
  // Display name: internal product's name, else the line's free-text component name.
  const rowName = (r) => (r.component_ID ? nameOf(r.component_ID) : r.component_name || '—');
  const candidates = (products.data ?? []).filter(
    (p) => p.ID !== productId && ['material', 'component', 'packaging'].includes(p.product_type)
  );
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ProductBOMs', variantId] });
    if (productId) qc.invalidateQueries({ queryKey: ['Products', productId] });
  };

  const saveMut = useMutation({
    mutationFn: async (core) => {
      // Internal: link the component's own model-level DPP so its footprint rolls up.
      // External: keep the supplier URL + the manually-entered footprint values.
      let sub_dpp_ID = null;
      if (!core.external_dpp_url && core.component_ID) {
        const dpps = await odataList('DPPs', {
          filter: `product_ID eq '${core.component_ID}'`,
          select: ['ID', 'dpp_type', 'status', 'batch_ID'],
          top: 50
        });
        sub_dpp_ID = pickComponentDpp(dpps);
      }
      if (editingId) {
        return odataUpdate('ProductBOMs', editingId, { ...core, sub_dpp_ID });
      }
      return odataCreate('ProductBOMs', {
        ID: newId(),
        parent_ID: variantId,
        is_mandatory: true,
        status: 'active',
        ...core,
        sub_dpp_ID
      });
    },
    onSuccess: () => {
      setRow(EMPTY_ROW);
      setEditingId(null);
      setMsg(null);
      invalidate();
    },
    onError: (err) =>
      setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save component.' })
  });

  const delMut = useMutation({
    mutationFn: (id) => odataDelete('ProductBOMs', id),
    onSuccess: (_data, id) => {
      // If the row being edited was removed, drop out of edit mode.
      if (id === editingId) {
        setEditingId(null);
        setRow(EMPTY_ROW);
      }
      invalidate();
    }
  });

  const set = (key) => (e) => setRow((r) => ({ ...r, [key]: e.target.value }));

  const startEdit = (r) => {
    setEditingId(r.ID);
    setMsg(null);
    setRow({
      component_ID: r.component_ID ?? '',
      component_name: r.component_name ?? '',
      component_category: r.component_category ?? '',
      component_fibre: r.component_fibre_composition ?? '',
      quantity: r.quantity ?? '',
      unit: r.unit ?? 'g',
      component_role: r.component_role ?? '',
      dpp_source: r.external_dpp_url ? 'external' : 'internal',
      external_dpp_url: r.external_dpp_url ?? '',
      ext_co2: r.ext_co2_footprint ?? '',
      ext_recycled: r.ext_recycled_content_pct ?? ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setRow(EMPTY_ROW);
    setMsg(null);
  };

  const submit = () => {
    const isExternal = row.dpp_source === 'external';
    const externalUrl = row.external_dpp_url.trim();
    if (!isExternal && !row.component_ID) {
      setMsg({ kind: 'error', text: 'Pick a component product.' });
      return;
    }
    if (isExternal && !row.component_name.trim()) {
      setMsg({ kind: 'error', text: 'Enter the component name.' });
      return;
    }
    if (isExternal && !externalUrl) {
      setMsg({ kind: 'error', text: 'Enter the external DPP URL, or switch the source to Internal.' });
      return;
    }
    saveMut.mutate({
      component_ID: isExternal ? null : row.component_ID,
      component_name: isExternal ? row.component_name.trim() : null,
      component_category: isExternal && row.component_category.trim() ? row.component_category.trim() : null,
      component_fibre_composition: isExternal && row.component_fibre.trim() ? row.component_fibre.trim() : null,
      quantity: row.quantity ? Number(row.quantity) : null,
      unit: row.unit || null,
      component_role: row.component_role || null,
      external_dpp_url: isExternal ? externalUrl : null,
      ext_co2_footprint: isExternal && row.ext_co2 !== '' ? Number(row.ext_co2) : null,
      ext_recycled_content_pct: isExternal && row.ext_recycled !== '' ? Number(row.ext_recycled) : null
    });
  };

  // Footprint shown per line: external → values entered on the line; internal →
  // from the linked DPP's batch (exactly what the aggregation consumes).
  const rowFootprint = (r) => {
    if (r.external_dpp_url || r.ext_co2_footprint != null || r.ext_recycled_content_pct != null) {
      return { co2: r.ext_co2_footprint, recycled: r.ext_recycled_content_pct };
    }
    const b = dppById[r.sub_dpp_ID]?.batch;
    return { co2: b?.co2_footprint_kg ?? null, recycled: b?.recycled_content_pct ?? null };
  };

  // Numeric table cell: show the value (incl. 0) or an em-dash when absent.
  const numCell = (v) => (v == null || v === '' ? '—' : String(Number(v)));

  const rows = bom.data ?? [];

  return (
    <Card>
      <CardTitle>Bill of materials</CardTitle>

      {msg && (
        <div className="mt-3">
          <Banner kind={msg.kind}>{msg.text}</Banner>
        </div>
      )}

      {/* existing rows — column table with light vertical dividers */}
      {rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[860px]">
            <div className={`grid ${COLS} border-b border-black/10 text-xs font-medium uppercase tracking-wide text-ink-muted`}>
              <span className="border-r border-black/10 px-4 py-2">Component</span>
              <span className="border-r border-black/10 px-4 py-2 text-right">Qty</span>
              <span className="border-r border-black/10 px-4 py-2 text-right">CO₂ kg/kg</span>
              <span className="border-r border-black/10 px-4 py-2 text-right">Rec %</span>
              <span className="border-r border-black/10 px-4 py-2">DPP / URL</span>
              <span className="px-4 py-2 text-right">Actions</span>
            </div>
            {rows.map((r) => {
              const fp = rowFootprint(r);
              return (
                <div
                  key={r.ID}
                  className={`grid ${COLS} border-b border-black/5 last:border-0 ${
                    editingId === r.ID ? 'bg-brand-50' : ''
                  }`}
                >
                  <div className="flex min-w-0 items-center border-r border-black/10 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{rowName(r)}</div>
                      {r.component_role && <div className="truncate text-xs text-ink-muted">{r.component_role}</div>}
                    </div>
                  </div>
                  <div className="flex items-center justify-end border-r border-black/10 px-4 py-3 text-sm text-ink-muted">
                    {r.quantity != null ? `${r.quantity}${r.unit ? ` ${r.unit}` : ''}` : '—'}
                  </div>
                  <div className="flex items-center justify-end border-r border-black/10 px-4 py-3 text-sm text-ink">
                    {numCell(fp.co2)}
                  </div>
                  <div className="flex items-center justify-end border-r border-black/10 px-4 py-3 text-sm text-ink">
                    {numCell(fp.recycled)}
                  </div>
                  <div className="flex min-w-0 items-center border-r border-black/10 px-4 py-3">
                    {r.external_dpp_url ? (
                      <a
                        href={r.external_dpp_url}
                        target="_blank"
                        rel="noreferrer"
                        title={r.external_dpp_url}
                        className="flex min-w-0 items-center gap-1 text-xs text-brand-700 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{r.external_dpp_url}</span>
                      </a>
                    ) : r.sub_dpp_ID ? (
                      <Link
                        to={`/dpps/${r.sub_dpp_ID}`}
                        title={r.sub_dpp_ID}
                        className="block truncate text-xs text-brand-700 hover:underline"
                      >
                        Internal DPP
                      </Link>
                    ) : (
                      <span className="text-xs text-amber-600">No DPP</span>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="text-ink-muted hover:text-brand-700"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => delMut.mutate(r.ID)}
                      className="text-ink-muted hover:text-red-600"
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-3 py-3 text-sm text-ink-muted">No components yet.</p>
      )}

      {/* add / edit form */}
      <div className="mt-4 border-t border-black/5 pt-4">
        <div className="mb-3 text-sm font-medium text-ink">
          {editingId ? 'Edit component' : 'Add component'}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FieldRow
            label="DPP source"
            htmlFor="bom-source"
            className="md:col-span-2"
            hint="Internal links the component's own passport and aggregates its CO₂/recycled live. External uses a supplier URL plus the values you enter below."
          >
            <Select
              id="bom-source"
              value={row.dpp_source}
              onChange={set('dpp_source')}
              options={[
                { value: 'internal', label: "Internal DPP (component's own)" },
                { value: 'external', label: 'External DPP (supplier)' }
              ]}
            />
          </FieldRow>

          {row.dpp_source === 'internal' ? (
            <FieldRow label="Component product" htmlFor="bom-comp" className="md:col-span-2">
              <Select
                id="bom-comp"
                value={row.component_ID}
                onChange={set('component_ID')}
                options={[
                  { value: '', label: candidates.length ? 'Select a product…' : 'No other products' },
                  ...candidates.map((c) => ({ value: c.ID, label: `${c.name}${c.brand ? ` · ${c.brand}` : ''}` }))
                ]}
              />
            </FieldRow>
          ) : (
            <>
              <FieldRow
                label="Component name"
                htmlFor="bom-cname"
                className="md:col-span-2"
                hint="Free text — the external material has no internal product record."
              >
                <Input
                  id="bom-cname"
                  value={row.component_name}
                  onChange={set('component_name')}
                  placeholder="e.g. Recycled polyester thread"
                />
              </FieldRow>
              <FieldRow label="Category" htmlFor="bom-ccat">
                <Input id="bom-ccat" value={row.component_category} onChange={set('component_category')} placeholder="e.g. Trim" />
              </FieldRow>
              <FieldRow label="Fibre composition" htmlFor="bom-cfib">
                <Input id="bom-cfib" value={row.component_fibre} onChange={set('component_fibre')} placeholder="e.g. 100% Polyester" />
              </FieldRow>
            </>
          )}
          <FieldRow label="Quantity" htmlFor="bom-qty">
            <Input id="bom-qty" type="number" value={row.quantity} onChange={set('quantity')} placeholder="80" />
          </FieldRow>
          <FieldRow label="Unit" htmlFor="bom-unit">
            <Select
              id="bom-unit"
              value={row.unit}
              onChange={set('unit')}
              options={['g', 'kg', 'pcs'].map((u) => ({ value: u, label: u }))}
            />
          </FieldRow>
          <FieldRow label="Role" htmlFor="bom-role" className="md:col-span-2" hint="e.g. Main fabric, Zipper">
            <Input id="bom-role" value={row.component_role} onChange={set('component_role')} placeholder="Main fabric" />
          </FieldRow>

          {row.dpp_source === 'external' && (
            <>
              <FieldRow
                label="External DPP URL"
                htmlFor="bom-ext"
                className="md:col-span-2"
                hint="Supplier-hosted passport (shown on the line)."
              >
                <Input
                  id="bom-ext"
                  value={row.external_dpp_url}
                  onChange={set('external_dpp_url')}
                  placeholder="https://supplier.example/dpp/…"
                />
              </FieldRow>
              <FieldRow
                label={`CO₂ footprint (${row.unit === 'pcs' ? 'per piece' : 'per kg'})`}
                htmlFor="bom-extco2"
                hint="Supplier value — basis follows the quantity unit (per kg for g/kg, per piece for pcs). Used directly in aggregation."
              >
                <Input
                  id="bom-extco2"
                  type="number"
                  step="0.0001"
                  value={row.ext_co2}
                  onChange={set('ext_co2')}
                  placeholder="20"
                />
              </FieldRow>
              <FieldRow label="Recycled content (%)" htmlFor="bom-extrec" hint="Supplier value — used for aggregation.">
                <Input
                  id="bom-extrec"
                  type="number"
                  step="0.01"
                  value={row.ext_recycled}
                  onChange={set('ext_recycled')}
                  placeholder="0"
                />
              </FieldRow>
            </>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          {editingId && (
            <Button type="button" variant="ghost" disabled={saveMut.isPending} onClick={cancelEdit}>
              Cancel
            </Button>
          )}
          <Button type="button" variant="outline" disabled={saveMut.isPending} onClick={submit}>
            {saveMut.isPending ? 'Saving…' : editingId ? 'Save changes' : '+ Add component'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
