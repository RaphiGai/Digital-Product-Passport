import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { odataGet, odataList, odataCreate, newId, ApiError } from '@/api/client';
import { useCreate } from '@/api/hooks';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { StatusBadge } from '@/ui/Badge';
import { FormSection, FieldRow, Input, Select } from '@/ui/Form';

const EMPTY = {
  batch_number: '',
  production_date: '',
  country_of_origin: '',
  co2_footprint_kg: '',
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

// ── Per-batch row ─────────────────────────────────────────────────────────────

function BatchRow({ batch, pid, vid, onMsg }) {
  const qc = useQueryClient();
  const [itemCount, setItemCount] = useState('');
  const [expanded, setExpanded] = useState(false);

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

  const dppCount = dpps.length;
  const dppsMatchItems = dppCount === items.length && items.length > 0;
  const allDraft = dppsMatchItems && dpps.every((d) => d.status === 'draft');
  const allApproved = dppsMatchItems && dpps.every((d) => d.status === 'approved');
  const allPublished = dppsMatchItems && dpps.every((d) => d.status === 'published');
  const anyPublished = dpps.some((d) => d.status === 'published');

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

  // ── Create one DPP per item ─────────────────────────────────────────────────
  const createDpps = useMutation({
    mutationFn: async () => {
      const withoutDpp = items.filter((item) => !dppByItem[item.ID]);
      for (const item of withoutDpp) {
        await odataCreate('DPPs', {
          ID: newId(),
          product_ID: pid,
          batch_ID: batch.ID,
          item_ID: item.ID,
          dpp_type: 'product',
          visibility: 'internal',
          status: 'draft'
        });
      }
      return withoutDpp.length;
    },
    onSuccess: (n) => {
      invalidateAll();
      onMsg({ kind: 'success', text: `${n} DPP draft${n !== 1 ? 's' : ''} created.` });
    },
    onError: (err) => onMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not create DPPs.' })
  });

  // ── Approve all DPPs ────────────────────────────────────────────────────────
  const approveAll = useMutation({
    mutationFn: () => bulkAction(dpps.map((d) => d.ID), 'approveDPP'),
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
      // Set visibility=public first on all, then publish
      await Promise.allSettled(
        dpps.map((d) =>
          fetch(`/odata/v4/dpp/DPPs('${d.ID}')`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ visibility: 'public' })
          })
        )
      );
      return bulkAction(dpps.map((d) => d.ID), 'publishDPP');
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

  const busy = createItems.isPending || createDpps.isPending || approveAll.isPending || publishAll.isPending;
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

        {/* Bulk DPP actions — shown based on state */}
        {items.length > 0 && dppCount === 0 && (
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => createDpps.mutate()}
          >
            {createDpps.isPending ? 'Creating…' : `Create ${items.length} DPPs`}
          </Button>
        )}

        {items.length > 0 && dppCount > 0 && dppCount < items.length && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => createDpps.mutate()}>
            {createDpps.isPending ? 'Creating…' : `Create missing DPPs (${items.length - dppCount})`}
          </Button>
        )}

        {allDraft && dppCount > 0 && (
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => approveAll.mutate()}
          >
            {approveAll.isPending ? 'Approving…' : `Approve all (${dppCount})`}
          </Button>
        )}

        {allApproved && (
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => publishAll.mutate()}
          >
            {publishAll.isPending ? 'Publishing…' : `Publish all (${dppCount})`}
          </Button>
        )}

        {anyPublished && (
          <span className="text-xs text-green-700 font-medium">
            {allPublished
              ? `✓ All ${dppCount} published`
              : `${dpps.filter((d) => d.status === 'published').length}/${items.length} published`}
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
    </div>
  );
}

// ── Main BatchView ────────────────────────────────────────────────────────────

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
    queryFn: () => odataGet('Products', pid, { select: ['ID', 'name'] })
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

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const addBatch = useMutation({
    mutationFn: () =>
      odataCreate('Batches', {
        ID: newId(),
        variant_ID: vid,
        batch_number: form.batch_number.trim(),
        production_date: form.production_date || null,
        country_of_origin: form.country_of_origin || null,
        co2_footprint_kg: form.co2_footprint_kg ? Number(form.co2_footprint_kg) : null,
        recycled_content_pct: form.recycled_content_pct ? Number(form.recycled_content_pct) : null,
        factory_ID: form.factory_ID || null,
        supplier_ID: form.supplier_ID || null,
        status: 'draft'
      }),
    onSuccess: () => {
      setForm(EMPTY);
      setMsg({ kind: 'success', text: 'Batch added.' });
      qc.invalidateQueries({ queryKey: ['Batches', vid] });
    },
    onError: (err) =>
      setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not add batch.' })
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
            <FieldRow label="Supplier" visibility="internal" htmlFor="supplier">
              <Select id="supplier" value={form.supplier_ID} onChange={set('supplier_ID')} options={partnerOptions} />
            </FieldRow>
            <FieldRow label="CO₂ footprint (kg)" visibility="public" htmlFor="co2">
              <Input id="co2" type="number" step="0.001" value={form.co2_footprint_kg} onChange={set('co2_footprint_kg')} />
            </FieldRow>
            <FieldRow label="Recycled content (%)" visibility="public" htmlFor="rc">
              <Input id="rc" type="number" step="0.01" value={form.recycled_content_pct} onChange={set('recycled_content_pct')} />
            </FieldRow>
          </FormSection>
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
