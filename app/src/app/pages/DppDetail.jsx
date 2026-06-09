import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { odataGet, callFunction } from '@/api/client';
import { useAction, useUpdate } from '@/api/hooks';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, StatusBadge } from '@/ui/Badge';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { Textarea } from '@/ui/Form';
import { RequireRole } from '@/auth/RequireRole';
import { ChevronRight } from 'lucide-react';

/** @param {{ label: string, value: React.ReactNode }} props */
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/5 py-3 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="min-w-0 text-right text-sm text-ink">{value ?? '—'}</span>
    </div>
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

export function DppDetail() {
  const { id } = useParams();
  const [showPublish, setShowPublish] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(/** @type {{kind:'error'|'success',text:string}|null} */ (null));
  const [co2Open, setCo2Open] = useState(false);
  const [recOpen, setRecOpen] = useState(false);

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

  const invalidate = [['DPPs', id], ['DPPs']];
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

  const s = dpp.status;
  const busy = act.isPending || update.isPending;

  // Consumer passport URL — opens the public consumer view (same page a QR scan
  // lands on), via the consumer.html?token= entry point. Relative path so it
  // resolves against the current origin in dev (Vite, :5173) and in production
  // (Approuter serves consumer.html).
  const consumerUrl = dpp.qr_token
    ? `/consumer.html?token=${encodeURIComponent(dpp.qr_token)}`
    : null;

  const product = dpp.product;
  const variant = variantQ.data;
  const batch = batchQ.data;
  const item = itemQ.data;
  const agg = aggQ.data;
  let missing = [];
  if (agg?.missing) {
    try { missing = JSON.parse(agg.missing); } catch { missing = []; }
  }
  let breakdown = null;
  if (agg?.breakdown) {
    try { breakdown = JSON.parse(agg.breakdown); } catch { breakdown = null; }
  }
  const recycledParts = (breakdown?.components ?? []).filter((c) => c.mass_kg != null && c.recycled_pct != null);

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
          <h1 className="text-2xl font-semibold text-ink">{dpp.product?.name ?? 'Digital product passport'}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge status={s} />
            <StatusBadge status={dpp.visibility} />
            <Badge tone="gray">{dpp.dpp_type}</Badge>
            <span className="text-sm text-ink-muted">v{dpp.current_version ?? 1}</span>
          </div>
        </div>

        <RequireRole role="company_advanced">
          <div className="flex flex-wrap justify-end gap-2">
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
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => run('archiveDPP', undefined, 'Passport archived.')}
              >
                Archive
              </Button>
            )}
          </div>
        </RequireRole>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {(s === 'draft' || s === 'in_review' || s === 'approved') && (
        <Banner kind="info">Review all data assigned to this passport below before publishing.</Banner>
      )}

      {showPublish && (
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

      {/* ── Aggregated footprint (live preview of what the public will see) ── */}
      <Card>
        <CardTitle>Aggregated footprint (live preview)</CardTitle>
        {aggQ.isLoading ? (
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
              <Row label="Name" value={product?.name} />
              <Row label="Brand" value={product?.brand} />
              <Row label="Category" value={product?.category} />
              <Row label="Model" value={product?.model} />
              <Row label="GTIN" value={product?.gtin} />
              <Row label="Fibre composition" value={product?.fibre_composition} />
              <Row label="Country of origin" value={product?.country_of_origin} />
              <Row label="Substances of concern" value={product?.substances_of_concern} />
              <Row label="Care" value={product?.care_instructions} />
              <Row label="Repair" value={product?.repair_instructions} />
              <Row label="Disposal" value={product?.disposal_instructions} />
              <Row label="ESPR compliance" value={product?.espr_compliance} />
            </div>
          </Card>

          {/* ── Variant ── */}
          {variant && (
            <Card>
              <CardTitle>Variant</CardTitle>
              <div className="mt-2">
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
                <Row label="Serial number" value={<span className="font-mono text-xs">{item.serial_number}</span>} />
                <Row label="UPI" value={<span className="font-mono text-xs">{item.upi}</span>} />
                <Row label="Manufacturing date" value={fmtDate(item.manufacturing_date)} />
                <Row label="Status" value={<StatusBadge status={item.status} />} />
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardTitle>Passport details</CardTitle>
            <div className="mt-2">
              <Row label="Passport ID" value={<span className="font-mono text-xs">{dpp.ID}</span>} />
              <Row label="Type" value={dpp.dpp_type} />
              <Row label="Status" value={<StatusBadge status={s} />} />
              <Row label="Visibility" value={<StatusBadge status={dpp.visibility} />} />
              <Row label="Version" value={dpp.current_version} />
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
            </div>
          </Card>

          <Card>
            <CardTitle>QR code</CardTitle>
            {qrQ.data?.png ? (
              <div className="mt-3 flex flex-col items-center gap-2">
                <img
                  src={`data:image/png;base64,${qrQ.data.png}`}
                  alt="DPP QR code"
                  className="h-44 w-44 rounded-lg border border-black/5"
                />
                <span className="text-xs text-ink-muted">Printable label QR</span>
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                {dpp.qr_token ? 'Loading QR…' : 'No QR yet — publish the passport to generate one.'}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
