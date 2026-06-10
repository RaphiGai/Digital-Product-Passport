import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Trash2, Pencil, ExternalLink, ChevronRight, ChevronDown } from 'lucide-react';
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

// Fixed px widths so header and data rows share identical column sizes across
// independent grid containers. (minmax(Xpx,auto) would resolve "auto" per-row
// and produce different widths between header and data rows.)
const COLS = 'grid-cols-[minmax(0,3fr)_76px_96px_68px_minmax(0,2fr)_72px]';

function pickComponentDpp(dpps) {
  if (!dpps?.length) return null;
  const score = (d) =>
    (d.batch_ID ? 8 : 0) +
    (d.status === 'published' ? 4 : 0) +
    (d.dpp_type === 'batch' ? 2 : d.dpp_type === 'product' ? 1 : 0);
  return [...dpps].sort((a, b) => score(b) - score(a))[0]?.ID ?? null;
}

function resolveFootprint(r, dppById) {
  if (r.external_dpp_url || r.ext_co2_footprint != null || r.ext_recycled_content_pct != null) {
    return { co2: r.ext_co2_footprint, recycled: r.ext_recycled_content_pct };
  }
  const b = dppById[r.sub_dpp_ID]?.batch;
  return { co2: b?.co2_footprint_kg ?? null, recycled: b?.recycled_content_pct ?? null };
}

function fmtNum(v) {
  return v == null || v === '' ? '—' : String(Number(v));
}

// Recursive BOM row. Internal components (component_ID set, no external URL)
// show a chevron; expanding lazily fetches the component's first variant and
// its BOM lines, then renders them at the next depth level.
function BomTableRow({ r, depth, dppById, allProducts, editingId, onEdit, onDelete, readOnly = false }) {
  const [open, setOpen] = useState(false);
  const isInternal = !!r.component_ID && !r.external_dpp_url;
  const canEdit = depth === 0 && !readOnly;
  const fp = resolveFootprint(r, dppById);
  const indent = depth * 20;

  const name = r.component_ID
    ? (allProducts?.find((p) => p.ID === r.component_ID)?.name ?? r.component_name ?? r.component_ID)
    : (r.component_name ?? '—');

  const variantQ = useQuery({
    queryKey: ['ProductVariants', 'bom-expand', r.component_ID],
    queryFn: () =>
      odataList('ProductVariants', { filter: `product_ID eq '${r.component_ID}'`, orderby: 'sku', top: 1 }),
    enabled: open && isInternal,
    staleTime: 60_000
  });
  const childVariantId = variantQ.data?.[0]?.ID;

  const childBomQ = useQuery({
    queryKey: ['ProductBOMs', childVariantId],
    queryFn: () => odataList('ProductBOMs', { filter: `parent_ID eq '${childVariantId}'`, top: 200 }),
    enabled: !!childVariantId,
    staleTime: 60_000
  });
  const childRows = childBomQ.data ?? [];

  const childSubIds = [...new Set(childRows.map((c) => c.sub_dpp_ID).filter(Boolean))];
  const childDppsQ = useQuery({
    queryKey: ['DPPs', 'bom-sub-child', childVariantId, childSubIds.join(',')],
    queryFn: () =>
      odataList('DPPs', {
        filter: childSubIds.map((id) => `ID eq '${id}'`).join(' or '),
        expand: ['batch'],
        top: 200
      }),
    enabled: childSubIds.length > 0,
    staleTime: 60_000
  });
  const childDppById = Object.fromEntries((childDppsQ.data ?? []).map((d) => [d.ID, d]));

  const isLoading = variantQ.isLoading || (!!childVariantId && childBomQ.isLoading);

  return (
    <>
      <div
        className={`grid ${COLS} items-center border-b border-black/5 last:border-0 transition-colors ${
          editingId === r.ID ? 'bg-brand-50' : 'hover:bg-black/[0.015]'
        }`}
      >
        {/* Component — indent + optional chevron + name/role */}
        <div
          className="flex min-w-0 items-center border-r border-black/10 py-3 pr-3"
          style={{ paddingLeft: `${12 + indent}px` }}
        >
          <span className="mr-1.5 flex h-4 w-4 shrink-0 items-center justify-center">
            {isInternal && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="text-ink-muted hover:text-ink"
                aria-label={open ? 'Collapse sub-components' : 'Expand sub-components'}
              >
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{name}</div>
            {r.component_role && (
              <div className="truncate text-xs text-ink-muted">{r.component_role}</div>
            )}
          </div>
        </div>

        {/* Qty */}
        <div className="flex items-center justify-end border-r border-black/10 px-3 py-3 text-sm text-ink-muted">
          {r.quantity != null ? `${r.quantity}${r.unit ? ` ${r.unit}` : ''}` : '—'}
        </div>

        {/* CO₂ kg/kg */}
        <div className="flex items-center justify-end border-r border-black/10 px-3 py-3 text-sm tabular-nums text-ink">
          {fmtNum(fp.co2)}
        </div>

        {/* Rec % */}
        <div className="flex items-center justify-end border-r border-black/10 px-3 py-3 text-sm tabular-nums text-ink">
          {fmtNum(fp.recycled)}
        </div>

        {/* Source */}
        <div className="flex min-w-0 items-center border-r border-black/10 px-3 py-3">
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

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-3 py-3">
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={() => onEdit(r)}
                className="text-ink-muted hover:text-brand-700"
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(r.ID)}
                className="text-ink-muted hover:text-red-600"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : r.component_ID ? (
            <Link
              to={`/products/${r.component_ID}`}
              className="text-ink-muted hover:text-brand-700"
              title="View component product"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </div>

      {/* Recursive child BOM */}
      {open && isInternal && (
        <>
          {isLoading ? (
            <div
              className="border-b border-black/5 py-2 text-xs text-ink-muted"
              style={{ paddingLeft: `${32 + indent}px` }}
            >
              Loading…
            </div>
          ) : !childVariantId ? (
            <div
              className="border-b border-black/5 py-2 text-xs text-ink-muted"
              style={{ paddingLeft: `${32 + indent}px` }}
            >
              No variant for this component.
            </div>
          ) : childRows.length === 0 ? (
            <div
              className="border-b border-black/5 py-2 text-xs text-ink-muted"
              style={{ paddingLeft: `${32 + indent}px` }}
            >
              No sub-components.
            </div>
          ) : (
            childRows.map((child) => (
              <BomTableRow
                key={child.ID}
                r={child}
                depth={depth + 1}
                dppById={childDppById}
                allProducts={allProducts}
                editingId={null}
                onEdit={() => {}}
                onDelete={() => {}}
                readOnly={readOnly}
              />
            ))
          )}
        </>
      )}
    </>
  );
}

/**
 * Reusable Bill-of-Materials editor for a single variant.
 *
 * @param {{ productId: string, variantId: string }} props
 */
export function BomEditor({ productId, variantId, readOnly = false }) {
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

  const candidates = (products.data ?? []).filter(
    (p) => p.ID !== productId && ['material', 'component', 'packaging'].includes(p.product_type)
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ProductBOMs', variantId] });
    if (productId) qc.invalidateQueries({ queryKey: ['Products', productId] });
  };

  const saveMut = useMutation({
    mutationFn: async (core) => {
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

  const rows = bom.data ?? [];

  return (
    <Card>
      <CardTitle>Bill of materials</CardTitle>

      {msg && (
        <div className="mt-3">
          <Banner kind={msg.kind}>{msg.text}</Banner>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[760px]">
            {/* Header */}
            <div
              className={`grid ${COLS} border-b border-black/10 text-xs font-medium uppercase tracking-wide text-ink-muted`}
            >
              <span className="border-r border-black/10 px-4 py-2">Component</span>
              <span className="border-r border-black/10 px-3 py-2 text-right">Qty</span>
              <span className="border-r border-black/10 px-3 py-2 text-right">CO₂ kg/kg</span>
              <span className="border-r border-black/10 px-3 py-2 text-right">Rec %</span>
              <span className="border-r border-black/10 px-3 py-2">Source</span>
              <span className="px-3 py-2" />
            </div>

            {/* Rows */}
            {rows.map((r) => (
              <BomTableRow
                key={r.ID}
                r={r}
                depth={0}
                dppById={dppById}
                allProducts={products.data}
                editingId={readOnly ? null : editingId}
                onEdit={startEdit}
                onDelete={(id) => delMut.mutate(id)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 py-3 text-sm text-ink-muted">No components yet.</p>
      )}

      {/* Add / edit form — hidden in read-only mode */}
      {!readOnly && (
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
                <Input
                  id="bom-ccat"
                  value={row.component_category}
                  onChange={set('component_category')}
                  placeholder="e.g. Trim"
                />
              </FieldRow>
              <FieldRow label="Fibre composition" htmlFor="bom-cfib">
                <Input
                  id="bom-cfib"
                  value={row.component_fibre}
                  onChange={set('component_fibre')}
                  placeholder="e.g. 100% Polyester"
                />
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
              options={['g', 'kg', 'pcs', '%'].map((u) => ({ value: u, label: u }))}
            />
          </FieldRow>
          <FieldRow label="Role" htmlFor="bom-role" className="md:col-span-2" hint="e.g. Main fabric, Zipper">
            <Input
              id="bom-role"
              value={row.component_role}
              onChange={set('component_role')}
              placeholder="Main fabric"
            />
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
              <FieldRow
                label="Recycled content (%)"
                htmlFor="bom-extrec"
                hint="Supplier value — used for aggregation."
              >
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
      )}
    </Card>
  );
}
