import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Pencil, ExternalLink, Plus, SaveAll, ChevronDown, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { odataList, odataCreate, odataUpdate, odataDelete, newId, ApiError } from '@/api/client';
import { useHasRole } from '@/auth/useMe';
import { Card, CardTitle } from './Card';
import { Button } from './Button';
import { Banner } from './Breadcrumb';
import { EditableVisibilityBadge } from './Badge';
import { FieldRow, Input, Select } from './Form';

const EMPTY_ROW = {
  component_ID: '',
  component_name: '',
  quantity: '',
  unit: 'g',
  component_role: '',
  dpp_source: 'internal',
  external_dpp_url: ''
};

const COLS =
  'grid-cols-[170px_minmax(0,3fr)_150px_80px_64px_minmax(0,2fr)_120px_104px]';

function pickComponentDpp(dpps) {
  if (!dpps?.length) return null;

  const score = (d) =>
    (d.batch_ID ? 8 : 0) +
    (d.status === 'published' ? 4 : 0) +
    (d.dpp_type === 'batch' ? 2 : d.dpp_type === 'product' ? 1 : 0);

  return [...dpps].sort((a, b) => score(b) - score(a))[0]?.ID ?? null;
}

async function getFirstVariantId(productId) {
  const variants = await odataList('ProductVariants', {
    filter: `product_ID eq '${productId}'`,
    orderby: 'sku',
    top: 1
  });

  return variants?.[0]?.ID ?? null;
}

async function loadBomTree(rootVariantId, depth = 0, parentBomId = null, visited = new Set()) {
  if (!rootVariantId || visited.has(rootVariantId)) return [];

  visited.add(rootVariantId);

  const rows = await odataList('ProductBOMs', {
    filter: `parent_ID eq '${rootVariantId}'`,
    top: 200
  });

  const result = [];

  for (const r of rows) {
    const current = {
      ...r,
      __depth: depth,
      __parentBomId: parentBomId
    };

    result.push(current);

    if (r.component_ID && !r.external_dpp_url) {
      const childVariantId = await getFirstVariantId(r.component_ID);

      if (childVariantId) {
        const children = await loadBomTree(childVariantId, depth + 1, r.ID, visited);
        result.push(...children);
      }
    }
  }

  return result;
}

function removeTechnicalFields(row) {
  const { __depth, __parentBomId, __isNew, ...clean } = row;
  return clean;
}

export function BomEditor({ productId, variantId, readOnly = false }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isAdvanced = useHasRole('company_advanced');

  const [row, setRow] = useState(EMPTY_ROW);
  const [editingId, setEditingId] = useState(null);
  const [childParent, setChildParent] = useState(null);
  const [originalRows, setOriginalRows] = useState([]);
  const [draftRows, setDraftRows] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const products = useQuery({
    queryKey: ['Products', 'bom-candidates'],
    queryFn: () => odataList('Products', { orderby: 'name', top: 200 })
  });

  const candidates = (products.data ?? []).filter(
    (p) => p.ID !== productId && ['material', 'component', 'packaging'].includes(p.product_type)
  );

  const productName = (id) =>
    products.data?.find((p) => p.ID === id)?.name ?? id ?? '—';

  const loadData = async () => {
    if (!variantId) return;

    setLoading(true);
    try {
      const tree = await loadBomTree(variantId);
      setOriginalRows(tree);
      setDraftRows(tree);
      setMsg(null);
    } catch (err) {
      setMsg({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Could not load BOM.'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [variantId]);

  const set = (key) => (e) => {
    setRow((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const startAddRoot = () => {
    setEditingId(null);
    setChildParent(null);
    setRow(EMPTY_ROW);
    setMsg(null);
  };

  const startAddChild = async (parentRow) => {
    if (!parentRow.component_ID || parentRow.external_dpp_url) {
      setMsg({ kind: 'error', text: 'Only internal components can have sub-components.' });
      return;
    }

    const childVariantId = await getFirstVariantId(parentRow.component_ID);

    if (!childVariantId) {
      setMsg({ kind: 'error', text: 'This component has no variant. Create a variant first.' });
      return;
    }

    setEditingId(null);
    setChildParent({
      parentBomId: parentRow.ID,
      parentVariantId: childVariantId,
      parentName: productName(parentRow.component_ID),
      depth: parentRow.__depth + 1
    });
    // Expand the parent so the new sub-component is visible once added.
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(parentRow.ID);
      return next;
    });
    setRow(EMPTY_ROW);
    setMsg(null);
  };

  const startEdit = (r) => {
    setEditingId(r.ID);
    setChildParent(null);
    setMsg(null);

    setRow({
      component_ID: r.component_ID ?? '',
      component_name: r.component_name ?? '',
      quantity: r.quantity ?? '',
      unit: r.unit ?? 'g',
      component_role: r.component_role ?? '',
      dpp_source: r.external_dpp_url ? 'external' : 'internal',
      external_dpp_url: r.external_dpp_url ?? ''
    });
  };

  const cancelAll = () => {
    setDraftRows(originalRows);
    setEditingId(null);
    setChildParent(null);
    setRow(EMPTY_ROW);
    setMsg(null);

    navigate(`/products/${productId}/variants/${variantId}/view`);
  };

  const collectChildIds = (parentBomId, sourceRows) => {
    const directChildren = sourceRows.filter((r) => r.__parentBomId === parentBomId);

    return directChildren.flatMap((child) => [
      child.ID,
      ...collectChildIds(child.ID, sourceRows)
    ]);
  };

  // Per-component consumer visibility: 'internal' hides the component from the public
  // materials tree (still counts in the CO2 aggregation). Persisted on Save all.
  const toggleRowVisibility = (id) =>
    setDraftRows((prev) =>
      prev.map((r) =>
        r.ID === id
          ? { ...r, visibility: (r.visibility ?? 'public') === 'public' ? 'internal' : 'public' }
          : r
      )
    );

  const deleteRow = (id) => {
    const idsToDelete = [id, ...collectChildIds(id, draftRows)];

    setDraftRows((prev) => prev.filter((r) => !idsToDelete.includes(r.ID)));

    if (idsToDelete.includes(editingId)) {
      setEditingId(null);
      setRow(EMPTY_ROW);
    }

    setMsg(null);
  };

  const insertAfterSubtree = (rows, parentBomId, newRow) => {
    const childIds = collectChildIds(parentBomId, rows);
    const subtreeIds = [parentBomId, ...childIds];

    let insertIndex = rows.findIndex((r) => r.ID === parentBomId);

    rows.forEach((r, index) => {
      if (subtreeIds.includes(r.ID)) insertIndex = Math.max(insertIndex, index);
    });

    return [
      ...rows.slice(0, insertIndex + 1),
      newRow,
      ...rows.slice(insertIndex + 1)
    ];
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
      setMsg({ kind: 'error', text: 'Enter the external DPP URL.' });
      return;
    }

    if (isExternal && !/^https?:\/\//i.test(externalUrl)) {
      setMsg({ kind: 'error', text: 'External DPP URL must start with https:// or http://.' });
      return;
    }

    if (row.quantity !== '' && Number(row.quantity) <= 0) {
      setMsg({ kind: 'error', text: 'Quantity must be greater than 0.' });
      return;
    }

    if (row.unit === 'pcs' && row.quantity !== '' && !Number.isInteger(Number(row.quantity))) {
      setMsg({ kind: 'error', text: 'Pieces must be a whole number.' });
      return;
    }

    const parentIdForDuplicate = editingId
      ? draftRows.find((r) => r.ID === editingId)?.parent_ID
      : childParent?.parentVariantId ?? variantId;

    if (!isExternal) {
      const duplicate = draftRows.some(
        (r) =>
          r.parent_ID === parentIdForDuplicate &&
          r.component_ID === row.component_ID &&
          r.ID !== editingId
      );

      if (duplicate) {
        setMsg({ kind: 'error', text: 'This component already exists on this level.' });
        return;
      }
    }

    const payload = {
      ID: editingId ?? newId(),
      parent_ID: parentIdForDuplicate,
      component_ID: isExternal ? null : row.component_ID,
      component_name: isExternal ? row.component_name.trim() : null,
      component_category: null,
      component_fibre_composition: null,
      quantity: row.quantity === '' ? null : Number(row.quantity),
      unit: row.unit || null,
      component_role: row.component_role || null,
      is_mandatory: true,
      status: 'active',
      sub_dpp_ID: null,
      external_dpp_url: isExternal ? externalUrl : null,
      ext_co2_footprint: null,
      ext_recycled_content_pct: null,
      __depth: editingId
        ? draftRows.find((r) => r.ID === editingId)?.__depth ?? 0
        : childParent?.depth ?? 0,
      __parentBomId: editingId
        ? draftRows.find((r) => r.ID === editingId)?.__parentBomId ?? null
        : childParent?.parentBomId ?? null,
      __isNew: !editingId
    };

    setDraftRows((prev) => {
      if (editingId) {
        return prev.map((r) => (r.ID === editingId ? { ...r, ...payload } : r));
      }

      if (childParent?.parentBomId) {
        return insertAfterSubtree(prev, childParent.parentBomId, payload);
      }

      return [...prev, payload];
    });

    setEditingId(null);
    setChildParent(null);
    setRow(EMPTY_ROW);
    setMsg({ kind: 'success', text: 'Change added. Click Save all to write it to the database.' });
  };

  const saveAll = async () => {
    setSaving(true);

    try {
      const originalIds = originalRows.map((r) => r.ID);
      const draftIds = draftRows.map((r) => r.ID);

      const deletedRows = originalRows.filter((r) => !draftIds.includes(r.ID));

      for (const r of deletedRows) {
        await odataDelete('ProductBOMs', r.ID);
      }

      for (const draft of draftRows) {
        let sub_dpp_ID = null;

        if (!draft.external_dpp_url && draft.component_ID) {
          const dpps = await odataList('DPPs', {
            filter: `product_ID eq '${draft.component_ID}'`,
            select: ['ID', 'dpp_type', 'status', 'batch_ID'],
            top: 50
          });

          sub_dpp_ID = pickComponentDpp(dpps);
        }

        const clean = {
          ...removeTechnicalFields(draft),
          sub_dpp_ID
        };

        if (originalIds.includes(draft.ID)) {
          await odataUpdate('ProductBOMs', draft.ID, clean);
        } else {
          await odataCreate('ProductBOMs', clean);
        }
      }

      qc.invalidateQueries({ queryKey: ['ProductBOMs'] });
      await loadData();

      setEditingId(null);
      setChildParent(null);
      setRow(EMPTY_ROW);
      setMsg({ kind: 'success', text: 'BOM has been saved.' });
    } catch (err) {
      setMsg({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Could not save BOM.'
      });
    } finally {
      setSaving(false);
    }
  };

  const formTitle = editingId
    ? 'Edit component'
    : childParent
      ? `Add sub-component under ${childParent.parentName}`
      : 'Add component';

  // Collapsible tree: a row is hidden when any of its ancestors is collapsed.
  const rowsById = new Map(draftRows.map((r) => [r.ID, r]));
  const parentIds = new Set(draftRows.map((r) => r.__parentBomId).filter(Boolean));
  const hasChildren = (id) => parentIds.has(id);
  const isHidden = (r) => {
    let p = r.__parentBomId;
    while (p) {
      if (collapsed.has(p)) return true;
      p = rowsById.get(p)?.__parentBomId ?? null;
    }
    return false;
  };
  const visibleRows = draftRows.filter((r) => !isHidden(r));
  const toggleCollapsed = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card>
      <CardTitle>Bill of materials</CardTitle>

      {msg && (
        <div className="mt-3">
          <Banner kind={msg.kind}>{msg.text}</Banner>
        </div>
      )}

      {loading ? (
        <p className="mt-3 text-sm text-ink-muted">Loading BOM…</p>
      ) : draftRows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <div className="min-w-[1040px]">
            <div
              className={`grid ${COLS} border-b border-black/10 text-xs font-medium uppercase tracking-wide text-ink-muted`}
            >
              <span className="border-r border-black/10 px-4 py-2">BOM ID</span>
              <span className="border-r border-black/10 px-4 py-2">Name</span>
              <span className="border-r border-black/10 px-3 py-2">DPP source</span>
              <span className="border-r border-black/10 px-3 py-2 text-right">Quantity</span>
              <span className="border-r border-black/10 px-3 py-2">Unit</span>
              <span className="border-r border-black/10 px-3 py-2">Role</span>
              <span className="border-r border-black/10 px-3 py-2">Visible</span>
              <span className="px-3 py-2" />
            </div>

            {visibleRows.map((r) => {
              const name = r.component_ID ? productName(r.component_ID) : r.component_name;

              return (
                <div
                  key={r.ID}
                  className={`grid ${COLS} items-center border-b border-black/5`}
                >
                  <div className="min-w-0 border-r border-black/10 px-3 py-3">
                    <div className="truncate font-mono text-xs text-ink-muted" title={r.ID}>
                      {r.ID}
                    </div>
                    <div className="mt-1 inline-flex rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                      Level {r.__depth + 1}
                    </div>
                  </div>

                  <div className="min-w-0 border-r border-black/10 py-3 pl-3 pr-3 text-sm font-medium text-ink">
                    <div className="flex min-w-0 items-center gap-1">
                      {r.__depth > 0 && (
                        <span
                          className="shrink-0"
                          style={{ width: `${r.__depth * 18}px` }}
                          aria-hidden="true"
                        />
                      )}
                      {hasChildren(r.ID) ? (
                        <button
                          type="button"
                          onClick={() => toggleCollapsed(r.ID)}
                          className="shrink-0 rounded p-0.5 text-ink-muted hover:bg-black/5 hover:text-ink"
                          title={collapsed.has(r.ID) ? 'Expand' : 'Collapse'}
                          aria-expanded={!collapsed.has(r.ID)}
                        >
                          {collapsed.has(r.ID) ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      ) : (
                        <span className="w-5 shrink-0" aria-hidden="true" />
                      )}
                      <span className="truncate" title={name || undefined}>
                        {name || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-0 border-r border-black/10 px-3 py-3">
                    {r.external_dpp_url ? (
                      <a
                        href={r.external_dpp_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 items-center gap-1 text-xs text-brand-700 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">External DPP</span>
                      </a>
                    ) : r.sub_dpp_ID ? (
                      <Link
                        to={`/dpps/${r.sub_dpp_ID}`}
                        className="block truncate text-xs text-brand-700 hover:underline"
                      >
                        Internal DPP
                      </Link>
                    ) : (
                      <span className="text-xs text-amber-600">Internal / no DPP</span>
                    )}
                  </div>

                  <div className="border-r border-black/10 px-3 py-3 text-right text-sm">
                    {r.quantity ?? '—'}
                  </div>

                  <div className="border-r border-black/10 px-3 py-3 text-sm">
                    {r.unit ?? '—'}
                  </div>

                  <div className="min-w-0 border-r border-black/10 px-3 py-3 text-sm">
                    <span className="truncate">{r.component_role || '—'}</span>
                  </div>

                  <div className="min-w-0 border-r border-black/10 px-3 py-3">
                    <EditableVisibilityBadge
                      value={r.visibility ?? 'public'}
                      onChange={() => toggleRowVisibility(r.ID)}
                      canEdit={!readOnly && isAdvanced}
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 px-3 py-3">
                    {!readOnly && (
                      <>
                        {r.component_ID && !r.external_dpp_url && (
                          <button
                            type="button"
                            onClick={() => startAddChild(r)}
                            className="text-ink-muted hover:text-brand-700"
                            title="Add sub-component"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}

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
                          onClick={() => deleteRow(r.ID)}
                          className="text-ink-muted hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-3 py-3 text-sm text-ink-muted">No components yet.</p>
      )}

      {!readOnly && (
        <div className="mt-4 border-t border-black/5 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-ink">{formTitle}</div>

            <Button type="button" variant="outline" onClick={startAddRoot}>
              Add root component
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow label="DPP source" htmlFor="bom-source" className="md:col-span-2">
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
                    {
                      value: '',
                      label: candidates.length ? 'Select a product…' : 'No other products'
                    },
                    ...candidates.map((c) => ({
                      value: c.ID,
                      label: `${c.name}${c.brand ? ` · ${c.brand}` : ''}`
                    }))
                  ]}
                />
              </FieldRow>
            ) : (
              <>
                <FieldRow label="Component name" htmlFor="bom-cname" className="md:col-span-2">
                  <Input
                    id="bom-cname"
                    value={row.component_name}
                    onChange={set('component_name')}
                    placeholder="e.g. Recycled polyester thread"
                    maxLength={200}
                  />
                </FieldRow>

                <FieldRow label="External DPP URL" htmlFor="bom-ext" className="md:col-span-2">
                  <Input
                    id="bom-ext"
                    value={row.external_dpp_url}
                    onChange={set('external_dpp_url')}
                    placeholder="https://supplier.example/dpp/..."
                    maxLength={2048}
                  />
                </FieldRow>
              </>
            )}

            <FieldRow label="Quantity" htmlFor="bom-qty">
              <Input
                id="bom-qty"
                type="number"
                value={row.quantity}
                onChange={set('quantity')}
                placeholder="80"
              />
            </FieldRow>

            <FieldRow label="Unit" htmlFor="bom-unit">
              <Select
                id="bom-unit"
                value={row.unit}
                onChange={set('unit')}
                options={['g', 'kg', 'pcs', '%'].map((u) => ({ value: u, label: u }))}
              />
            </FieldRow>

            <FieldRow label="Role" htmlFor="bom-role" className="md:col-span-2">
              <Input
                id="bom-role"
                value={row.component_role}
                onChange={set('component_role')}
                placeholder="Main fabric"
                maxLength={100}
              />
            </FieldRow>
          </div>

          <div className="flex justify-end gap-3 border-t border-black/5 pt-5">
            <Button type="button" variant="outline" onClick={cancelAll}>
              Cancel
            </Button>

            <Button type="button" variant="outline" onClick={submit}>
              {editingId ? 'Apply change' : 'Add change'}
            </Button>

            <Button type="button" onClick={saveAll} disabled={saving}>
              <SaveAll className="mr-2 h-4 w-4" />
              {saving ? 'Saving…' : 'Save all'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}