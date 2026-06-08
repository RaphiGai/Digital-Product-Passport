import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { odataList, odataCreate, odataDelete, newId, ApiError } from '@/api/client';
import { Card, CardTitle } from './Card';
import { Button } from './Button';
import { Banner } from './Breadcrumb';
import { FieldRow, Input, Select } from './Form';

/**
 * Reusable Bill-of-Materials editor for a single variant.
 * Lists the variant's components, lets you add/remove them, and load another variant's
 * BOM as a template (variants' BOMs differ only minimally).
 *
 * @param {{ productId: string, variantId: string, variants?: any[] }} props
 *   variants = sibling variants of the product (for the template dropdown)
 */
export function BomEditor({ productId, variantId, variants = [] }) {
  const qc = useQueryClient();
  const [row, setRow] = useState({ component_ID: '', quantity: '', unit: '%', component_role: '' });
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

  const nameOf = (id) => products.data?.find((p) => p.ID === id)?.name ?? id;
  const candidates = (products.data ?? []).filter(
    (p) => p.ID !== productId && ['material', 'component', 'packaging'].includes(p.product_type)
  );
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ProductBOMs', variantId] });
    if (productId) qc.invalidateQueries({ queryKey: ['Products', productId] });
  };

  const addMut = useMutation({
    mutationFn: (payload) => odataCreate('ProductBOMs', { ID: newId(), ...payload }),
    onSuccess: () => {
      setRow({ component_ID: '', quantity: '', unit: '%', component_role: '' });
      setMsg(null);
      invalidate();
    },
    onError: (err) =>
      setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not add component.' })
  });

  const delMut = useMutation({
    mutationFn: (id) => odataDelete('ProductBOMs', id),
    onSuccess: invalidate
  });

  const templateMut = useMutation({
    mutationFn: async (srcVid) => {
      const srcRows = await odataList('ProductBOMs', { filter: `parent_ID eq '${srcVid}'`, top: 200 });
      const existing = new Set((bom.data ?? []).map((r) => r.component_ID));
      const toCreate = srcRows.filter((r) => !existing.has(r.component_ID));
      const results = await Promise.allSettled(
        toCreate.map((r) =>
          odataCreate('ProductBOMs', {
            ID: newId(),
            parent_ID: variantId,
            component_ID: r.component_ID,
            quantity: r.quantity,
            unit: r.unit,
            component_role: r.component_role,
            is_mandatory: r.is_mandatory ?? true,
            status: 'active'
          })
        )
      );
      const failed = results.filter((x) => x.status === 'rejected').length;
      return { added: toCreate.length - failed, skipped: srcRows.length - toCreate.length, failed };
    },
    onSuccess: (r) => {
      setMsg({
        kind: r.failed ? 'error' : 'success',
        text: `Template loaded: ${r.added} added${r.skipped ? `, ${r.skipped} already present` : ''}${r.failed ? `, ${r.failed} failed` : ''}.`
      });
      invalidate();
    },
    onError: () => setMsg({ kind: 'error', text: 'Could not load template.' })
  });

  const set = (key) => (e) => setRow((r) => ({ ...r, [key]: e.target.value }));

  const add = () => {
    if (!row.component_ID) {
      setMsg({ kind: 'error', text: 'Pick a component product.' });
      return;
    }
    addMut.mutate({
      parent_ID: variantId,
      component_ID: row.component_ID,
      quantity: row.quantity ? Number(row.quantity) : null,
      unit: row.unit || null,
      component_role: row.component_role || null,
      is_mandatory: true,
      status: 'active'
    });
  };

  const siblings = variants.filter((v) => v.ID !== variantId);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <CardTitle>Bill of materials</CardTitle>
        {siblings.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">Copy from</span>
            <Select
              className="h-8 w-44 py-1 text-xs"
              value=""
              onChange={(e) => e.target.value && templateMut.mutate(e.target.value)}
              options={[
                { value: '', label: templateMut.isPending ? 'Loading…' : 'another variant…' },
                ...siblings.map((v) => ({
                  value: v.ID,
                  label: [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID
                }))
              ]}
            />
          </div>
        )}
      </div>

      {msg && (
        <div className="mt-3">
          <Banner kind={msg.kind}>{msg.text}</Banner>
        </div>
      )}

      {/* existing rows */}
      <ul className="mt-3 divide-y divide-black/5">
        {(bom.data ?? []).map((r) => (
          <li key={r.ID} className="flex items-center justify-between gap-3 py-2.5">
            <div>
              <span className="text-sm font-medium text-ink">{nameOf(r.component_ID)}</span>
              {r.component_role && <span className="ml-2 text-xs text-ink-muted">{r.component_role}</span>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-muted">
                {r.quantity != null ? `${r.quantity}${r.unit ? ` ${r.unit}` : ''}` : ''}
              </span>
              <button
                type="button"
                onClick={() => delMut.mutate(r.ID)}
                className="text-ink-muted hover:text-red-600"
                title="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
        {bom.data?.length === 0 && (
          <li className="py-3 text-sm text-ink-muted">No components yet.</li>
        )}
      </ul>

      {/* add row */}
      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-black/5 pt-4 md:grid-cols-2">
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
        <FieldRow label="Quantity" htmlFor="bom-qty">
          <Input id="bom-qty" type="number" value={row.quantity} onChange={set('quantity')} placeholder="80" />
        </FieldRow>
        <FieldRow label="Unit" htmlFor="bom-unit">
          <Select
            id="bom-unit"
            value={row.unit}
            onChange={set('unit')}
            options={['%', 'g', 'kg', 'pcs'].map((u) => ({ value: u, label: u }))}
          />
        </FieldRow>
        <FieldRow label="Role" htmlFor="bom-role" className="md:col-span-2" hint="e.g. Main fabric, Zipper">
          <Input id="bom-role" value={row.component_role} onChange={set('component_role')} placeholder="Main fabric" />
        </FieldRow>
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" disabled={addMut.isPending} onClick={add}>
          {addMut.isPending ? 'Adding…' : '+ Add component'}
        </Button>
      </div>
    </Card>
  );
}
