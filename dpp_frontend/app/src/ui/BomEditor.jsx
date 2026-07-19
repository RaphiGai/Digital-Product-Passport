import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Pencil, ExternalLink, Plus, SaveAll, ChevronDown, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { odataList, odataCreate, odataUpdate, odataDelete, newId, ApiError } from '@/api/client';
import { useHasRole } from '@/auth/useMe';
import { Card, CardTitle } from './Card';
import { Button } from './Button';
import { Banner } from './Breadcrumb';
import { Badge, StatusBadge, EditableVisibilityBadge } from './Badge';
import { FieldRow, Input, Select } from './Form';

const EMPTY_ROW = {
  component_ID: '',
  component_name: '',
  quantity: '',
  unit: 'g',
  quantity_visibility: 'internal',
  component_role: '',
  ext_espr_compliance: '',
  dpp_source: 'internal',
  external_dpp_url: ''
};

const COLS =
  'grid-cols-[170px_minmax(0,3fr)_150px_80px_64px_minmax(0,2fr)_120px_104px]';

// Enriched read-only view: BOM ID | Component | ESPR | CO₂ | Brand/Mfr | Origin | Supplier | Sub-comps | DPP source | Certificates | Visible
const COLS_ENRICHED =
  'grid-cols-[120px_minmax(0,2fr)_130px_80px_110px_75px_minmax(0,1fr)_80px_140px_100px_90px]';

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

async function loadBomTree(parentId, depth = 0, parentBomId = null, visited = new Set()) {
  if (!parentId || visited.has(parentId)) return [];

  visited.add(parentId);

  const rows = await odataList('ProductBOMs', {
    filter: `parent_ID eq '${parentId}'`,
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

    // 1) Load children saved directly under this BOM row
    const directChildren = await loadBomTree(r.ID, depth + 1, r.ID, visited);
    result.push(...directChildren);

    // 2) Also load children from the component product's first variant
    if (r.component_ID) {
      const childVariantId = await getFirstVariantId(r.component_ID);

      if (childVariantId) {
        const variantChildren = await loadBomTree(childVariantId, depth + 1, r.ID, visited);
        result.push(...variantChildren);
      }
    }
  }

  return result.filter(
    (row, index, arr) => arr.findIndex((x) => x.ID === row.ID) === index
  );
}

function removeTechnicalFields(row) {
  const { __depth, __parentBomId, __isNew, ...clean } = row;
  return clean;
}

export function BomEditor({ productId, variantId, readOnly = false, showEnriched = false }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isAdvanced = useHasRole('company_advanced');

  const [row, setRow] = useState(EMPTY_ROW);
  const [editingId, setEditingId] = useState(null);
  const [childParent, setChildParent] = useState(null);
  const [originalRows, setOriginalRows] = useState([]);
  const [draftRows, setDraftRows] = useState([]);
  const [deletedIds, setDeletedIds] = useState(() => new Set());
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const products = useQuery({
    queryKey: ['Products', 'bom-candidates'],
    queryFn: () => odataList('Products', { orderby: 'name', top: 200 })
  });


  const enrichedQ = useQuery({
    queryKey: ['ProductBOMs', variantId, 'enriched'],
    queryFn: () =>
      odataList('ProductBOMs', {
        filter: `parent_ID eq '${variantId}'`,
        top: 200,
        expand: [
          'component($select=ID,name,brand,country_of_origin,espr_compliance,substances_of_concern)',
          'sub_dpp($select=ID,status)',
        ],
      }),
    enabled: readOnly && showEnriched && !!variantId,
  });

  const enrichedMap = useMemo(() => {
    const m = new Map();
    for (const r of enrichedQ.data ?? []) m.set(r.ID, r);
    return m;
  }, [enrichedQ.data]);

  const componentIds = useMemo(
    () => [...new Set((enrichedQ.data ?? []).filter((r) => r.component_ID).map((r) => r.component_ID))],
    [enrichedQ.data]
  );

  // For internal BOM components: derive supplier from the component product's batch data.
  const componentSupplierQ = useQuery({
    queryKey: ['ComponentSuppliers', componentIds],
    queryFn: async () => {
      const variants = await odataList('ProductVariants', {
        filter: componentIds.map((id) => `product_ID eq '${id}'`).join(' or '),
        select: ['ID', 'product_ID'],
        top: 500,
      });
      if (!variants.length) return new Map();
      const variantIds = variants.map((v) => v.ID);
      const batches = await odataList('Batches', {
        filter: variantIds.map((id) => `variant_ID eq '${id}'`).join(' or '),
        expand: ['supplier($select=ID,name)'],
        select: ['variant_ID', 'supplier_ID'],
        top: 500,
      });
      const variantToProduct = new Map(variants.map((v) => [v.ID, v.product_ID]));
      const result = new Map();
      for (const b of batches) {
        if (!b.supplier?.name) continue;
        const pid = variantToProduct.get(b.variant_ID);
        if (pid && !result.has(pid)) result.set(pid, b.supplier.name);
      }
      return result;
    },
    enabled: readOnly && showEnriched && componentIds.length > 0,
  });

  // For internal BOM components: derive CO2 from the component product's batch data.
  const componentCO2Q = useQuery({
    queryKey: ['ComponentCO2', componentIds],
    queryFn: async () => {
      const variants = await odataList('ProductVariants', {
        filter: componentIds.map((id) => `product_ID eq '${id}'`).join(' or '),
        select: ['ID', 'product_ID'],
        top: 500,
      });
      if (!variants.length) return new Map();
      const variantIds = variants.map((v) => v.ID);
      const batches = await odataList('Batches', {
        filter: variantIds.map((id) => `variant_ID eq '${id}'`).join(' or '),
        select: ['variant_ID', 'co2_footprint_kg'],
        top: 500,
      });
      const variantToProduct = new Map(variants.map((v) => [v.ID, v.product_ID]));
      const result = new Map();
      for (const b of batches) {
        if (b.co2_footprint_kg == null) continue;
        const pid = variantToProduct.get(b.variant_ID);
        if (pid && !result.has(pid)) result.set(pid, b.co2_footprint_kg);
      }
      return result;
    },
    enabled: readOnly && showEnriched && componentIds.length > 0,
  });

  // Documents can be anchored to a product OR a batch. Fetch both so that certificates
  // added at the batch level of a component DPP are picked up.
  const documentsQ = useQuery({
    queryKey: ['Documents', 'certificates', componentIds],
    queryFn: async () => {
      // Step 1: resolve variant → batch IDs for component products.
      const variants = await odataList('ProductVariants', {
        filter: componentIds.map((id) => `product_ID eq '${id}'`).join(' or '),
        select: ['ID', 'product_ID'],
        top: 500,
      });
      const variantToProduct = new Map(variants.map((v) => [v.ID, v.product_ID]));
      const variantIds = variants.map((v) => v.ID);

      const batchToProduct = new Map();
      if (variantIds.length) {
        const batches = await odataList('Batches', {
          filter: variantIds.map((id) => `variant_ID eq '${id}'`).join(' or '),
          select: ['ID', 'variant_ID'],
          top: 500,
        });
        for (const b of batches) {
          const pid = variantToProduct.get(b.variant_ID);
          if (pid) batchToProduct.set(b.ID, pid);
        }
      }

      // Step 2: query Documents by product_ID OR batch_ID of component products.
      const filters = [
        ...componentIds.map((id) => `product_ID eq '${id}'`),
        ...[...batchToProduct.keys()].map((id) => `batch_ID eq '${id}'`),
      ];
      if (!filters.length) return [];

      const docs = await odataList('Documents', {
        filter: `(${filters.join(' or ')}) and doc_type eq 'certificate'`,
        select: ['ID', 'product_ID', 'batch_ID', 'visibility'],
        top: 500,
      });

      // Normalise: ensure every doc has product_ID resolved (batch-level docs via batchToProduct).
      return docs.map((d) => ({
        ...d,
        product_ID: d.product_ID || batchToProduct.get(d.batch_ID) || null,
      }));
    },
    enabled: readOnly && showEnriched && componentIds.length > 0,
  });

  const certMap = useMemo(() => {
    const m = new Map();
    for (const doc of documentsQ.data ?? []) {
      if (!doc.product_ID) continue;
      if (!m.has(doc.product_ID)) m.set(doc.product_ID, { published: 0, unpublished: 0 });
      const entry = m.get(doc.product_ID);
      if (doc.visibility === 'public') entry.published += 1;
      else entry.unpublished += 1;
    }
    return m;
  }, [documentsQ.data]);

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
      setDeletedIds(new Set());
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
    let parentId = parentRow.ID;

    // If the parent is an internal component with its own variant,
    // save the child under that variant.
    if (parentRow.component_ID) {
      const childVariantId = await getFirstVariantId(parentRow.component_ID);
      if (childVariantId) parentId = childVariantId;
    }

    setEditingId(null);
    setChildParent({
      parentBomId: parentRow.ID,
      parentId,
      parentName: parentRow.component_ID
        ? productName(parentRow.component_ID)
        : parentRow.component_name || parentRow.ID,
      depth: parentRow.__depth + 1
    });

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
      quantity_visibility: r.quantity_visibility ?? 'internal',
      component_role: r.component_role ?? '',
      ext_espr_compliance: r.ext_espr_compliance ?? '',
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
    setDeletedIds(new Set());

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

    setDeletedIds((prev) => {
      const next = new Set(prev);
      idsToDelete.forEach((x) => next.add(x));
      return next;
    });

    setDraftRows((prev) => prev.filter((r) => !idsToDelete.includes(r.ID)));

    if (idsToDelete.includes(editingId)) {
      setEditingId(null);
      setChildParent(null);
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

  const isFormDirty = () =>
    row.component_ID ||
    row.component_name ||
    row.quantity ||
    row.component_role ||
    row.external_dpp_url ||
    row.dpp_source !== EMPTY_ROW.dpp_source ||
    row.unit !== EMPTY_ROW.unit;

  const applyCurrentFormToRows = (sourceRows) => {
    const isExternal = row.dpp_source === 'external';
    const externalUrl = row.external_dpp_url.trim();

    if (!isExternal && !row.component_ID) {
      throw new Error('Pick a component product.');
    }

    if (isExternal && !row.component_name.trim()) {
      throw new Error('Enter the component name.');
    }

    if (isExternal && !externalUrl) {
      throw new Error('Enter the external DPP URL.');
    }

    if (isExternal && !/^https?:\/\//i.test(externalUrl)) {
      throw new Error('External DPP URL must start with https:// or http://.');
    }

    if (row.quantity === '' || row.quantity === null || row.quantity === undefined) {
      throw new Error('Enter the quantity.');
    }

    if (Number(row.quantity) <= 0) {
      throw new Error('Quantity must be greater than 0.');
    }

    if (row.unit === 'pcs' && row.quantity !== '' && !Number.isInteger(Number(row.quantity))) {
      throw new Error('Pieces must be a whole number.');
    }

    const existingRow = editingId
      ? sourceRows.find((r) => r.ID === editingId)
      : null;

    const parentIdForDuplicate = editingId
      ? existingRow?.parent_ID
      : childParent?.parentId ?? variantId;

    if (!isExternal) {
      const duplicate = sourceRows.some(
        (r) =>
          r.parent_ID === parentIdForDuplicate &&
          r.component_ID === row.component_ID &&
          r.ID !== editingId
      );

      if (duplicate) {
        throw new Error('This component already exists on this level.');
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
      quantity_visibility: row.quantity_visibility || 'internal',
      component_role: row.component_role || null,
      ext_espr_compliance: isExternal ? (row.ext_espr_compliance || null) : null,
      is_mandatory: true,
      status: 'active',
      sub_dpp_ID: null,
      external_dpp_url: isExternal ? externalUrl : null,
      ext_co2_footprint: null,
      ext_recycled_content_pct: null,
      __depth: editingId ? existingRow?.__depth ?? 0 : childParent?.depth ?? 0,
      __parentBomId: editingId ? existingRow?.__parentBomId ?? null : childParent?.parentBomId ?? null,
      __isNew: !editingId
    };

    if (editingId) {
      return sourceRows.map((r) => (r.ID === editingId ? { ...r, ...payload } : r));
    }

    if (childParent?.parentBomId) {
      return insertAfterSubtree(sourceRows, childParent.parentBomId, payload);
    }

    return [...sourceRows, payload];
  };

  const submit = () => {
    try {
      const nextRows = applyCurrentFormToRows(draftRows);

      setDraftRows(nextRows);
      setEditingId(null);
      setChildParent(null);
      setRow(EMPTY_ROW);
      setMsg({ kind: 'success', text: 'Change added. Click Save all to write it to the database.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  };

  const saveAll = async () => {
    setSaving(true);

    try {
      let rowsToSave = draftRows.filter((r) => !deletedIds.has(r.ID));

      if (editingId || childParent || isFormDirty()) {
        rowsToSave = applyCurrentFormToRows(rowsToSave);
        setDraftRows(rowsToSave);
      }

      const originalIds = originalRows.map((r) => r.ID);
      const draftIds = rowsToSave.map((r) => r.ID);

      const deletedRows = originalRows.filter(
        (r) => deletedIds.has(r.ID) || !draftIds.includes(r.ID)
      );

      for (const r of deletedRows) {
        await odataDelete('ProductBOMs', r.ID);
      }

      for (const draft of rowsToSave) {
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

      setDeletedIds(new Set());
      await loadData();

      setEditingId(null);
      setChildParent(null);
      setRow(EMPTY_ROW);
      setMsg({ kind: 'success', text: 'BOM has been saved.' });
    } catch (err) {
      setMsg({
        kind: 'error',
        text: err instanceof ApiError ? err.message : err.message || 'Could not save BOM.'
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
        readOnly && showEnriched ? (
          /* ── Enriched read-only view (US4.8) ─────────────────────────────── */
          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[1280px]">
              <div className={`grid ${COLS_ENRICHED} border-b border-black/10 text-xs font-medium uppercase tracking-wide text-ink-muted`}>
                <span className="border-r border-black/10 px-3 py-2">BOM ID</span>
                <span className="border-r border-black/10 px-3 py-2">Component</span>
                <span className="border-r border-black/10 px-3 py-2">ESPR Compliance</span>
                <span className="border-r border-black/10 px-3 py-2 text-right">CO₂ (kg)</span>
                <span className="border-r border-black/10 px-3 py-2">Brand</span>
                <span className="border-r border-black/10 px-3 py-2">Origin</span>
                <span className="border-r border-black/10 px-3 py-2">Supplier</span>
                <span className="border-r border-black/10 px-3 py-2 text-center">Sub-comps</span>
                <span className="border-r border-black/10 px-3 py-2">DPP source</span>
                <span className="border-r border-black/10 px-3 py-2">Certificates</span>
                <span className="px-3 py-2">Visible</span>
              </div>

              {visibleRows.map((r) => {
                const name = r.component_ID ? productName(r.component_ID) : r.component_name;
                const enriched = enrichedMap.get(r.ID);
                const comp = enriched?.component;
                const directChildren = draftRows.filter((x) => x.__parentBomId === r.ID).length;
                const hasSubstances =
                  comp?.substances_of_concern &&
                  comp.substances_of_concern.toLowerCase() !== 'none';
                const cert = certMap.get(r.component_ID ?? '');

                return (
                  <div key={r.ID} className={`grid ${COLS_ENRICHED} items-center border-b border-black/5 hover:bg-gray-50/40`}>
                    {/* BOM ID */}
                    <div className="min-w-0 border-r border-black/10 px-3 py-3">
                      <div className="truncate font-mono text-xs text-ink-muted" title={r.ID}>{r.ID}</div>
                      <div className="mt-1 inline-flex rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-ink-muted">
                        Level {r.__depth + 1}
                      </div>
                    </div>

                    {/* Component name + role + qty/unit */}
                    <div className="min-w-0 border-r border-black/10 py-3 pl-3 pr-3">
                      <div className="flex min-w-0 items-start gap-1">
                        {r.__depth > 0 && (
                          <span className="mt-0.5 shrink-0" style={{ width: `${r.__depth * 18}px` }} aria-hidden="true" />
                        )}
                        {hasChildren(r.ID) ? (
                          <button type="button" onClick={() => toggleCollapsed(r.ID)} className="mt-0.5 shrink-0 rounded p-0.5 text-ink-muted hover:bg-black/5 hover:text-ink" title={collapsed.has(r.ID) ? 'Expand' : 'Collapse'} aria-expanded={!collapsed.has(r.ID)}>
                            {collapsed.has(r.ID) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        ) : (
                          <span className="mt-0.5 w-5 shrink-0" aria-hidden="true" />
                        )}
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink" title={name || undefined}>{name || '—'}</span>
                          {(r.component_role || r.quantity != null) && (
                            <span className="block text-xs text-ink-muted">
                              {[r.component_role, r.quantity != null ? `${r.quantity} ${r.unit ?? ''}`.trim() : null].filter(Boolean).join(' · ')}
                            </span>
                          )}
                          {hasSubstances && (
                            <span className="block text-xs text-amber-700">⚠ Substances of concern</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ESPR Compliance */}
                    <div className="border-r border-black/10 px-3 py-3">
                      {(() => {
                        const status = r.component_ID ? comp?.espr_compliance : r.ext_espr_compliance;
                        return status
                          ? <StatusBadge status={status} />
                          : <span className="text-xs text-ink-muted">—</span>;
                      })()}
                    </div>

                    {/* CO₂: internal → derived from component's batch; external → manual override */}
                    <div className="border-r border-black/10 px-3 py-3 text-right text-sm text-ink">
                      {(() => {
                        const val = r.component_ID
                          ? componentCO2Q.data?.get(r.component_ID)
                          : r.ext_co2_footprint;
                        return val != null
                          ? Number(val).toFixed(2)
                          : <span className="text-xs text-ink-muted">—</span>;
                      })()}
                    </div>

                    {/* Brand */}
                    <div className="min-w-0 border-r border-black/10 px-3 py-3">
                      {comp?.brand
                        ? <span className="block truncate text-sm text-ink">{comp.brand}</span>
                        : <span className="text-xs text-ink-muted">—</span>}
                    </div>

                    {/* Origin (Country) */}
                    <div className="border-r border-black/10 px-3 py-3">
                      {comp?.country_of_origin
                        ? <Badge tone="gray">{comp.country_of_origin}</Badge>
                        : <span className="text-xs text-ink-muted">—</span>}
                    </div>

                    {/* Supplier: internal components only — derived from the component product's batch data */}
                    <div className="min-w-0 border-r border-black/10 px-3 py-3">
                      {(() => {
                        const name = r.component_ID
                          ? componentSupplierQ.data?.get(r.component_ID)
                          : null;
                        return name
                          ? <span className="block truncate text-sm text-ink">{name}</span>
                          : <span className="text-xs text-ink-muted">—</span>;
                      })()}
                    </div>

                    {/* Sub-components count */}
                    <div className="border-r border-black/10 px-3 py-3 text-center">
                      {directChildren > 0
                        ? <Badge tone="blue">{directChildren}</Badge>
                        : <span className="text-xs text-ink-muted">—</span>}
                    </div>

                    {/* DPP source — same format as standard view */}
                    <div className="min-w-0 border-r border-black/10 px-3 py-3">
                      {r.external_dpp_url ? (
                        <a href={r.external_dpp_url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-xs text-brand-700 hover:underline">
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          <span className="truncate">External DPP</span>
                        </a>
                      ) : r.sub_dpp_ID ? (
                        <Link to={`/dpps/${r.sub_dpp_ID}`} className="block truncate text-xs text-brand-700 hover:underline">
                          Internal DPP
                        </Link>
                      ) : (
                        <span className="text-xs text-amber-600">Internal / no DPP</span>
                      )}
                    </div>

                    {/* Certificates (uploaded PDFs) */}
                    <div className="border-r border-black/10 px-3 py-3 text-xs">
                      {!cert ? (
                        <span className="text-ink-muted">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {cert.published > 0 && (
                            <span className="text-green-700">{cert.published} public</span>
                          )}
                          {cert.unpublished > 0 && (
                            <span className="text-ink-muted">{cert.unpublished} internal</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Visible */}
                    <div className="px-3 py-3">
                      <EditableVisibilityBadge value={r.visibility ?? 'public'} onChange={() => {}} canEdit={false} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── Standard view (edit mode or plain read-only) ───────────────── */
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
                          {!readOnly && (
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
        )
      ) : (
        <p className="mt-3 py-3 text-sm text-ink-muted">No components yet.</p>
      )}

      {!readOnly && (
        <div className="mt-4 border-t border-black/5 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-ink">{formTitle}</div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow label="DPP source" htmlFor="bom-source" className="md:col-span-2">
              <Select
                id="bom-source"
                value={row.dpp_source}
                onChange={(e) => setRow((prev) => ({
                  ...prev,
                  dpp_source: e.target.value,
                }))}
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
                required
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

            <FieldRow
              label="Quantity on consumer view"
              htmlFor="bom-qty-vis"
              className="md:col-span-2"
              hint="Show this amount (e.g. 1.5 kg) on the public passport, or keep it internal. The amount always counts towards the CO₂/recycled figures either way."
            >
              <Select
                id="bom-qty-vis"
                value={row.quantity_visibility ?? 'internal'}
                onChange={set('quantity_visibility')}
                options={[
                  { value: 'internal', label: 'Internal — hidden from the passport' },
                  { value: 'public', label: 'Public — shown on the passport' }
                ]}
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

            {row.dpp_source === 'external' && (
              <FieldRow label="ESPR Compliance" htmlFor="bom-espr" className="md:col-span-2">
                <Select
                  id="bom-espr"
                  value={row.ext_espr_compliance}
                  onChange={set('ext_espr_compliance')}
                  options={[
                    { value: '', label: '— not set' },
                    { value: 'draft', label: 'Draft' },
                    { value: 'in_review', label: 'In review' },
                    { value: 'compliant', label: 'Compliant' },
                    { value: 'non_compliant', label: 'Non-compliant' },
                  ]}
                />
              </FieldRow>
            )}
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