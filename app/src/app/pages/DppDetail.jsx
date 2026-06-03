import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { odataGet } from '@/api/client';
import { useAction, useUpdate } from '@/api/hooks';
import { Card, CardTitle } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge, StatusBadge } from '@/ui/Badge';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { Textarea } from '@/ui/Form';
import { RequireRole } from '@/auth/RequireRole';

/** @param {{ label: string, value: React.ReactNode }} props */
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-black/5 py-3 last:border-0">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm text-ink">{value ?? '—'}</span>
    </div>
  );
}

export function DppDetail() {
  const { id } = useParams();
  const [showPublish, setShowPublish] = useState(false);
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(/** @type {{kind:'error'|'success',text:string}|null} */ (null));

  const { data: dpp, isLoading } = useQuery({
    queryKey: ['DPPs', id],
    queryFn: () => odataGet('DPPs', id, { expand: ['product'] })
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

  // Publishing must also make the passport publicly visible — the consumer route
  // requires status='published' AND visibility='public'. publishDPP only sets the status,
  // so we set visibility='public' first, then publish.
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardTitle>Passport details</CardTitle>
          <div className="mt-2">
            <Row label="Passport ID" value={<span className="font-mono text-xs">{dpp.ID}</span>} />
            <Row label="Type" value={dpp.dpp_type} />
            <Row label="Status" value={<StatusBadge status={s} />} />
            <Row label="Visibility" value={<StatusBadge status={dpp.visibility} />} />
            <Row label="Version" value={dpp.current_version} />
            <Row label="QR token" value={dpp.qr_token ? <span className="font-mono text-xs">{dpp.qr_token}</span> : null} />
            <Row
              label="Public URL"
              value={
                dpp.public_url ? (
                  <a href={dpp.public_url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                    Open
                  </a>
                ) : null
              }
            />
          </div>
        </Card>

        <Card>
          <CardTitle>QR code</CardTitle>
          {dpp.qr_token ? (
            <div className="mt-3 flex flex-col items-center gap-2">
              <img
                src={`/public/dpp/${dpp.qr_token}/qr.png`}
                alt="DPP QR code"
                className="h-44 w-44 rounded-lg border border-black/5"
              />
              <span className="text-xs text-ink-muted">Printable label QR</span>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">
              No QR yet — publish the passport to generate one.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
