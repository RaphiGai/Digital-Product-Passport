import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { odataGet, odataList, callFunction } from '@/api/client';
import { useAction, useUpdate } from '@/api/hooks';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, StatusBadge } from '@/ui/Badge';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { Textarea, Select } from '@/ui/Form';
import { RequireRole } from '@/auth/RequireRole';
import { DocumentManager } from '@/ui/DocumentManager';
import { MarketingLinksManager } from '@/ui/MarketingLinksManager';
import { printLabels } from '@/lib/printLabels';
import { ChevronRight, Printer } from 'lucide-react';

/** @param {{ label: string, value: React.ReactNode }} props */
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/5 py-3 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="min-w-0 text-right text-sm text-ink">{value ?? '—'}</span>
    </div>
  );
}

/** One version row (US5.9), expandable to the frozen snapshot of that publish. */
function VersionRow({ v }) {
  const [open, setOpen] = useState(false);
  let snap = null;
  if (open && v.snapshot_data) {
    try {
      snap = JSON.parse(v.snapshot_data);
    } catch {
      snap = null;
    }
  }
  return (
    <div className="border-b border-black/5 py-3 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="min-w-0">
            <span className="text-sm font-medium text-ink">v{v.version_number}</span>
            {v.change_reason && <span className="ml-2 text-xs text-ink-muted">{v.change_reason}</span>}
          </span>
        </span>
        <span className="shrink-0 text-right text-xs text-ink-muted">
          {fmtDate(v.snapshot_date)}
          {v.changed_by?.display_name ? ` · ${v.changed_by.display_name}` : ''}
        </span>
      </button>
      {open && snap && (
        <div className="ml-5 mt-2 space-y-0.5 rounded-lg bg-gray-50/60 px-3 py-2 text-xs text-ink-muted">
          {snap.product?.name && (
            <div>
              Product: <span className="text-ink">{[snap.product.name, snap.product.brand, snap.product.category].filter(Boolean).join(' · ')}</span>
            </div>
          )}
          {snap.variant && (
            <div>
              Variant: <span className="text-ink">{[snap.variant.color, snap.variant.size, snap.variant.sku].filter(Boolean).join(' / ') || '—'}</span>
            </div>
          )}
          {snap.batch && (
            <div>
              Batch: <span className="text-ink">{[snap.batch.batch_number, fmtDate(snap.batch.production_date)].filter(Boolean).join(' · ') || '—'}</span>
            </div>
          )}
          {snap.captured_at && (
            <div>Captured: <span className="text-ink">{fmtDate(snap.captured_at)}</span></div>
          )}
        </div>
      )}
    </div>
  );
}

/** Read-only version history card (US5.9). One row per published version. */
function VersionHistoryCard({ dppId }) {
  const q = useQuery({
    queryKey: ['DPPVersions', dppId],
    queryFn: () =>
      odataList('DPPVersions', {
        filter: `dpp_ID eq '${dppId}'`,
        orderby: 'version_number desc',
        expand: ['changed_by($select=ID,display_name)']
      }),
    enabled: !!dppId
  });
  const rows = q.data ?? [];
  return (
    <Card>
      <CardTitle>Version history</CardTitle>
      {q.isLoading ? (
        <p className="mt-3 text-sm text-ink-muted">Loading…</p>
      ) : rows.length ? (
        <div className="mt-2">
          {rows.map((v) => (
            <VersionRow key={v.ID} v={v} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">No version history yet — publish the passport to record a version.</p>
      )}
    </Card>
  );
}

/** German-formatted number (de-DE): comma decimal, dot thousands. */
const fmtDE = (v, digits) =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(v));
/** Decimal value (OData serialises Decimal as a string) in de-DE with a unit, or null. */
const withUnit = (v, unit, digits = 2) => (v == null || v === '' ? null : `${fmtDE(v, digits)} ${unit}`);
/** Decimal value in de-DE, or em-dash. */
const deNum = (v, digits = 2) => (v == null || v === '' ? '—' : fmtDE(v, digits));
/** Quantity in de-DE, up to 3 decimals, no trailing zeros. */
const deQty = (v) => (v == null ? '' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(Number(v)));

/** ISO date → DD.MM.YYYY (German standard). */
const fmtDate = (v) => {
  if (!v) return null;
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(v).slice(0, 10);
};

/** Read-only marketing-link list rendered from a frozen version snapshot. */
function SnapshotMarketingList({ links }) {
  return (
    <Card>
      <CardTitle>Marketing links</CardTitle>
      {links?.length ? (
        <div className="mt-2 divide-y divide-black/5">
          {links.map((l, i) => (
            <div key={i} className="py-3">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-ink">{l.title}</span>
                <Badge tone="gray" className="font-normal">{l.link_type}</Badge>
                {l.is_active === false && <Badge tone="amber" className="font-normal">Inactive</Badge>}
              </div>
              <div className="truncate text-xs text-ink-muted">
                {[
                  l.url,
                  l.valid_from || l.valid_to ? `valid ${fmtDate(l.valid_from) ?? '…'} – ${fmtDate(l.valid_to) ?? '…'}` : null
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">No marketing links in this version.</p>
      )}
    </Card>
  );
}

/** Read-only document/certificate list rendered from a frozen version snapshot. */
function SnapshotDocumentList({ docs }) {
  return (
    <Card>
      <CardTitle>Documents &amp; certificates</CardTitle>
      {docs?.length ? (
        <div className="mt-2 divide-y divide-black/5">
          {docs.map((d, i) => (
            <div key={i} className="py-3">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-ink">{d.title || d.file_name}</span>
                {d.doc_type && <Badge tone="gray" className="font-normal">{d.doc_type}</Badge>}
                {d.visibility && <Badge tone="gray" className="font-normal">{d.visibility}</Badge>}
              </div>
              <div className="truncate text-xs text-ink-muted">
                {[
                  d.issuer,
                  d.file_name,
                  d.issue_date ? `issued ${fmtDate(d.issue_date)}` : null,
                  d.valid_until ? `valid until ${fmtDate(d.valid_until)}` : null
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">No documents in this version.</p>
      )}
    </Card>
  );
}

export function DppDetail() {
  const { id } = useParams();
  const [showPublish, setShowPublish] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(/** @type {{kind:'error'|'success',text:string}|null} */ (null));
  const [co2Open, setCo2Open] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  // Version picker: '' = live (current) state; otherwise a DPPVersions.ID to view read-only.
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [versionReason, setVersionReason] = useState('');

  const { data: dpp, isLoading } = useQuery({
    queryKey: ['DPPs', id],
    queryFn: () => odataGet('DPPs', id, { expand: ['product'] })
  });

  // Source records assigned to this DPP — loaded individually (nested $expand is brittle).
  const batchQ = useQuery({
    queryKey: ['Batches', 'dpp', dpp?.batch_ID],
    queryFn: () => odataGet('Batches', dpp.batch_ID, { expand: ['factory', 'supplier'] }),
    enabled: !!dpp?.batch_ID
  });
  const variantId = dpp?.variant_ID || batchQ.data?.variant_ID;
  const variantQ = useQuery({
    queryKey: ['ProductVariants', 'dpp', variantId],
    queryFn: () => odataGet('ProductVariants', variantId),
    enabled: !!variantId
  });
  const itemQ = useQuery({
    queryKey: ['ProductItems', 'dpp', dpp?.item_ID],
    queryFn: () => odataGet('ProductItems', dpp.item_ID),
    enabled: !!dpp?.item_ID
  });

  // Live BOM rollup for review before publishing.
  const aggQ = useQuery({
    queryKey: ['DPPs', id, 'aggregated'],
    queryFn: () => callFunction(`DPPs('${id}')/DPPService.aggregatedFootprint`),
    enabled: !!dpp
  });

  // Fetches the QR code image from the backend as base64 (only after publishing).
  const qrQ = useQuery({
    queryKey: ['DPPs', id, 'qr'],
    queryFn: () => callFunction(`DPPs('${id}')/DPPService.generateQRCode`),
    enabled: !!dpp?.qr_token
  });

  // Owning organization's website — printed on the QR label.
  const orgQ = useQuery({
    queryKey: ['Organizations', dpp?.product?.owning_organization_ID],
    queryFn: () =>
      odataGet('Organizations', dpp.product.owning_organization_ID, { select: ['ID', 'website_url'] }),
    enabled: !!dpp?.product?.owning_organization_ID
  });

  // Saved versions for the picker (shares its cache key with VersionHistoryCard).
  const versionsQ = useQuery({
    queryKey: ['DPPVersions', id],
    queryFn: () =>
      odataList('DPPVersions', {
        filter: `dpp_ID eq '${id}'`,
        orderby: 'version_number desc',
        expand: ['changed_by($select=ID,display_name)']
      }),
    enabled: !!id
  });

  const invalidate = [['DPPs', id], ['DPPs'], ['DPPVersions', id]];
  const act = useAction('DPPs', { invalidate });
  const update = useUpdate('DPPs', { invalidate });

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!dpp) return <p className="text-ink-muted">Passport not found.</p>;

  const run = (action, payload, successText) =>
    act.mutate(
      { key: id, action, payload },
      {
        onSuccess: () => {
          setMsg({ kind: 'success', text: successText });
          setShowPublish(false);
          setReason('');
        },
        onError: (err) => setMsg({ kind: 'error', text: err.message })
      }
    );

  const publish = () =>
    update.mutate(
      { key: id, payload: { visibility: 'public' } },
      {
        onSuccess: () => run('publishDPP', { change_reason: reason }, 'Passport published and made public.'),
        onError: (err) => setMsg({ kind: 'error', text: err.message })
      }
    );

  const toggleVisibility = () => {
    const target = dpp.visibility === 'public' ? 'internal' : 'public';
    update.mutate(
      { key: id, payload: { visibility: target } },
      {
        onSuccess: () => setMsg({ kind: 'success', text: `Passport is now ${target}.` }),
        onError: (err) => setMsg({ kind: 'error', text: err.message })
      }
    );
  };

  const createVersion = () =>
    act.mutate(
      { key: id, action: 'createDPPVersion', payload: { change_reason: versionReason } },
      {
        onSuccess: () => {
          setMsg({ kind: 'success', text: 'Version created.' });
          setShowVersionDialog(false);
          setVersionReason('');
        },
        onError: (err) => setMsg({ kind: 'error', text: err.message })
      }
    );

  const s = dpp.status;
  const busy = act.isPending || update.isPending;

  // Consumer passport URL — opens the public consumer view (same page a QR scan
  // lands on), via the consumer.html?token= entry point. Relative path so it
  // resolves against the current origin in dev (Vite, :5173) and in production
  // (Approuter serves consumer.html).
  const consumerUrl = dpp.qr_token
    ? `/consumer.html?token=${encodeURIComponent(dpp.qr_token)}`
    : null;

  // ── Version view: live (current) state, or a frozen snapshot when one is picked ──
  const versions = versionsQ.data ?? [];
  const selectedVersion = versions.find((v) => v.ID === selectedVersionId) || null;
  let snap = null;
  if (selectedVersion?.snapshot_data) {
    try { snap = JSON.parse(selectedVersion.snapshot_data); } catch { snap = null; }
  }
  const isSnapshot = !!snap;

  // Panel data is driven by `view` — the snapshot in version mode, live queries otherwise.
  const product = isSnapshot ? snap.product : dpp.product;
  const variant = isSnapshot ? snap.variant : variantQ.data;
  const batch = isSnapshot ? snap.batch : batchQ.data;
  const item = isSnapshot ? snap.item : itemQ.data;

  // Footprint: snapshot stores parsed objects; the live aggregatedFootprint action
  // serialises `missing`/`breakdown` as JSON strings → parse only in the live case.
  const agg = isSnapshot ? snap.aggregated : aggQ.data;
  let missing = [];
  let breakdown = null;
  if (isSnapshot) {
    missing = snap.aggregated?.missing ?? [];
    breakdown = snap.aggregated?.breakdown ?? null;
  } else {
    if (agg?.missing) {
      try { missing = JSON.parse(agg.missing); } catch { missing = []; }
    }
    if (agg?.breakdown) {
      try { breakdown = JSON.parse(agg.breakdown); } catch { breakdown = null; }
    }
  }
  const recycledParts = (breakdown?.components ?? []).filter((c) => c.mass_kg != null && c.recycled_pct != null);

  // DPP-level fields for the header badges and passport-details card (snapshot-aware).
  const viewType = isSnapshot ? (snap.dpp?.dpp_type ?? dpp.dpp_type) : dpp.dpp_type;
  const viewStatus = isSnapshot ? (snap.dpp?.status ?? dpp.status) : dpp.status;
  const viewVisibility = isSnapshot ? (snap.dpp?.visibility ?? dpp.visibility) : dpp.visibility;
  const viewVersion = isSnapshot ? snap.dpp?.version : dpp.current_version;

  // Options for the version picker: live first, then each saved version (newest first).
  const versionOptions = [
    { value: '', label: 'Live (current)' },
    ...versions.map((v) => ({
      value: v.ID,
      label: `v${v.version_number} · ${fmtDate(v.snapshot_date)}${v.changed_by?.display_name ? ` · ${v.changed_by.display_name}` : ''}`
    }))
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'DPPs', to: '/dpps' },
          { label: dpp.product?.name ?? 'Passport' }
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{product?.name ?? 'Digital product passport'}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={viewStatus} />
            <StatusBadge status={viewVisibility} />
            <Badge tone="gray">{viewType}</Badge>
            <span className="text-sm text-ink-muted">v{viewVersion ?? 1}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Version picker — view any saved snapshot read-only. Available to all roles. */}
          <Select
            aria-label="View version"
            value={selectedVersionId}
            onChange={(e) => setSelectedVersionId(e.target.value)}
            options={versionOptions}
            className="w-60"
          />

          {/* Lifecycle + versioning actions — hidden while viewing a past snapshot. */}
          {!isSnapshot && (
            <RequireRole role="company_advanced">
              {(s === 'draft' || s === 'in_review') && (
                <Button disabled={busy} onClick={() => run('approveDPP', undefined, 'Passport approved.')}>
                  Approve
                </Button>
              )}
              {s === 'approved' && (
                <Button disabled={busy} onClick={() => setShowPublish((v) => !v)}>
                  Publish
                </Button>
              )}
              {s === 'published' && (
                <Button variant="outline" disabled={busy} onClick={toggleVisibility}>
                  {dpp.visibility === 'public' ? 'Make internal' : 'Make public'}
                </Button>
              )}
              {s === 'published' && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => run('regenerateQRToken', undefined, 'QR token regenerated.')}
                >
                  Regenerate QR token
                </Button>
              )}
              {s !== 'archived' && (
                <Button variant="outline" disabled={busy} onClick={() => setShowVersionDialog((v) => !v)}>
                  Create version
                </Button>
              )}
              {s !== 'archived' && (
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => run('archiveDPP', undefined, 'Passport archived.')}
                >
                  Archive
                </Button>
              )}
              {s === 'archived' && (
                <Button
                  disabled={busy}
                  onClick={() => run('unarchiveDPP', undefined, 'Passport unarchived.')}
                >
                  Unarchive
                </Button>
              )}
            </RequireRole>
          )}
        </div>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {isSnapshot && (
        <Banner kind="warning">
          You are viewing version v{snap.dpp?.version} from {fmtDate(snap.captured_at)} (read-only).
          Switch back to <span className="font-medium">Live (current)</span> to make changes.
        </Banner>
      )}

      {!isSnapshot && (s === 'draft' || s === 'in_review' || s === 'approved') && (
        <Banner kind="info">Review all data assigned to this passport below before publishing.</Banner>
      )}

      {!isSnapshot && s === 'archived' && (
        <Banner kind="warning">
          This passport is archived. It stays visible to consumers via its QR code and link, but
          cannot be edited or published. Unarchive it to make changes.
        </Banner>
      )}

      {!isSnapshot && showPublish && (
        <Card className="space-y-3 border-brand-200">
          <CardTitle>Publish passport</CardTitle>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Change reason (optional, max 500 chars)"
            maxLength={500}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPublish(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={publish}>
              {busy ? 'Publishing…' : 'Confirm publish'}
            </Button>
          </div>
        </Card>
      )}

      {!isSnapshot && showVersionDialog && (
        <Card className="space-y-3 border-brand-200">
          <CardTitle>Create version</CardTitle>
          <p className="text-sm text-ink-muted">
            Saves a snapshot of the current passport state. It stays retrievable read-only from the
            version picker and advances the version number.
          </p>
          <Textarea
            rows={2}
            value={versionReason}
            onChange={(e) => setVersionReason(e.target.value)}
            placeholder="Reason / note (optional, max 500 chars)"
            maxLength={500}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowVersionDialog(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={createVersion}>
              {busy ? 'Saving…' : 'Save version'}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Aggregated footprint — live preview, or the frozen figures of a snapshot ── */}
      <Card>
        <CardTitle>Aggregated footprint {isSnapshot ? '(snapshot)' : '(live preview)'}</CardTitle>
        {!isSnapshot && aggQ.isLoading ? (
          <p className="mt-3 text-sm text-ink-muted">Computing…</p>
        ) : (
          <>
            <div className="mt-2">
              {/* CO₂ — expandable per-component breakdown */}
              <button
                type="button"
                onClick={() => setCo2Open((o) => !o)}
                className="flex w-full items-center justify-between gap-4 border-b border-black/5 py-3 text-left"
              >
                <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${co2Open ? 'rotate-90' : ''}`} />
                  CO₂ footprint (rolled up)
                </span>
                <span className="text-right text-sm font-medium text-ink">
                  {withUnit(agg?.co2_footprint_kg, 'kg CO₂e') ?? '—'}
                </span>
              </button>
              {co2Open && breakdown && (
                <div className="border-b border-black/5 bg-gray-50/60 px-4 py-2">
                  <div className="flex justify-between py-1 text-xs">
                    <span className="text-ink-muted">Own production</span>
                    <span className="text-ink">{deNum(breakdown.own_co2_kg)} kg</span>
                  </div>
                  {(breakdown.components ?? []).map((c, i) => (
                    <div key={i} className="flex justify-between gap-3 py-1 text-xs">
                      <span className="min-w-0 truncate text-ink-muted">
                        {c.name}
                        {c.quantity != null && (
                          <span className="ml-1 text-ink-muted/70">({deQty(c.quantity)} {c.unit})</span>
                        )}
                      </span>
                      <span className={c.co2_kg == null ? 'shrink-0 text-amber-600' : 'shrink-0 text-ink'}>
                        {c.co2_kg == null ? 'no value' : `${deNum(c.co2_kg)} kg`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recycled — expandable per-component breakdown */}
              <button
                type="button"
                onClick={() => setRecOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-4 border-b border-black/5 py-3 text-left last:border-0"
              >
                <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${recOpen ? 'rotate-90' : ''}`} />
                  Recycled content (rolled up)
                </span>
                <span className="text-right text-sm font-medium text-ink">
                  {withUnit(agg?.recycled_content_pct, '%') ?? '—'}
                </span>
              </button>
              {recOpen && breakdown && (
                <div className="bg-gray-50/60 px-4 py-2">
                  <p className="py-1 text-xs text-ink-muted">Mass-weighted average (ISO 14021):</p>
                  {recycledParts.map((c, i) => (
                    <div key={i} className="flex justify-between gap-3 py-1 text-xs">
                      <span className="min-w-0 truncate text-ink-muted">{c.name} · {deNum(c.mass_kg, 3)} kg</span>
                      <span className="shrink-0 text-ink">{deNum(c.recycled_pct)} %</span>
                    </div>
                  ))}
                  {recycledParts.length === 0 && (
                    <p className="py-1 text-xs text-ink-muted">No mass-bearing components — using the batch value.</p>
                  )}
                </div>
              )}
            </div>
            {agg?.incomplete && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Aggregation is incomplete — {missing.length} component edge
                {missing.length === 1 ? '' : 's'} could not be resolved
                {missing.length > 0 && (
                  <ul className="mt-1.5 list-disc pl-5 text-xs">
                    {missing.slice(0, 8).map((m, i) => (
                      <li key={i}>
                        {m.component_ID ? `${m.component_ID}: ` : ''}{m.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          {/* ── Product master data ── */}
          <Card>
            <CardTitle>Product</CardTitle>
            <div className="mt-2">
              <Row
                label="Product ID"
                value={<span className="font-mono text-xs">{product?.ID}</span>}
              />
              <Row label="Name" value={product?.name} />
              <Row label="Brand" value={product?.brand} />
              <Row label="Category" value={product?.category} />
              <Row label="Model" value={product?.model} />
              <Row label="GTIN" value={product?.gtin} />
              <Row label="Fibre composition" value={product?.fibre_composition} />
              <Row label="Country of origin" value={product?.country_of_origin} />
              <Row label="Substances of concern" value={product?.substances_of_concern} />
              <Row label="Care & washing" value={product?.care_instructions} />
              <Row label="Repair" value={product?.repair_instructions} />
              <Row label="Reuse" value={product?.reuse_instructions} />
              <Row label="Disposal" value={product?.disposal_instructions} />
              <Row label="Durability score" value={product?.durability_score != null ? `${deNum(product.durability_score, 1)} / 10` : null} />
              <Row label="Repairability score" value={product?.repairability_score != null ? `${deNum(product.repairability_score, 1)} / 10` : null} />
              <Row label="ESPR compliance" value={product?.espr_compliance} />
            </div>
          </Card>

          {/* ── Variant ── */}
          {variant && (
            <Card>
              <CardTitle>Variant</CardTitle>
              {(variant.image_data || variant.image_url) && (
                <img
                  src={variant.image_data || variant.image_url}
                  alt={variant.sku || 'Variant'}
                  className="mb-3 mt-3 h-28 w-28 rounded-lg border border-black/10 object-cover"
                />
              )}
              <div className="mt-2">
                <Row
                  label="Variant ID"
                  value={<span className="font-mono text-xs">{variant?.ID}</span>}
                />
                <Row label="Colour" value={variant.color} />
                <Row label="Size" value={variant.size} />
                <Row label="SKU" value={variant.sku} />
                <Row label="GTIN" value={variant.gtin} />
                <Row label="Weight" value={withUnit(variant.weight_g, 'g', 0)} />
              </div>
            </Card>
          )}

          {/* ── Batch / production ── */}
          {batch && (
            <Card>
              <CardTitle>Batch &amp; production</CardTitle>
              <div className="mt-2">
                <Row
                  label="Batch ID"
                  value={<span className="font-mono text-xs">{batch?.ID}</span>}
                />
                <Row label="Batch number" value={batch.batch_number} />
                <Row label="Production date" value={fmtDate(batch.production_date)} />
                <Row label="Production stage" value={batch.production_stage} />
                <Row label="Factory" value={batch.factory?.name} />
                <Row label="Supplier" value={batch.supplier?.name} />
                <Row label="Country of origin" value={batch.country_of_origin} />
                <Row label="CO₂ footprint (own production)" value={withUnit(batch.co2_footprint_kg, 'kg')} />
                {product?.product_type !== 'finished' && (
                  <Row label="Recycled content" value={withUnit(batch.recycled_content_pct, '%', 2)} />
                )}
                <Row label="Status" value={<StatusBadge status={batch.status} />} />
              </div>
            </Card>
          )}

          {/* ── Serialized item ── */}
          {item && (
            <Card>
              <CardTitle>Item</CardTitle>
              <div className="mt-2">
                <Row
                  label="Item ID"
                  value={<span className="font-mono text-xs">{item?.ID}</span>}
                />
                <Row label="Serial number" value={<span className="font-mono text-xs">{item.serial_number}</span>} />
                <Row label="UPI" value={<span className="font-mono text-xs">{item.upi}</span>} />
                <Row label="Manufacturing date" value={fmtDate(item.manufacturing_date)} />
                <Row label="Status" value={<StatusBadge status={item.status} />} />
              </div>
            </Card>
          )}

          {/* ── Certificates & documents — live managers, or the snapshot's frozen list ── */}
          {isSnapshot ? (
            <SnapshotDocumentList docs={snap.documents} />
          ) : (
            <>
              {product && (
                <DocumentManager scope="product" ownerId={product.ID} readOnly title="Product documents & certificates" />
              )}
              {batch && (
                <DocumentManager scope="batch" ownerId={batch.ID} readOnly title="Batch documents & certificates" />
              )}
            </>
          )}

          {/* ── Marketing links (US5.8) — live manager, or the snapshot's frozen list ── */}
          {isSnapshot ? (
            <SnapshotMarketingList links={snap.marketing_links} />
          ) : (
            <MarketingLinksManager dppId={id} />
          )}

          {/* ── Version history (US5.9) ── */}
          <VersionHistoryCard dppId={id} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle>Passport details</CardTitle>
            <div className="mt-2">
              <Row label="Passport ID" value={<span className="font-mono text-xs">{dpp.ID}</span>} />
              <Row label="Type" value={viewType} />
              <Row label="Status" value={<StatusBadge status={viewStatus} />} />
              <Row label="Visibility" value={<StatusBadge status={viewVisibility} />} />
              <Row label="Version" value={viewVersion} />
              {isSnapshot ? (
                <>
                  <Row label="Snapshot captured" value={fmtDate(snap.captured_at)} />
                  {selectedVersion?.change_reason && <Row label="Reason" value={selectedVersion.change_reason} />}
                  {selectedVersion?.changed_by?.display_name && (
                    <Row label="Saved by" value={selectedVersion.changed_by.display_name} />
                  )}
                </>
              ) : (
                <>
                  <Row label="Created" value={fmtDate(dpp.createdAt)} />
                  <Row label="Last updated" value={fmtDate(dpp.last_updated || dpp.lastChange)} />
                  <Row label="QR token" value={dpp.qr_token ? <span className="break-all font-mono text-xs">{dpp.qr_token}</span> : null} />
                  <Row
                    label="Public URL"
                    value={
                      consumerUrl ? (
                        <a
                          href={consumerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-brand-700 hover:underline"
                        >
                          Open DPP
                        </a>
                      ) : null
                    }
                  />
                </>
              )}
            </div>
          </Card>

          {!isSnapshot && (
          <Card>
            <CardTitle>QR code</CardTitle>
            {qrQ.data?.png ? (
              <div className="mt-3 flex flex-col items-center gap-3">
                <img
                  src={`data:image/png;base64,${qrQ.data.png}`}
                  alt="DPP QR code"
                  className="h-44 w-44 rounded-lg border border-black/5"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const ok = printLabels(
                      [
                        {
                          token: dpp.qr_token,
                          name: product?.name,
                          brand: product?.brand,
                          dpp_id: dpp.ID,
                          product_id: product?.ID,
                          batch_number: batch?.batch_number,
                          serial_number: item?.serial_number,
                          upi: item?.upi,
                          website: orgQ.data?.website_url
                        }
                      ],
                      { title: `QR label — ${product?.name ?? dpp.ID}` }
                    );
                    if (!ok) setMsg({ kind: 'error', text: 'Could not open the print window — allow pop-ups for this site.' });
                  }}
                >
                  <Printer className="h-4 w-4" /> Print label
                </Button>
                <span className="text-xs text-ink-muted">Label includes product &amp; identification data</span>
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                {dpp.qr_token ? 'Loading QR…' : 'No QR yet — publish the passport to generate one.'}
              </p>
            )}
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}
