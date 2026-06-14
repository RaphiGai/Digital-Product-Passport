import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { odataGet, odataList, odataCreate, odataUpdate, odataDelete, newId, ApiError } from '@/api/client';
import { useCreate } from '@/api/hooks';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { StatusBadge } from '@/ui/Badge';
import { FormSection, FieldRow, Input, Select, CountrySelect, CheckboxCard } from '@/ui/Form';

const EMPTY = {
  batch_number: '',
  production_date: '',
  country_of_origin: '',
  co2_footprint_kg: '00,00',
  recycled_content_pct: '',
  factory_ID: '',
  supplier_ID: ''
};

// ── Bulk DPP action helpers ───────────────────────────────────────────────────

async function bulkAction(dppIds, action) {
  const results = await Promise.allSettled(
    dppIds.map((id) =>
      fetch(`/odata/v4/dpp/DPPs('${id}')/DPPService.${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({})
      })
    )
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { total: dppIds.length, failed };
}

// ── Per-batch component sourcing (overrides the variant-level BOM sub_dpp) ──────
// Internal BOM line: tick the consumed component batch(es) — their footprints are
// averaged (a batch's footprint = the DPP of its first item). External line: record
// the supplier batch number (informational; footprint comes from the BOM line).

// Loads the variant's BOM lines + the production batches of every internal component.
// Shared by the create form and the per-batch editor (React Query dedupes by key).
function useVariantSourcing(vid) {
  const bomsQ = useQuery({
    queryKey: ['ProductBOMs', 'variant', vid],
    queryFn: () => odataList('ProductBOMs', { filter: `parent_ID eq '${vid}'`, top: 200 }),
    enabled: !!vid
  });
  const productsQ = useQuery({
    queryKey: ['Products', 'sourcing-names'],
    queryFn: () => odataList('Products', { select: ['ID', 'name'], orderby: 'name', top: 500 })
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
    batchesFor: (componentId) => componentBatches.filter((b) => b.variant?.product_ID === componentId),
    loading: bomsQ.isLoading,
    loadingBatches: compBatchesQ.isLoading
  };
}

// A BOM line sources externally when it has a supplier URL (or no internal product).
const isExternalLine = (b) => !!b.external_dpp_url || !b.component_ID;

// Sensible create-form default: the latest approved component batch, else the latest.
function pickDefaultComponentBatch(candidates) {
  if (!candidates?.length) return null;
  const byDateDesc = [...candidates].sort(
    (a, b) => String(b.production_date || '').localeCompare(String(a.production_date || ''))
  );
  return byDateDesc.find((c) => c.status === 'approved') ?? byDateDesc[0];
}

/**
 * Controlled per-BOM-line sourcing picker. Internal lines → multi-select of the
 * component's batches; external lines → supplier batch-number input. Purely
 * presentational: reads the current selection via selectionFor(bomId) and reports
 * changes via onToggleBatch / onSetExtNo. Reused by create (local state) and edit (live).
 */
function BatchSourcingPicker({ boms, batchesFor, nameOf, loadingBatches, selectionFor, onToggleBatch, onSetExtNo, disabled }) {
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
              {b.component_role && <span className="text-xs font-normal text-ink-muted">{b.component_role}</span>}
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
              <p className="text-xs text-amber-600">No production batches for this component yet.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BatchComponentsEditor({ batch, vid, onMsg }) {
  const qc = useQueryClient();
  const { boms, nameOf, batchesFor, loading, loadingBatches } = useVariantSourcing(vid);

  const bcQ = useQuery({
    queryKey: ['BatchComponents', batch.ID],
    queryFn: () => odataList('BatchComponents', { filter: `batch_ID eq '${batch.ID}'`, top: 200 })
  });

  // BatchComponents of this finished-good batch, grouped by BOM line.
  const bcByBom = {};
  for (const bc of bcQ.data ?? []) (bcByBom[bc.bom_ID] ??= []).push(bc);

  const selectionFor = (bomId) => {
    const rows = bcByBom[bomId] ?? [];
    return {
      batchIds: new Set(rows.map((r) => r.component_batch_ID).filter(Boolean)),
      extNo: rows.find((r) => r.external_batch_number)?.external_batch_number ?? ''
    };
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['BatchComponents', batch.ID] });
  const onErr = (err) =>
    onMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save sourcing.' });

  const toggleBatch = useMutation({
    mutationFn: ({ bomId, batchId, on }) => {
      if (on) {
        return odataCreate('BatchComponents', {
          ID: newId(), batch_ID: batch.ID, bom_ID: bomId, component_batch_ID: batchId
        });
      }
      const existing = (bcByBom[bomId] ?? []).find((bc) => bc.component_batch_ID === batchId);
      return existing ? odataDelete('BatchComponents', existing.ID) : Promise.resolve();
    },
    onSuccess: () => { invalidate(); onMsg({ kind: 'success', text: 'Component sourcing updated.' }); },
    onError: onErr
  });

  const saveExtBatchNo = useMutation({
    mutationFn: ({ bomId, value }) => {
      const existing = (bcByBom[bomId] ?? [])[0];
      if (existing) return odataUpdate('BatchComponents', existing.ID, { external_batch_number: value || null });
      return odataCreate('BatchComponents', {
        ID: newId(), batch_ID: batch.ID, bom_ID: bomId, external_batch_number: value || null
      });
    },
    onSuccess: () => { invalidate(); onMsg({ kind: 'success', text: 'Batch number saved.' }); },
    onError: onErr
  });

  if (loading || bcQ.isLoading) return <p className="px-5 py-4 text-sm text-ink-muted">Loading components…</p>;
  if (!boms.length)
    return <p className="px-5 py-4 text-sm text-ink-muted">This variant has no bill of materials.</p>;

  return (
    <div className="border-t border-black/5 bg-gray-50/60 px-5 py-4">
      <p className="mb-3 text-xs text-ink-muted">
        Record which component batches were consumed in this run. Internal components: tick the batches
        used — their CO₂/recycled values are averaged. External components: enter the supplier batch number.
      </p>
      <BatchSourcingPicker
        boms={boms}
        batchesFor={batchesFor}
        nameOf={nameOf}
        loadingBatches={loadingBatches}
        selectionFor={selectionFor}
        onToggleBatch={(bomId, batchId, on) => toggleBatch.mutate({ bomId, batchId, on })}
        onSetExtNo={(bomId, value) => saveExtBatchNo.mutate({ bomId, value })}
        disabled={toggleBatch.isPending || saveExtBatchNo.isPending}
      />
    </div>
  );
}

// ── Per-batch row ─────────────────────────────────────────────────────────────

function BatchRow({ batch, pid, vid, onMsg }) {
  const qc = useQueryClient();
  const [itemCount, setItemCount] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [compExpanded, setCompExpanded] = useState(false);

  // Items for this batch
  const itemsQ = useQuery({
    queryKey: ['ProductItems', batch.ID],
    queryFn: () => odataList('ProductItems', {
      filter: `batch_ID eq '${batch.ID}'`,
      orderby: 'serial_number',
      top: 1000
    })
  });
  const items = itemsQ.data ?? [];

  // DPPs for this batch (keyed by item_ID)
  const dppsQ = useQuery({
    queryKey: ['DPPs', 'batch', batch.ID],
    queryFn: () => odataList('DPPs', {
      filter: `batch_ID eq '${batch.ID}'`,
      select: ['ID', 'item_ID', 'status'],
      top: 1000
    }),
    enabled: items.length > 0
  });
  const dpps = dppsQ.data ?? [];
  const dppByItem = Object.fromEntries(dpps.map((d) => [d.item_ID, d]));

  const itemDpps = dpps.filter((d) => d.item_ID);
  const dppCount = itemDpps.length;

  // Group DPPs by lifecycle stage instead of requiring ALL items to share one
  // status. This lets newly added items (whose DPPs start in `draft`) be
  // approved/published even when the rest of the batch is already published.
  const draftDpps = itemDpps.filter((d) => d.status === 'draft' || d.status === 'in_review');
  const approvedDpps = itemDpps.filter((d) => d.status === 'approved');
  const publishedCount = itemDpps.filter((d) => d.status === 'published').length;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['ProductItems', batch.ID] });
    qc.invalidateQueries({ queryKey: ['DPPs', 'batch', batch.ID] });
  };

  // ── Create N items ──────────────────────────────────────────────────────────
  const createItems = useMutation({
    mutationFn: async (count) => {
      const startIndex = items.length + 1;
      for (let i = 0; i < count; i++) {
        const serial = `${batch.batch_number ?? batch.ID}-${String(startIndex + i).padStart(4, '0')}`;
        await odataCreate('ProductItems', {
          ID: newId(),
          batch_ID: batch.ID,
          serial_number: serial,
          status: 'active'
        });
      }
    },
    onSuccess: () => {
      setItemCount('');
      invalidateAll();
      onMsg({ kind: 'success', text: 'Items created.' });
    },
    onError: (err) => onMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not create items.' })
  });

  // ── Approve all DPPs ────────────────────────────────────────────────────────
  const approveAll = useMutation({
    mutationFn: () => bulkAction(draftDpps.map((d) => d.ID), 'approveDPP'),
    onSuccess: (r) => {
      invalidateAll();
      onMsg({
        kind: r.failed ? 'error' : 'success',
        text: r.failed
          ? `Approved ${r.total - r.failed} of ${r.total}; ${r.failed} failed.`
          : `All ${r.total} DPPs approved.`
      });
    },
    onError: () => onMsg({ kind: 'error', text: 'Approve all failed.' })
  });

  // ── Publish all DPPs ────────────────────────────────────────────────────────
  const publishAll = useMutation({
    mutationFn: async () => {
      // Set visibility=public on the approved DPPs first, then publish only those.
      // Restricting to `approved` avoids re-publishing already-published DPPs,
      // which would bump their version (publishDPP increments on re-publish).
      await Promise.allSettled(
        approvedDpps.map((d) =>
          fetch(`/odata/v4/dpp/DPPs('${d.ID}')`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ visibility: 'public' })
          })
        )
      );
      return bulkAction(approvedDpps.map((d) => d.ID), 'publishDPP');
    },
    onSuccess: (r) => {
      invalidateAll();
      onMsg({
        kind: r.failed ? 'error' : 'success',
        text: r.failed
          ? `Published ${r.total - r.failed} of ${r.total}; ${r.failed} failed.`
          : `All ${r.total} DPPs published.`
      });
    },
    onError: () => onMsg({ kind: 'error', text: 'Publish all failed.' })
  });

  const busy = createItems.isPending || approveAll.isPending || publishAll.isPending;
  const parsedCount = parseInt(itemCount, 10);

  return (
    <div className="border-b border-black/5 last:border-0">
      {/* ── Batch summary row ── */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{batch.batch_number ?? batch.ID}</span>
            <StatusBadge status={batch.status} />
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {[batch.production_date, batch.factory?.name, batch.supplier?.name]
              .filter(Boolean).join(' · ')}
          </div>
        </div>

        <Link to={`/products/${pid}/variants/${vid}/batches/${batch.ID}/edit`}>
          <Button variant="ghost" size="sm">Edit batch</Button>
        </Link>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-ink-muted">
            <span className="font-medium text-ink">{itemsQ.isLoading ? '…' : items.length}</span> items
          </span>
          {dppCount > 0 && (
            <span className="text-ink-muted">
              <span className="font-medium text-ink">{dppCount}</span> DPPs
            </span>
          )}
        </div>

        {/* Add items */}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min="1"
            max="100000"
            value={itemCount}
            onChange={(e) => setItemCount(e.target.value)}
            placeholder="qty"
            className="h-8 w-20 rounded-md border border-black/15 px-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!parsedCount || parsedCount < 1 || busy}
            onClick={() => createItems.mutate(parsedCount)}
          >
            {createItems.isPending ? 'Adding…' : 'Add items'}
          </Button>
        </div>

        {draftDpps.length > 0 && (
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => approveAll.mutate()}
          >
            {approveAll.isPending ? 'Approving…' : `Approve ${draftDpps.length}`}
          </Button>
        )}

        {approvedDpps.length > 0 && (
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => publishAll.mutate()}
          >
            {publishAll.isPending ? 'Publishing…' : `Publish ${approvedDpps.length}`}
          </Button>
        )}

        {publishedCount > 0 && (
          <span className="text-xs text-green-700 font-medium">
            {publishedCount === dppCount
              ? `✓ All ${dppCount} published`
              : `${publishedCount}/${dppCount} published`}
          </span>
        )}

        {/* Expand/collapse items */}
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((o) => !o)}
          >
            {expanded ? 'Hide items' : 'View items'}
          </Button>
        )}

        {/* Per-run component sourcing */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCompExpanded((o) => !o)}
        >
          {compExpanded ? 'Hide components' : 'Components'}
        </Button>
      </div>

      {/* ── Collapsible items list ── */}
      {expanded && items.length > 0 && (
        <div className="border-t border-black/5 bg-gray-50/60">
          <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-5 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            <span>Serial number</span>
            <span>Status</span>
            <span>DPP status</span>
            <span />
          </div>
          {items.map((item) => {
            const dpp = dppByItem[item.ID];
            return (
              <div
                key={item.ID}
                className="grid grid-cols-[2fr_1fr_1fr_auto] items-center gap-4 border-t border-black/5 px-5 py-2.5"
              >
                <span className="font-mono text-xs text-ink">{item.serial_number || item.ID}</span>
                <StatusBadge status={item.status} />
                <span className="text-xs text-ink-muted">
                  {dpp ? <StatusBadge status={dpp.status} /> : '—'}
                </span>
                <div>
                  {dpp ? (
                    <Link to={`/dpps/${dpp.ID}`}>
                      <Button variant="outline" size="sm">Open DPP</Button>
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-muted">No DPP</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Collapsible component sourcing ── */}
      {compExpanded && <BatchComponentsEditor batch={batch} vid={vid} onMsg={onMsg} />}
    </div>
  );
}

// ── Main BatchView ────────────────────────────────────────────────────────────

function formatCo2Input(value) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (!digits) return '00,00';

  const padded = digits.padStart(3, '0');
  const euros = padded.slice(0, -2);
  const cents = padded.slice(-2);

  return `${euros},${cents}`;
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

export function BatchView() {
  const { pid, vid } = useParams();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState(null);

  const variantQ = useQuery({
    queryKey: ['ProductVariants', 'one', vid],
    queryFn: () => odataGet('ProductVariants', vid)
  });
  const productQ = useQuery({
    queryKey: ['Products', pid, 'name'],
    queryFn: () => odataGet('Products', pid, { select: ['ID', 'name', 'product_type'] })
  });
  const batchesQ = useQuery({
    queryKey: ['Batches', vid],
    queryFn: () => odataList('Batches', {
      filter: `variant_ID eq '${vid}'`,
      expand: ['factory', 'supplier'],
      orderby: 'batch_number',
      top: 200
    })
  });
  const partnersQ = useQuery({
    queryKey: ['BusinessPartners', 'pickers'],
    queryFn: () => odataList('BusinessPartners', { orderby: 'name', top: 200 })
  });

  const partnerOptions = [
    { value: '', label: '— none —' },
    ...(partnersQ.data ?? []).map((p) => ({ value: p.ID, label: p.name }))
  ];

  // Recycled content is a leaf-material input; a finished product's value is
  // computed from its BOM, so it isn't entered on a finished batch.
  const showRecycled = productQ.data?.product_type !== 'finished';

const set = (key) => (e) => {
  const value = e.target.value;

  if (key === 'co2_footprint_kg') {
    setForm((f) => ({ ...f, [key]: formatCo2Input(value) }));
    return;
  }

  setForm((f) => ({ ...f, [key]: value }));
};

  // Component sourcing collected up-front and saved together with the new batch.
  const { boms, componentBatches, nameOf, batchesFor, loadingBatches } = useVariantSourcing(vid);
  const [sourcing, setSourcing] = useState({}); // { [bomId]: { batchIds: Set, extNo: string } }

  const buildInitialSourcing = useCallback(() => {
    const init = {};
    for (const b of boms) {
      if (isExternalLine(b)) { init[b.ID] = { batchIds: new Set(), extNo: '' }; continue; }
      const candidates = componentBatches.filter((cb) => cb.variant?.product_ID === b.component_ID);
      const def = pickDefaultComponentBatch(candidates);
      init[b.ID] = { batchIds: new Set(def ? [def.ID] : []), extNo: '' };
    }
    return init;
  }, [boms, componentBatches]);

  // Pre-select sensible defaults once the BOM + component batches have loaded.
  useEffect(() => {
    if (!boms.length || loadingBatches) return;
    setSourcing((prev) => (Object.keys(prev).length ? prev : buildInitialSourcing()));
  }, [boms, loadingBatches, buildInitialSourcing]);

  const toggleSourcingBatch = (bomId, batchId, on) =>
    setSourcing((prev) => {
      const cur = prev[bomId] ?? { batchIds: new Set(), extNo: '' };
      const batchIds = new Set(cur.batchIds);
      if (on) batchIds.add(batchId); else batchIds.delete(batchId);
      return { ...prev, [bomId]: { ...cur, batchIds } };
    });
  const setSourcingExtNo = (bomId, value) =>
    setSourcing((prev) => ({ ...prev, [bomId]: { ...(prev[bomId] ?? { batchIds: new Set() }), extNo: value } }));

  const addBatch = useMutation({
    mutationFn: async () => {
      const batchId = newId();
      await odataCreate('Batches', {
        ID: batchId,
        variant_ID: vid,
        batch_number: form.batch_number.trim(),
        production_date: form.production_date || null,
        country_of_origin: form.country_of_origin || null,
        co2_footprint_kg: parseCo2(form.co2_footprint_kg),
        recycled_content_pct: showRecycled && form.recycled_content_pct ? Number(form.recycled_content_pct) : null,
        factory_ID: form.factory_ID || null,
        supplier_ID: form.supplier_ID || null,
        status: 'draft'
      });
      // Persist the per-BOM-line component sourcing for the new batch (optional per line).
      for (const b of boms) {
        const sel = sourcing[b.ID];
        if (!sel) continue;
        if (isExternalLine(b)) {
          if (sel.extNo) {
            await odataCreate('BatchComponents', { ID: newId(), batch_ID: batchId, bom_ID: b.ID, external_batch_number: sel.extNo });
          }
        } else {
          for (const cbId of sel.batchIds) {
            await odataCreate('BatchComponents', { ID: newId(), batch_ID: batchId, bom_ID: b.ID, component_batch_ID: cbId });
          }
        }
      }
    },
    onSuccess: () => {
      setForm(EMPTY);
      setSourcing(buildInitialSourcing());
      setMsg({ kind: 'success', text: 'Batch added.' });
      qc.invalidateQueries({ queryKey: ['Batches', vid] });
      qc.invalidateQueries({ queryKey: ['BatchComponents'] });
    },
    onError: (err) =>
      setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not add batch.' })
  });

const submit = (e) => {
    e.preventDefault();
    setMsg(null);

    const batchNumber = form.batch_number.trim();

    if (!batchNumber) {
      setMsg({ kind: 'error', text: 'Batch number is required.' });
      return;
    }

    if (batchNumber.length > 40) {
      setMsg({ kind: 'error', text: 'Batch number can have maximum 40 characters.' });
      return;
    }

    const exists = (batchesQ.data ?? []).some(
      (b) => b.batch_number?.trim().toLowerCase() === batchNumber.toLowerCase()
    );

    if (exists) {
      setMsg({ kind: 'error', text: 'This batch number already exists.' });
      return;
    }

    if (!isPastDate(form.production_date)) {
      setMsg({ kind: 'error', text: 'Production date must be in the past.' });
      return;
    }

    if (form.recycled_content_pct !== '') {
      const rec = Number(form.recycled_content_pct);
      if (rec < 0 || rec > 100) {
        setMsg({ kind: 'error', text: 'Recycled content must be between 0 and 100 %.' });
        return;
      }
    }

    addBatch.mutate();
  };

  const label = variantQ.data
    ? [variantQ.data.color, variantQ.data.size].filter(Boolean).join(' / ') || variantQ.data.sku
    : '';

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
          Add items to a batch, then create and approve DPPs for all items at once.
        </p>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {/* Production batches card */}
      <Card className="p-0">
        <div className="px-5 pt-5 pb-3">
          <CardTitle>Production batches</CardTitle>
          <p className="mt-0.5 text-xs text-ink-muted">
            Per batch: add items → create DPPs → approve all → publish all.
          </p>
        </div>

        {batchesQ.isLoading && (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">Loading…</p>
        )}
        {!batchesQ.isLoading && (batchesQ.data ?? []).length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">No batches yet — add one below.</p>
        )}
        {(batchesQ.data ?? []).map((b) => (
          <BatchRow
            key={b.ID}
            batch={b}
            pid={pid}
            vid={vid}
            onMsg={setMsg}
          />
        ))}
      </Card>

      {/* Add batch form */}
      <form onSubmit={submit}>
        <Card className="p-6">
          <FormSection title="Add batch" description="A concrete production run of this variant.">
            <FieldRow label="Batch number" required visibility="internal" htmlFor="bn">
              <Input id="bn" value={form.batch_number} onChange={set('batch_number')} maxLength={40} placeholder="2026-06-A" />
            </FieldRow>
            <FieldRow label="Production date" visibility="internal" htmlFor="pd">
              <Input id="pd" type="date" value={form.production_date} onChange={set('production_date')} />
            </FieldRow>
            <FieldRow label="Country of origin" visibility="public" htmlFor="coo">
              <CountrySelect id="coo" value={form.country_of_origin} onChange={set('country_of_origin')} />
            </FieldRow>
            <FieldRow label="Factory" visibility="internal" htmlFor="factory">
              <Select id="factory" value={form.factory_ID} onChange={set('factory_ID')} options={partnerOptions} />
            </FieldRow>
            <FieldRow label="Supplier" visibility="internal" htmlFor="supplier">
              <Select id="supplier" value={form.supplier_ID} onChange={set('supplier_ID')} options={partnerOptions} />
            </FieldRow>
            <FieldRow label="CO₂ footprint (own production)" visibility="public" htmlFor="co2"
              hint="This product's OWN production, per its consumption unit (per finished piece for finished goods, per kg for a material sold by weight).">
              <Input
                id="co2"
                inputMode="numeric"
                value={form.co2_footprint_kg}
                onChange={set('co2_footprint_kg')}
                placeholder="00,00"
              />
            </FieldRow>
            {showRecycled && (
              <FieldRow label="Recycled content (%)" visibility="public" htmlFor="rc"
                hint="Only for materials/components — a finished product's recycled content is computed from its BOM.">
                <Input id="rc" type="number" step="0.01" value={form.recycled_content_pct} onChange={set('recycled_content_pct')} />
              </FieldRow>
            )}
          </FormSection>

          {boms.length > 0 && (
            <div className="mt-6 border-t border-black/5 pt-5">
              <h3 className="text-sm font-semibold text-ink">Component sourcing</h3>
              <p className="mb-3 mt-0.5 text-xs text-ink-muted">
                Which component batches were consumed in this run — internal lines average the selected
                batches; external lines record the supplier batch number. Leave a line empty to use the
                variant&apos;s BOM default.
              </p>
              <BatchSourcingPicker
                boms={boms}
                batchesFor={batchesFor}
                nameOf={nameOf}
                loadingBatches={loadingBatches}
                selectionFor={(bomId) => sourcing[bomId] ?? { batchIds: new Set(), extNo: '' }}
                onToggleBatch={toggleSourcingBatch}
                onSetExtNo={setSourcingExtNo}
                disabled={addBatch.isPending}
              />
            </div>
          )}

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
