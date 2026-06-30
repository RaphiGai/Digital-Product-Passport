import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { odataList, odataCreate, odataUpdate, odataDelete, newId, ApiError } from '@/api/client';
import { MARKETING_LINK_TYPES, MARKETING_LINK_LABEL, MARKETING_MEDIA_TYPES } from '@/lib/fieldCatalogue';
import { useHasRole } from '@/auth/useMe';
import { Card, CardTitle } from './Card';
import { Button } from './Button';
import { Banner } from './Breadcrumb';
import { FieldRow, Input, Select, RadioCards } from './Form';
import { Badge } from './Badge';
import { ImageUpload } from './ImageUpload';

const EMPTY_FORM = {
  link_type: 'advertisement',
  title: '',
  subtitle: '',
  url: '',
  media_type: 'image',
  image_url: '',
  image_data: '',
  is_active: true,
  display_order: '',
  valid_from: '',
  valid_to: '',
  dpp_ID: ''
};

/** ISO date → DD.MM.YYYY (German standard, per org formatting rules). */
const fmtDate = (v) => {
  if (!v) return null;
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(v).slice(0, 10);
};

/**
 * Manage marketing / advertising links (US5.8). Self-contained like BomEditor /
 * DocumentManager: owns its query + mutations and persists directly against OData.
 *
 * - Without `dppId`: org-wide overview (the Marketing page) — every link, with a
 *   selector to attach a link to a specific DPP (or leave it org-wide).
 * - With `dppId`: scoped to one passport (embedded on the DPP detail page) — the DPP
 *   selector is hidden and new links are attached to that DPP.
 *
 * Edit controls are shown only to company_advanced; everyone else sees a read-only list.
 *
 * @param {{ dppId?: string }} props
 */
export function MarketingLinksManager({ dppId }) {
  const qc = useQueryClient();
  const canEdit = useHasRole('company_advanced');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [msg, setMsg] = useState(null);

  const queryKey = ['DPPMarketingLinks', dppId || 'all'];
  const linksQ = useQuery({
    queryKey,
    queryFn: () =>
      odataList('DPPMarketingLinks', {
        ...(dppId
          ? { filter: `dpp_ID eq '${dppId}'` }
          : { expand: ['dpp($expand=product($select=ID,name))'] }),
        orderby: 'display_order',
        top: 200
      })
  });
  const rows = linksQ.data ?? [];

  // DPP picker options (org-wide mode only).
  const dppsQ = useQuery({
    queryKey: ['DPPs', 'marketing-picker'],
    queryFn: () =>
      odataList('DPPs', { expand: ['product($select=ID,name)'], orderby: 'createdAt desc', top: 500 }),
    enabled: !dppId && canEdit
  });
  const dppOptions = [
    { value: '', label: 'Org-wide (all passports)' },
    ...(dppsQ.data ?? []).map((d) => ({
      value: d.ID,
      label: `${d.product?.name ?? d.ID} · ${d.dpp_type} · v${d.current_version ?? 1}`
    }))
  ];

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setMsg(null);
  };
  const invalidate = () => qc.invalidateQueries({ queryKey });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        link_type: form.link_type,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        url: form.url.trim() || null,
        media_type: form.media_type || 'image',
        image_url: form.image_url.trim() || null,
        image_data: form.image_data || null,
        is_active: !!form.is_active,
        display_order: form.display_order === '' ? 0 : Number(form.display_order),
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        dpp_ID: dppId ?? (form.dpp_ID || null)
      };
      if (editingId) return odataUpdate('DPPMarketingLinks', editingId, payload);
      return odataCreate('DPPMarketingLinks', { ID: newId(), ...payload });
    },
    onSuccess: () => {
      resetForm();
      invalidate();
    },
    onError: (err) => setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save the link.' })
  });

  const delMut = useMutation({
    mutationFn: (id) => odataDelete('DPPMarketingLinks', id),
    onSuccess: (_data, id) => {
      if (id === editingId) resetForm();
      setConfirmId(null);
      invalidate();
    },
    onError: (err) => setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not delete the link.' })
  });

  const startEdit = (l) => {
    setEditingId(l.ID);
    setConfirmId(null);
    setMsg(null);
    setForm({
      link_type: l.link_type ?? 'advertisement',
      title: l.title ?? '',
      subtitle: l.subtitle ?? '',
      url: l.url ?? '',
      media_type: l.media_type ?? 'image',
      image_url: l.image_url ?? '',
      image_data: l.image_data ?? '',
      is_active: l.is_active !== false,
      display_order: l.display_order ?? '',
      valid_from: l.valid_from ?? '',
      valid_to: l.valid_to ?? '',
      dpp_ID: l.dpp_ID ?? ''
    });
  };

  const submit = () => {
    setMsg(null);
    if (!form.title.trim()) {
      setMsg({ kind: 'error', text: 'Title is required.' });
      return;
    }
    if (form.url.trim() && !/^https?:\/\//i.test(form.url.trim())) {
      setMsg({ kind: 'error', text: 'URL must start with https:// (or http://).' });
      return;
    }
    if (form.image_url.trim() && !/^https?:\/\//i.test(form.image_url.trim())) {
      setMsg({ kind: 'error', text: 'Image URL must start with https:// (or http://).' });
      return;
    }
    if (form.valid_from && form.valid_to && form.valid_to < form.valid_from) {
      setMsg({ kind: 'error', text: 'The "valid to" date must not be before the "valid from" date.' });
      return;
    }
    saveMut.mutate();
  };

  return (
    <Card>
      <CardTitle>Marketing links</CardTitle>
      <p className="mt-1 text-xs text-ink-muted">
        Promotional links shown on the consumer passport
        {dppId ? ' for this DPP (plus org-wide links).' : '. Leave a link org-wide or attach it to a specific DPP.'}
      </p>

      {msg && (
        <div className="mt-3">
          <Banner kind={msg.kind}>{msg.text}</Banner>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="mt-3 divide-y divide-black/5">
          {rows.map((l) => (
            <div key={l.ID} className="flex items-center gap-3 py-3">
              {(l.image_data || l.image_url) && (
                <img
                  src={l.image_data || l.image_url}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-md border border-black/5 object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{l.title}</span>
                  <Badge tone="gray" className="font-normal">{MARKETING_LINK_LABEL[l.link_type] ?? l.link_type}</Badge>
                  {l.is_active === false && <Badge tone="amber" className="font-normal">Inactive</Badge>}
                </div>
                <div className="truncate text-xs text-ink-muted">
                  {[
                    !dppId && (l.dpp?.product?.name ? `→ ${l.dpp.product.name}` : 'Org-wide'),
                    l.url,
                    l.valid_from || l.valid_to
                      ? `valid ${fmtDate(l.valid_from) ?? '…'} – ${fmtDate(l.valid_to) ?? '…'}`
                      : null
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>

              {l.url && (
                <a href={l.url} target="_blank" rel="noreferrer" title="Open link" className="text-ink-muted hover:text-brand-700">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}

              {canEdit &&
                (confirmId === l.ID ? (
                  <span className="flex shrink-0 items-center gap-2 text-xs">
                    <button type="button" onClick={() => delMut.mutate(l.ID)} disabled={delMut.isPending} className="font-medium text-red-600 hover:underline">
                      Delete?
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)} className="text-ink-muted hover:text-ink">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <>
                    <button type="button" onClick={() => startEdit(l)} title="Edit" className="text-ink-muted hover:text-brand-700">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setConfirmId(l.ID)} title="Delete" className="text-ink-muted hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 py-3 text-sm text-ink-muted">No marketing links yet.</p>
      )}

      {/* Add / edit form — company_advanced only */}
      {canEdit && (
        <div className="mt-4 border-t border-black/5 pt-4">
          <div className="mb-3 text-sm font-medium text-ink">{editingId ? 'Edit link' : 'Add link'}</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow label="Title" htmlFor="ml-title">
              <Input id="ml-title" value={form.title} onChange={set('title')} maxLength={200} placeholder="e.g. Summer sale 2026" />
            </FieldRow>
            <FieldRow label="Type" htmlFor="ml-type">
              <Select id="ml-type" value={form.link_type} onChange={set('link_type')} options={MARKETING_LINK_TYPES} />
            </FieldRow>

            <FieldRow label="URL" htmlFor="ml-url" className="md:col-span-2">
              <Input id="ml-url" value={form.url} onChange={set('url')} maxLength={500} placeholder="https://…" />
            </FieldRow>

            <FieldRow
              label="Subtitle"
              htmlFor="ml-subtitle"
              className="md:col-span-2"
              hint="Optional call-to-action shown under the title on the consumer view."
            >
              <Input id="ml-subtitle" value={form.subtitle} onChange={set('subtitle')} maxLength={300} placeholder="e.g. Shop the matching care kit" />
            </FieldRow>

            <FieldRow label="Media type" htmlFor="ml-media-type" hint="“Video” adds a play overlay on the thumbnail.">
              <Select id="ml-media-type" value={form.media_type} onChange={set('media_type')} options={MARKETING_MEDIA_TYPES} />
            </FieldRow>
            <span className="hidden md:block" />

            <FieldRow
              label="Image / thumbnail"
              htmlFor="ml-image-url"
              className="md:col-span-2"
              hint="Upload an image, or paste an external image URL. Shown as a clickable tile on the consumer passport."
            >
              <div className="space-y-2">
                <ImageUpload value={form.image_data || null} onChange={(v) => setForm((f) => ({ ...f, image_data: v || '' }))} />
                <Input id="ml-image-url" value={form.image_url} onChange={set('image_url')} maxLength={500} placeholder="https://… (used only if no image is uploaded)" />
              </div>
            </FieldRow>

            {!dppId && (
              <FieldRow label="Attach to DPP" htmlFor="ml-dpp" className="md:col-span-2" hint="Leave org-wide to show across all of your published passports.">
                <Select id="ml-dpp" value={form.dpp_ID} onChange={set('dpp_ID')} options={dppOptions} />
              </FieldRow>
            )}

            <FieldRow label="Visibility" htmlFor="ml-active" className="md:col-span-2">
              <RadioCards
                value={form.is_active}
                onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                options={[
                  { value: true, label: 'Active', hint: 'Shown on the consumer passport' },
                  { value: false, label: 'Inactive', hint: 'Hidden from the consumer passport' }
                ]}
              />
            </FieldRow>

            <FieldRow label="Display order" htmlFor="ml-order" hint="Lower numbers are shown first.">
              <Input id="ml-order" type="number" min="0" value={form.display_order} onChange={set('display_order')} placeholder="0" />
            </FieldRow>
            <span className="hidden md:block" />
            <FieldRow label="Valid from" htmlFor="ml-from">
              <Input id="ml-from" type="date" value={form.valid_from} onChange={set('valid_from')} />
            </FieldRow>
            <FieldRow label="Valid to" htmlFor="ml-to">
              <Input id="ml-to" type="date" value={form.valid_to} onChange={set('valid_to')} />
            </FieldRow>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            {editingId && (
              <Button type="button" variant="ghost" disabled={saveMut.isPending} onClick={resetForm}>
                Cancel
              </Button>
            )}
            <Button type="button" variant="outline" disabled={saveMut.isPending} onClick={submit}>
              {saveMut.isPending ? 'Saving…' : editingId ? 'Save changes' : '+ Add link'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
