import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, FileImage, File as FileIcon, Upload, Download, Pencil, Trash2, X } from 'lucide-react';
import { odataList, odataCreate, odataUpdate, odataDelete, odataUploadMedia, newId, ApiError } from '@/api/client';
import { DOCUMENT_TYPES, DOC_TYPE_LABEL } from '@/lib/fieldCatalogue';
import { Card, CardTitle } from './Card';
import { Button } from './Button';
import { Banner } from './Breadcrumb';
import { FieldRow, Input, Select, RadioCards } from './Form';
import { FieldVisibilityBadge } from './Badge';

// Fixed per the approved plan — kept in sync with srv/handlers/document-handlers.js.
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];
const ACCEPT = 'application/pdf,image/png,image/jpeg';
const MAX_BYTES = 20 * 1024 * 1024;

const EMPTY_FORM = { doc_type: 'certificate', title: '', visibility: 'internal', issuer: '', issue_date: '', valid_until: '' };

const fmtSize = (b) =>
  b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;

/** ISO date → DD.MM.YYYY (German standard, per org formatting rules). */
const fmtDate = (v) => {
  if (!v) return null;
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(v).slice(0, 10);
};

function FileTypeIcon({ mime, className }) {
  if (mime === 'application/pdf') return <FileText className={className} />;
  if (mime && mime.startsWith('image/')) return <FileImage className={className} />;
  return <FileIcon className={className} />;
}

/**
 * Certificates & proofs for a product or batch.
 * Self-contained like BomEditor: owns its own query + mutations and persists directly
 * against OData — the parent page does not save it. Files are stored as native CAP
 * media streams (NOT base64): create the metadata row, then PUT the raw bytes.
 *
 * @param {{ scope: 'product' | 'batch', ownerId: string, readOnly?: boolean, title?: string }} props
 */
export function DocumentManager({ scope, ownerId, readOnly = false, title = 'Documents & certificates' }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [msg, setMsg] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const filter = scope === 'product' ? `product_ID eq '${ownerId}'` : `batch_ID eq '${ownerId}'`;

  const docsQ = useQuery({
    queryKey: ['Documents', scope, ownerId],
    queryFn: () => odataList('Documents', { filter, orderby: 'issue_date desc', top: 200 }),
    enabled: !!ownerId
  });
  const rows = docsQ.data ?? [];

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setEditingId(null);
    setMsg(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['Documents', scope, ownerId] });

  const handlePick = (file) => {
    setMsg(null);
    if (!file) return;
    if (!ALLOWED_MIME.includes((file.type || '').toLowerCase())) {
      setMsg({ kind: 'error', text: 'Unsupported file type. Allowed: PDF, PNG, JPEG.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMsg({ kind: 'error', text: 'File is too large (max 20 MB).' });
      return;
    }
    setSelectedFile(file);
    // Pre-fill the title from the file name when empty.
    setForm((f) => (f.title.trim() ? f : { ...f, title: file.name.replace(/\.[^.]+$/, '') }));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const meta = {
        doc_type: form.doc_type,
        title: form.title.trim(),
        visibility: form.visibility,
        issuer: form.issuer.trim() || null,
        issue_date: form.issue_date || null,
        valid_until: form.valid_until || null
      };
      const fileMeta = selectedFile
        ? { file_name: selectedFile.name, mime_type: selectedFile.type || 'application/octet-stream', file_size: selectedFile.size }
        : {};

      if (editingId) {
        await odataUpdate('Documents', editingId, { ...meta, ...fileMeta });
        if (selectedFile) await odataUploadMedia('Documents', editingId, 'content', selectedFile);
        return editingId;
      }

      const id = newId();
      const fk = scope === 'product' ? { product_ID: ownerId } : { batch_ID: ownerId };
      await odataCreate('Documents', { ID: id, ...fk, ...meta, ...fileMeta });
      try {
        await odataUploadMedia('Documents', id, 'content', selectedFile);
      } catch (e) {
        // Roll back the metadata row so a failed upload leaves no empty record.
        await odataDelete('Documents', id).catch(() => {});
        throw e;
      }
      return id;
    },
    onSuccess: () => {
      resetForm();
      invalidate();
    },
    onError: (err) => setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Upload failed.' })
  });

  const delMut = useMutation({
    mutationFn: (id) => odataDelete('Documents', id),
    onSuccess: (_data, id) => {
      if (id === editingId) resetForm();
      setConfirmId(null);
      invalidate();
    },
    onError: (err) => setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not delete.' })
  });

  const startEdit = (d) => {
    setEditingId(d.ID);
    setSelectedFile(null);
    setConfirmId(null);
    setMsg(null);
    setForm({
      doc_type: d.doc_type ?? 'certificate',
      title: d.title ?? '',
      visibility: d.visibility ?? 'internal',
      issuer: d.issuer ?? '',
      issue_date: d.issue_date ?? '',
      valid_until: d.valid_until ?? ''
    });
  };

  const submit = () => {
    setMsg(null);
    if (!form.title.trim()) {
      setMsg({ kind: 'error', text: 'Title is required.' });
      return;
    }
    if (!editingId && !selectedFile) {
      setMsg({ kind: 'error', text: 'Please choose a file.' });
      return;
    }
    if (form.issue_date && form.valid_until && form.valid_until < form.issue_date) {
      setMsg({ kind: 'error', text: 'Valid-until cannot be before the issue date.' });
      return;
    }
    saveMut.mutate();
  };

  return (
    <Card>
      <CardTitle>{title}</CardTitle>

      {msg && (
        <div className="mt-3">
          <Banner kind={msg.kind}>{msg.text}</Banner>
        </div>
      )}

      {rows.length > 0 ? (
        <div className="mt-3 divide-y divide-black/5">
          {rows.map((d) => (
            <div key={d.ID} className="flex items-center gap-3 py-3">
              <FileTypeIcon mime={d.mime_type} className="h-5 w-5 shrink-0 text-ink-muted" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{d.title || d.file_name}</span>
                  <FieldVisibilityBadge visibility={d.visibility === 'public' ? 'public' : 'internal'} />
                </div>
                <div className="truncate text-xs text-ink-muted">
                  {[DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type, d.issuer, fmtSize(d.file_size)].filter(Boolean).join(' · ')}
                  {d.valid_until ? ` · valid until ${fmtDate(d.valid_until)}` : ''}
                </div>
              </div>

              {d.file_name && (
                <a
                  href={`/odata/v4/dpp/Documents('${d.ID}')/content`}
                  target="_blank"
                  rel="noreferrer"
                  title="Open"
                  className="text-ink-muted hover:text-brand-700"
                >
                  <Download className="h-4 w-4" />
                </a>
              )}

              {!readOnly &&
                (confirmId === d.ID ? (
                  <span className="flex shrink-0 items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => delMut.mutate(d.ID)}
                      disabled={delMut.isPending}
                      className="font-medium text-red-600 hover:underline"
                    >
                      Delete?
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)} className="text-ink-muted hover:text-ink">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(d)}
                      title="Edit"
                      className="text-ink-muted hover:text-brand-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(d.ID)}
                      title="Delete"
                      className="text-ink-muted hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 py-3 text-sm text-ink-muted">No documents yet.</p>
      )}

      {/* Add / edit form — hidden in read-only mode */}
      {!readOnly && (
        <div className="mt-4 border-t border-black/5 pt-4">
          <div className="mb-3 text-sm font-medium text-ink">
            {editingId ? 'Edit document' : 'Add document'}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow
              label="File"
              htmlFor="doc-file"
              className="md:col-span-2"
              hint={
                editingId
                  ? 'Choose a new file to replace the existing one (optional). PDF, PNG or JPEG, max 20 MB.'
                  : 'PDF, PNG or JPEG, max 20 MB. Uploaded as-is.'
              }
            >
              {selectedFile ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                    <FileTypeIcon mime={selectedFile.type} className="h-4 w-4 shrink-0 text-ink-muted" />
                    <span className="truncate">{selectedFile.name}</span>
                    <span className="shrink-0 text-xs text-ink-muted">{fmtSize(selectedFile.size)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                    className="text-ink-muted hover:text-red-600"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-6 text-sm font-medium text-ink hover:bg-gray-50"
                >
                  <Upload className="h-5 w-5 text-ink-muted" /> Choose file
                </button>
              )}
              <input
                ref={fileRef}
                id="doc-file"
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePick(f);
                  e.target.value = '';
                }}
              />
              {editingId && !selectedFile && (
                <p className="mt-1 text-xs text-ink-muted">Current file is kept.</p>
              )}
            </FieldRow>

            <FieldRow label="Type" htmlFor="doc-type">
              <Select id="doc-type" value={form.doc_type} onChange={set('doc_type')} options={DOCUMENT_TYPES} />
            </FieldRow>
            <FieldRow label="Title" htmlFor="doc-title">
              <Input id="doc-title" value={form.title} onChange={set('title')} maxLength={200} placeholder="e.g. OEKO-TEX certificate" />
            </FieldRow>

            <FieldRow
              label="Visibility"
              htmlFor="doc-vis"
              className="md:col-span-2"
              hint="Public documents appear, downloadable, on the consumer passport."
            >
              <RadioCards
                value={form.visibility}
                onChange={(v) => setForm((f) => ({ ...f, visibility: v }))}
                options={[
                  { value: 'internal', label: 'Internal', hint: 'Visible only in DPP Studio' },
                  { value: 'public', label: 'Public', hint: 'Downloadable on the consumer passport' }
                ]}
              />
            </FieldRow>

            <FieldRow label="Issuer" htmlFor="doc-issuer">
              <Input id="doc-issuer" value={form.issuer} onChange={set('issuer')} maxLength={200} placeholder="e.g. Test institute" />
            </FieldRow>
            <FieldRow label="Issue date" htmlFor="doc-issue">
              <Input id="doc-issue" type="date" max={today} value={form.issue_date} onChange={set('issue_date')} />
            </FieldRow>
            <FieldRow label="Valid until" htmlFor="doc-valid">
              <Input id="doc-valid" type="date" value={form.valid_until} onChange={set('valid_until')} />
            </FieldRow>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            {editingId && (
              <Button type="button" variant="ghost" disabled={saveMut.isPending} onClick={resetForm}>
                Cancel
              </Button>
            )}
            <Button type="button" variant="outline" disabled={saveMut.isPending} onClick={submit}>
              {saveMut.isPending ? 'Saving…' : editingId ? 'Save changes' : '+ Add document'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
