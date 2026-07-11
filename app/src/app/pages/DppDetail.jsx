import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { odataGet, odataList, callFunction, parseJsonFunctionResult } from '@/api/client';
import { useAction, useUpdate } from '@/api/hooks';
import { useHasRole } from '@/auth/useMe';
import { ITEM_CATALOGUE, mergeVisibility } from '@/lib/fieldCatalogue';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, StatusBadge, EditableVisibilityBadge } from '@/ui/Badge';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { Textarea, Select } from '@/ui/Form';
import { RequireRole } from '@/auth/RequireRole';
import { DocumentManager } from '@/ui/DocumentManager';
import { MarketingLinksManager } from '@/ui/MarketingLinksManager';
import { printLabels } from '@/lib/printLabels';
import { parseCustomFields } from '@/lib/customFields';
import { exportData } from '@/lib/exportExcel';
import { ExportDropdown } from '@/ui/ExportDropdown';
import { ValidationReport } from '@/ui/ValidationReport';
import { ChevronRight, Printer, AlertTriangle } from 'lucide-react';

/**
 * One label/value line in the info panels. `change` marks the field as edited but
 * not yet approved (from validationStatus.unapproved_changes): the row is tinted
 * amber with a dot + "Changed" badge, and the superseded value is shown struck
 * through next to the current one. The marker clears once the DPP is approved.
 * @param {{ label: string, value: React.ReactNode, change?: {old:string,new:string}|null }} props
 */
function Row({ label, value, change }) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-4 border-b border-black/5 py-3 last:border-0',
        change ? '-mx-2 rounded-md bg-amber-50/60 px-2' : ''
      ].join(' ')}
    >
      <span className="flex items-center gap-1.5 text-sm text-ink-muted">
        {change && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />}
        {label}
        {change && <Badge tone="amber">Changed</Badge>}
      </span>
      <span className="min-w-0 text-right text-sm text-ink">
        {change ? (
          <>
            <span className="text-xs text-ink-muted line-through">{change.old ?? '—'}</span>
            <span className="mx-1 text-ink-muted">→</span>
            <span>{value ?? '—'}</span>
          </>
        ) : (
          value ?? '—'
        )}
      </span>
    </div>
  );
}

/**
 * A monospace record ID. Renders as a deep-link to `to` when one is provided,
 * otherwise as plain text (e.g. while viewing a frozen snapshot, where live
 * navigation to the editable source pages is intentionally disabled).
 * @param {{ id?: string, to?: string|null }} props
 */
function IdValue({ id, to }) {
  if (!id) return null;
  return to ? (
    <Link to={to} className="font-mono text-xs text-brand-700 hover:underline">
      {id}
    </Link>
  ) : (
    <span className="font-mono text-xs">{id}</span>
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
            {v.source === 'approve' && (
              <Badge tone="amber" className="ml-2">Approve snapshot</Badge>
            )}
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

/** True when an ISO valid-until date is in the past (date-only comparison). */
const isExpired = (validUntil) =>
  !!validUntil && String(validUntil).slice(0, 10) < new Date().toISOString().slice(0, 10);

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
                {isExpired(d.valid_until) && (
                  <Badge tone="red" className="gap-1 font-normal">
                    <AlertTriangle className="h-3 w-3" />
                    Expired
                  </Badge>
                )}
              </div>
              <div className="truncate text-xs text-ink-muted">
                {[
                  d.issuer,
                  d.file_name,
                  d.issue_date ? `issued ${fmtDate(d.issue_date)}` : null
                ].filter(Boolean).join(' · ')}
                {d.valid_until && (
                  <span className={isExpired(d.valid_until) ? 'font-medium text-red-600' : undefined}>
                    {` · valid until ${fmtDate(d.valid_until)}`}
                  </span>
                )}
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

/**
 * Validation & readiness panel (live view): the live consumer version, whether there
 * are unpublished changes (and which version a publish would create), the missing
 * mandatory fields that block approval, and the field-level diff vs the live version.
 * Driven by the backend validationStatus() function — the same unified check
 * catalogue the approve/publish gate evaluates; the full report is rendered below.
 * Collapsible: the header always shows the at-a-glance state (blocking count,
 * pending changes); the detail rows, blocking list, full check report and the
 * field-level diff expand on click.
 * @param {{ v: { status: string, live_version: number|null, next_version: number,
 *   can_approve: boolean, missing_mandatory: {key:string,label:string,message?:string}[],
 *   checks?: object[], score?: string, pending_changes: boolean,
 *   changed_fields: {label:string, old:string, new:string}[],
 *   unapproved_changes?: {path:string,label:string,old:string,new:string}[],
 *   has_unapproved?: boolean },
 *   entities?: object }} props
 */
function ReadinessCard({ v, entities }) {
  const [open, setOpen] = useState(false);
  const blocking = v.missing_mandatory || [];
  const changed = v.changed_fields || [];
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <CardTitle>Validation &amp; readiness</CardTitle>
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {v.has_unapproved && (
            <Badge tone="amber">{(v.unapproved_changes || []).length} unapproved</Badge>
          )}
          {v.pending_changes && <Badge tone="amber">Pending changes</Badge>}
          {v.can_approve ? (
            <Badge tone="green">Complete</Badge>
          ) : (
            <Badge tone="red">{blocking.length} blocking</Badge>
          )}
        </span>
      </button>

      {open && (
        <>
          <div className="mt-2">
            <Row
              label="Live (consumer) version"
              value={v.live_version ? `v${v.live_version}` : 'Not yet published'}
            />
            <Row
              label="Pending changes"
              value={
                v.pending_changes
                  ? <Badge tone="amber">Publishing will create v{v.next_version}</Badge>
                  : 'None'
              }
            />
            <Row
              label="Mandatory checks"
              value={
                v.can_approve
                  ? <Badge tone="green">Complete</Badge>
                  : <Badge tone="red">{blocking.length} blocking</Badge>
              }
            />
          </div>

          {v.pending_changes && (
            <p className="mt-2 text-xs text-ink-muted">
              Pending edits — including field Public/Internal changes — reach the consumer
              view only after the passport is (re-)published.
            </p>
          )}

          {blocking.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-medium">Blocking checks — required before approval:</p>
              <ul className="mt-1.5 list-disc pl-5 text-xs">
                {blocking.map((m, i) => (
                  <li key={i}>{m.message || m.label}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Unapproved changes are NOT listed here — the info panels below mark the
              affected fields inline (amber, old → new). The collapsed-header badge
              keeps the count as an at-a-glance signal. */}

          {Array.isArray(v.checks) && v.checks.length > 0 && (
            <ValidationReport
              className="mt-4"
              checks={v.checks}
              entities={entities}
              summary={{
                score: v.score,
                readyToPublish: v.can_approve,
                mandatoryFailed: blocking.length
              }}
            />
          )}

          {changed.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-ink">Changes since the live version (v{v.live_version})</p>
              <div className="mt-1 divide-y divide-black/5">
                {changed.map((c, i) => (
                  <div key={i} className="py-2 text-xs">
                    <div className="font-medium text-ink">{c.label}</div>
                    <div className="text-ink-muted">
                      <span className="line-through">{c.old}</span>
                      <span className="mx-1">→</span>
                      <span className="text-ink">{c.new}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function DppDetail() {
  const { id } = useParams();
  const isAdvanced = useHasRole('company_advanced');
  const [showPublish, setShowPublish] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(/** @type {{kind:'error'|'success',text:string}|null} */ (null));
  const [co2Open, setCo2Open] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  // Version picker: '' = live (current) state; otherwise a DPPVersions.ID to view read-only.
  const [selectedVersionId, setSelectedVersionId] = useState('');

  const { data: dpp, isLoading } = useQuery({
    queryKey: ['DPPs', id],
    queryFn: () => odataGet('DPPs', id, { expand: ['product($expand=category)'] })
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

  // Readiness + drift for the validation panel (missing mandatory fields, pending
  // changes vs the live version, and the field-level diff). Returns a JSON string.
  const validationQ = useQuery({
    queryKey: ['DPPs', id, 'validation'],
    queryFn: () => callFunction(`DPPs('${id}')/DPPService.validationStatus`),
    enabled: !!dpp,
    select: parseJsonFunctionResult
  });

  const invalidate = [['DPPs', id], ['DPPs'], ['DPPVersions', id], ['DPPs', id, 'validation'], ['Validation']];
  const act = useAction('DPPs', { invalidate });
  const update = useUpdate('DPPs', { invalidate });
  const itemUpdate = useUpdate('ProductItems', {
    invalidate: [['ProductItems', 'dpp', dpp?.item_ID], ['DPPs', id, 'validation']]
  });

  if (isLoading) return <p className="text-ink-muted">Loading…</p>;
  if (!dpp) return <p className="text-ink-muted">Passport not found.</p>;

  const run = (action, payload, successText) => {
    if (
      (action === 'approveDPP' || action === 'publishDPP') &&
      !canApproveOrPublish
    ) {
      setMsg({
        kind: 'error',
        text: 'This DPP cannot be approved or published because mandatory validation checks failed.'
      });
      return;
    }

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
  };

  const publish = () => {
    if (!canApproveOrPublish) {
      setMsg({
        kind: 'error',
        text: 'This DPP cannot be published because mandatory validation checks failed.'
      });
      return;
    }

    update.mutate(
      { key: id, payload: { visibility: 'public' } },
      {
        onSuccess: () =>
          run('publishDPP', { change_reason: reason }, 'Passport published and made public.'),
        onError: (err) => setMsg({ kind: 'error', text: err.message })
      }
    );
  };

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

  // Flip the serialized item's manufacturing_date Public/Internal and persist it to the
  // item's field_visibility map (only manufacturing_date is toggleable at item level).
  const toggleItemVisibility = (target) => {
    const merged = {
      ...mergeVisibility(ITEM_CATALOGUE, itemQ.data?.field_visibility),
      manufacturing_date: target
    };
    itemUpdate.mutate(
      { key: dpp.item_ID, payload: { field_visibility: JSON.stringify(merged) } },
      {
        onSuccess: () => setMsg({ kind: 'success', text: `Manufacturing date is now ${target}. Re-publish the passport to update the consumer view.` }),
        onError: (err) => setMsg({ kind: 'error', text: err.message })
      }
    );
  };

  const s = dpp.status;
  const busy = act.isPending || update.isPending;
  const readiness = validationQ.data || null;
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
  // `category` differs by source: the live $expand returns the code-list object {code,name};
  // a frozen snapshot stores the already-resolved name string. Normalize to a display label.
  const categoryLabel = isSnapshot ? (snap.product?.category ?? null) : (dpp.product?.category?.name ?? null);
  const variant = isSnapshot ? snap.variant : variantQ.data;
  const batch = isSnapshot ? snap.batch : batchQ.data;
  const item = isSnapshot ? snap.item : itemQ.data;
  // Effective visibility of the item's manufacturing_date (catalogue default → stored
  // override), for the inline Public/Internal toggle in the live item card.
  const itemManufacturingVis = mergeVisibility(ITEM_CATALOGUE, itemQ.data?.field_visibility).manufacturing_date;

  // Unapproved-changes markers (edited but not yet re-approved): the backend's
  // field-level diff (validationStatus.unapproved_changes) mapped by path so each
  // panel row can flag itself. Live view only — a frozen snapshot is historical data.
  const unapprovedChanges = !isSnapshot ? (readiness?.unapproved_changes ?? []) : [];
  const changeByPath = Object.fromEntries(unapprovedChanges.map((c) => [c.path, c]));
  const changed = (path) => changeByPath[path] ?? null;
  const sectionChanged = (prefix) =>
    unapprovedChanges.some((c) => c.path === prefix || c.path.startsWith(`${prefix}.`));

  // Approve/publish gate — the backend's unified validation (validationStatus) is
  // authoritative; fail-closed while it is still loading.
  const canApproveOrPublish = readiness?.can_approve === true;

  // Deep-link targets for the source records — live view only. A frozen snapshot
  // shows historical data, so navigation to the live, editable pages is disabled
  // there. Record IDs are stable, so paths are built from the loaded records.
  const productHref = !isSnapshot && product?.ID ? `/products/${product.ID}` : null;
  const variantHref =
    !isSnapshot && product?.ID && variantId
      ? `/products/${product.ID}/variants/${variantId}/view`
      : null;
  const batchHref =
    !isSnapshot && product?.ID && variantId && batch?.ID
      ? `/products/${product.ID}/variants/${variantId}/batches/${batch.ID}`
      : null;
  // No dedicated item view exists — deep-link to the batch page, which lists items.
  const itemHref = batchHref;

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

  function fv(field, value) {
    return { Field: field, Value: value != null && value !== '' ? String(value) : '' };
  }

  function handleExport(format = 'xlsx') {
    const consumerUrlFull = dpp.qr_token
      ? `${window.location.origin}/consumer.html?token=${encodeURIComponent(dpp.qr_token)}`
      : '';

    const passportRows = [
      fv('Passport ID',  dpp.ID),
      fv('Type',         dpp.dpp_type),
      fv('Status',       dpp.status),
      fv('Visibility',   dpp.visibility),
      fv('Version',      dpp.current_version),
      fv('Created',      fmtDate(dpp.createdAt)),
      fv('Last updated', fmtDate(dpp.last_updated || dpp.lastChange)),
      fv('QR token',     dpp.qr_token),
      fv('Public URL',   consumerUrlFull),
    ];

    const productRows = product ? [
      fv('Name',                  product.name),
      fv('Brand',                 product.brand),
      fv('Category',              product.category),
      fv('Model',                 product.model),
      fv('GTIN',                  product.gtin),
      fv('UPC',                   product.upc),
      fv('EAN',                   product.ean),
      fv('Fibre composition',     product.fibre_composition),
      fv('Country of origin',     product.country_of_origin),
      fv('Substances of concern', product.substances_of_concern),
      fv('Care instructions',     product.care_instructions),
      fv('Repair instructions',   product.repair_instructions),
      fv('Reuse instructions',    product.reuse_instructions),
      fv('Disposal instructions', product.disposal_instructions),
      fv('Durability score',      product.durability_score),
      fv('Repairability score',   product.repairability_score),
      fv('ESPR compliance',       product.espr_compliance),
      fv('Status',                product.status),
    ] : [];

    const variantRows = variant ? [
      fv('Colour',    variant.color),
      fv('Size',      variant.size),
      fv('SKU',       variant.sku),
      fv('GTIN',      variant.gtin),
      fv('Weight (g)', variant.weight_g),
      fv('Status',    variant.status),
    ] : [];

    const batchRows = batch ? [
      fv('Batch number',           batch.batch_number),
      fv('Production date',        fmtDate(batch.production_date)),
      fv('Production stage',       batch.production_stage),
      fv('Factory',                batch.factory?.name),
      fv('Supplier',               batch.supplier?.name),
      fv('Country of origin',      batch.country_of_origin),
      fv('CO₂ footprint (kg)',     batch.co2_footprint_kg),
      fv('Recycled content (%)',   batch.recycled_content_pct),
      fv('Status',                 batch.status),
    ] : [];

    const itemRows = item ? [
      fv('Serial number',      item.serial_number),
      fv('UPI',                item.upi),
      fv('Manufacturing date', fmtDate(item.manufacturing_date)),
      fv('Status',             item.status),
    ] : [];

    const footprintRows = agg ? [
      fv('CO₂ footprint — rolled up (kg)', agg.co2_footprint_kg),
      fv('Recycled content — rolled up (%)', agg.recycled_content_pct),
      fv('Aggregation complete', agg.incomplete ? 'No' : 'Yes'),
    ] : [];

    const sheets = [
      { name: 'Passport',   rows: passportRows },
      ...(productRows.length  ? [{ name: 'Product',   rows: productRows  }] : []),
      ...(variantRows.length  ? [{ name: 'Variant',   rows: variantRows  }] : []),
      ...(batchRows.length    ? [{ name: 'Batch',     rows: batchRows    }] : []),
      ...(itemRows.length     ? [{ name: 'Item',      rows: itemRows     }] : []),
      ...(footprintRows.length ? [{ name: 'Footprint', rows: footprintRows }] : []),
    ];

    const filename = `dpp-${(product?.name ?? dpp.ID).replace(/\s+/g, '-').toLowerCase()}`;
    exportData(sheets, filename, format);
  }

  function handleExportVersionHistory(format = 'xlsx') {
    const currentVersion = dpp.current_version;
    const sorted = [...versions].sort((a, b) => a.version_number - b.version_number);

    const rowStatus = (v) => {
      if (v.source === 'approve') return 'Approval snapshot';
      if (v.version_number === currentVersion)
        return dpp.status === 'archived' ? 'Archived' : 'Live';
      return 'Superseded';
    };

    // Pre-parse all snapshot JSON once so field-comparison rows don't re-parse per cell
    const snaps = sorted.map((v) => {
      try { return v.snapshot_data ? JSON.parse(v.snapshot_data) : {}; } catch { return {}; }
    });

    // Column label per version: "v1", "v2 (approval)", etc.
    const vCols = sorted.map((v) => `v${v.version_number}${v.source === 'approve' ? ' (approval)' : ''}`);

    // Build a wide row: { Field: label, v1: val, v2: val, … }
    const wide = (field, fn) => {
      const row = { Field: field };
      sorted.forEach((v, i) => { row[vCols[i]] = fn(v, snaps[i]) ?? ''; });
      return row;
    };

    // "Who did it" — derived from version records (DPPs has no _by fields)
    const publishVers = sorted.filter((v) => v.source !== 'approve');
    const approveVers = sorted.filter((v) => v.source === 'approve');
    const lastPublish = publishVers[publishVers.length - 1];
    const lastApprove = approveVers[approveVers.length - 1];

    // ── Sheet 1: Passport ───────────────────────────────────────────────────
    const passportRows = [
      { Field: 'Passport ID',     Value: dpp.ID ?? '' },
      { Field: 'Current version', Value: currentVersion != null ? `v${currentVersion}` : '' },
      { Field: 'Status',          Value: dpp.status ?? '' },
      { Field: 'Visibility',      Value: dpp.visibility ?? '' },
      { Field: 'Approved at',     Value: fmtDate(dpp.approved_at) ?? '' },
      ...(lastApprove?.changed_by?.display_name
        ? [{ Field: 'Approved by', Value: lastApprove.changed_by.display_name }] : []),
      { Field: 'Published at',    Value: fmtDate(dpp.published_at) ?? '' },
      ...(lastPublish?.changed_by?.display_name
        ? [{ Field: 'Published by', Value: lastPublish.changed_by.display_name }] : []),
      { Field: 'Archived at',     Value: fmtDate(dpp.archived_at) ?? '' },
      { Field: 'Total publishes', Value: String(publishVers.length) },
    ];

    // ── Sheet 2: Version Timeline (wide — one column per version) ───────────
    const timelineRows = [
      wide('Status',     (v)    => rowStatus(v)),
      wide('Event type', (v)    => v.source === 'approve' ? 'Approval' : 'Publish'),
      wide('Event date', (v)    => fmtDate(v.snapshot_date)),
      wide('Visibility', (v, s) => s?.dpp?.visibility),
      wide('Changed by', (v)    => v.changed_by?.display_name),
    ];

    // ── Sheet 3: Field Comparison (wide — one column per version) ───────────
    const fieldRows = [
      wide('Product Name',              (v, s) => s?.product?.name),
      wide('Brand',                     (v, s) => s?.product?.brand),
      wide('Category',                  (v, s) => s?.product?.category),
      wide('ESPR Compliance',           (v, s) => s?.product?.espr_compliance),
      wide('Fibre Composition',         (v, s) => s?.product?.fibre_composition),
      wide('Country of Origin',         (v, s) => s?.product?.country_of_origin),
      wide('Durability Score',          (v, s) => s?.product?.durability_score),
      wide('Repairability Score',       (v, s) => s?.product?.repairability_score),
      wide('Colour',                    (v, s) => s?.variant?.color),
      wide('Size',                      (v, s) => s?.variant?.size),
      wide('CO₂ Footprint (kg)',        (v, s) => s?.batch?.co2_footprint_kg),
      wide('Recycled Content (%)',      (v, s) => s?.batch?.recycled_content_pct),
      wide('Production Stage',          (v, s) => s?.batch?.production_stage),
      wide('Country of Origin (Batch)', (v, s) => s?.batch?.country_of_origin),
      wide('Serial Number',             (v, s) => s?.item?.serial_number),
      wide('UPI',                       (v, s) => s?.item?.upi),
    ];

    // ── Filename: "Product Name version history YYYY-MM-DD HH-MM" ───────────
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10);
    const timePart = now.toTimeString().slice(0, 5).replace(':', '-');
    const histFilename = `${product?.name ?? dpp.ID} version history ${datePart} ${timePart}`;

    exportData(
      [
        { name: 'Passport',          rows: passportRows },
        ...(sorted.length ? [{ name: 'Version Timeline', rows: timelineRows }] : []),
        ...(sorted.length ? [{ name: 'Field Comparison', rows: fieldRows    }] : []),
      ],
      histFilename,
      format
    );
  }

  // DPP-level fields for the header badges and passport-details card (snapshot-aware).
  const viewType = isSnapshot ? (snap.dpp?.dpp_type ?? dpp.dpp_type) : dpp.dpp_type;
  const viewStatus = isSnapshot ? (snap.dpp?.status ?? dpp.status) : dpp.status;
  const viewVisibility = isSnapshot ? (snap.dpp?.visibility ?? dpp.visibility) : dpp.visibility;
  const viewVersion = isSnapshot ? snap.dpp?.version : dpp.current_version;

  // Options for the version picker: live first, then each saved version (newest first).
  // Approve snapshots (superseded states preserved on approval) are labelled as such.
  const versionOptions = [
    { value: '', label: 'Live (current)' },
    ...versions.map((v) => ({
      value: v.ID,
      label: `v${v.version_number}${v.source === 'approve' ? ' (approve snapshot)' : ''} · ${fmtDate(v.snapshot_date)}${v.changed_by?.display_name ? ` · ${v.changed_by.display_name}` : ''}`
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
            {!isSnapshot && readiness?.pending_changes && readiness?.live_version && (
              <Badge tone="amber">v{readiness.live_version} live · v{readiness.next_version} pending</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <ExportDropdown onExport={handleExport} label="Export" />
          <ExportDropdown
            onExport={handleExportVersionHistory}
            label="Export history"
            disabled={versionsQ.isLoading}
          />

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
                  <Button
                    disabled={busy || !canApproveOrPublish}
                    className={
                      !canApproveOrPublish
                        ? 'cursor-not-allowed bg-gray-300 text-gray-500 opacity-70'
                        : ''
                    }
                    title={
                      !canApproveOrPublish
                        ? validationQ.isLoading
                          ? 'Checking validation…'
                          : 'Fill all mandatory fields first.'
                        : undefined
                    }
                    onClick={() => run('approveDPP', undefined, 'Passport approved.')}
                  >
                    Approve
                  </Button>
                )}

              {s === 'approved' && (
                <Button
                  disabled={busy || !canApproveOrPublish}
                  className={
                    !canApproveOrPublish
                      ? 'cursor-not-allowed bg-gray-300 text-gray-500 opacity-70'
                      : ''
                  }
                  onClick={() => setShowPublish((v) => !v)}
                >
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
            <Button
              disabled={busy || !canApproveOrPublish}
              className={
                !canApproveOrPublish
                  ? 'cursor-not-allowed bg-gray-300 text-gray-500 opacity-70'
                  : ''
              }
              onClick={publish}
            >
              {busy ? 'Publishing…' : 'Confirm publish'}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Validation & readiness (live only): full check report + pending changes vs the live version ── */}
      {!isSnapshot && readiness && (
        <ReadinessCard v={readiness} entities={{ dpp, product, variant, batch, item }} />
      )}

      {/* ── Aggregated footprint — live preview, or the frozen figures of a snapshot ── */}
      <Card>
        <CardTitle>
          Aggregated footprint {isSnapshot ? '(snapshot)' : '(live preview)'}
          {!isSnapshot && (sectionChanged('bom') || sectionChanged('aggregated')) && (
            <Badge tone="amber" className="ml-2 align-middle">Changed</Badge>
          )}
        </CardTitle>
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
                value={<IdValue id={product?.ID} to={productHref} />}
              />
              <Row label="Name" value={product?.name} change={changed('product.name')} />
              <Row label="Brand" value={product?.brand} change={changed('product.brand')} />
              <Row label="Category" value={categoryLabel} change={changed('product.category')} />
              <Row label="Model" value={product?.model} change={changed('product.model')} />
              <Row label="GTIN" value={product?.gtin} change={changed('product.gtin')} />
              <Row label="UPC" value={product?.upc} change={changed('product.upc')} />
              <Row label="EAN" value={product?.ean} change={changed('product.ean')} />
              <Row label="Fibre composition" value={product?.fibre_composition} change={changed('product.fibre_composition')} />
              <Row label="Country of origin" value={product?.country_of_origin} change={changed('product.country_of_origin')} />
              <Row label="Substances of concern" value={product?.substances_of_concern} change={changed('product.substances_of_concern')} />
              <Row label="Care & washing" value={product?.care_instructions} change={changed('product.care_instructions')} />
              <Row label="Repair" value={product?.repair_instructions} change={changed('product.repair_instructions')} />
              <Row label="Reuse" value={product?.reuse_instructions} change={changed('product.reuse_instructions')} />
              <Row label="Disposal" value={product?.disposal_instructions} change={changed('product.disposal_instructions')} />
              <Row label="Durability score" value={product?.durability_score != null ? `${deNum(product.durability_score, 1)} / 10` : null} change={changed('product.durability_score')} />
              <Row label="Repairability score" value={product?.repairability_score != null ? `${deNum(product.repairability_score, 1)} / 10` : null} change={changed('product.repairability_score')} />
              <Row label="ESPR compliance" value={product?.espr_compliance} change={changed('product.espr_compliance')} />
              {parseCustomFields(product?.custom_fields).map((f) => (
                <Row key={f.label} label={f.label} value={f.value} change={changed(`product.custom_fields.${f.label}`)} />
              ))}
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
                  value={<IdValue id={variant?.ID} to={variantHref} />}
                />
                <Row label="Colour" value={variant.color} change={changed('variant.color')} />
                <Row label="Size" value={variant.size} change={changed('variant.size')} />
                <Row label="SKU" value={variant.sku} change={changed('variant.sku')} />
                <Row label="GTIN" value={variant.gtin} change={changed('variant.gtin')} />
                <Row label="Weight" value={withUnit(variant.weight_g, 'g', 0)} change={changed('variant.weight_g')} />
                {parseCustomFields(variant.custom_fields).map((f) => (
                  <Row key={f.label} label={f.label} value={f.value} change={changed(`variant.custom_fields.${f.label}`)} />
                ))}
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
                  value={<IdValue id={batch?.ID} to={batchHref} />}
                />
                <Row label="Batch number" value={batch.batch_number} change={changed('batch.batch_number')} />
                <Row label="Production date" value={fmtDate(batch.production_date)} change={changed('batch.production_date')} />
                <Row label="Production stage" value={batch.production_stage} change={changed('batch.production_stage')} />
                <Row label="Factory" value={batch.factory?.name} change={changed('batch.factory.name')} />
                <Row label="Supplier" value={batch.supplier?.name} change={changed('batch.supplier.name')} />
                <Row label="Country of origin" value={batch.country_of_origin} change={changed('batch.country_of_origin')} />
                <Row label="CO₂ footprint (own production)" value={withUnit(batch.co2_footprint_kg, 'kg')} change={changed('batch.co2_footprint_kg')} />
                {product?.product_type !== 'finished' && (
                  <Row label="Recycled content" value={withUnit(batch.recycled_content_pct, '%', 2)} change={changed('batch.recycled_content_pct')} />
                )}
                {parseCustomFields(batch.custom_fields).map((f) => (
                  <Row key={f.label} label={f.label} value={f.value} change={changed(`batch.custom_fields.${f.label}`)} />
                ))}
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
                  value={<IdValue id={item?.ID} to={itemHref} />}
                />
                <Row label="Serial number" value={<span className="font-mono text-xs">{item.serial_number}</span>} change={changed('item.serial_number')} />
                <Row label="UPI" value={<span className="font-mono text-xs">{item.upi}</span>} change={changed('item.upi')} />
                <Row
                  label="Manufacturing date"
                  value={
                    <span className="inline-flex items-center gap-2">
                      {fmtDate(item.manufacturing_date) ?? '—'}
                      {!isSnapshot && isAdvanced && dpp.item_ID && (
                        <EditableVisibilityBadge
                          value={itemManufacturingVis}
                          onChange={toggleItemVisibility}
                          canEdit={isAdvanced}
                        />
                      )}
                    </span>
                  }
                  change={changed('item.manufacturing_date')}
                />
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
                        <span className="flex flex-col gap-0.5">
                          <a
                            href={consumerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-brand-700 hover:underline"
                          >
                            Open DPP
                          </a>
                          {readiness?.pending_changes && readiness?.live_version && (
                            <span className="text-xs text-ink-muted">
                              Shows the published v{readiness.live_version}. Re-publish to apply pending changes.
                            </span>
                          )}
                        </span>
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
