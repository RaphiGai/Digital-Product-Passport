import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, FileImage, File as FileIcon, Upload, Download, Pencil, X, AlertTriangle } from 'lucide-react';
import { callFunction, parseJsonFunctionResult, odataUpdate, odataUploadMedia, ApiError } from '@/api/client';
import { useMe } from '@/auth/useMe';
import { DOC_TYPE_LABEL } from '@/lib/fieldCatalogue';
import { formatDate } from '@/lib/formatters';
import { Card, CardTitle, CardDescription } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Banner } from '@/ui/Breadcrumb';
import { DataTable } from '@/ui/Table';
import { Badge } from '@/ui/Badge';
import { FieldRow, Input } from '@/ui/Form';
import { PageHeader } from './ComingSoon';

// Kept in sync with srv/handlers/document-handlers.js (same limits as DocumentManager).
const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'];
const ACCEPT = 'application/pdf,image/png,image/jpeg';
const MAX_BYTES = 20 * 1024 * 1024;

const DOCS_KEY = ['myAssignedDocuments'];
const EMPTY_FORM = { issuer: '', issue_date: '', valid_until: '' };

const fmtSize = (b) =>
  b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;

function FileTypeIcon({ mime, className }) {
  if (mime === 'application/pdf') return <FileText className={className} />;
  if (mime && mime.startsWith('image/')) return <FileImage className={className} />;
  return <FileIcon className={className} />;
}

/** One-line "where is this certificate used" context for a document row. */
function ProductContext({ doc }) {
  const p = doc.product;
  const b = doc.batch;
  const variantBits = b?.variant ? [b.variant.sku, b.variant.color, b.variant.size].filter(Boolean).join(' · ') : '';
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium text-ink">{p?.name ?? '—'}</div>
      <div className="truncate text-xs text-ink-muted">
        {[
          p?.brand,
          p?.model,
          b && `Batch ${b.batch_number ?? b.ID}`,
          variantBits
        ].filter(Boolean).join(' · ') || (doc.level === 'product' ? 'Product level' : 'Batch level')}
      </div>
      {p?.description && (
        <div className="mt-0.5 line-clamp-2 max-w-md text-xs text-ink-muted">{p.description}</div>
      )}
    </div>
  );
}

/**
 * Partner portal — the ONLY page a business_partner login works with. Lists the
 * documents assigned to the linked partner (via the myAssignedDocuments() feed,
 * which also delivers the product/batch context: partner accounts have no read
 * access to Products/Batches). The edit panel lets the partner upload/replace
 * the file and maintain issuer + validity dates; everything else is read-only
 * and server-enforced (see srv/handlers/document-handlers.js).
 */
export function PartnerDocuments() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const fileRef = useRef(null);

  const [editing, setEditing] = useState(/** @type {any | null} */ (null));
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState(null);
  const [msg, setMsg] = useState(null);

  const docsQ = useQuery({
    queryKey: DOCS_KEY,
    queryFn: async () => parseJsonFunctionResult(await callFunction('myAssignedDocuments()'))
  });
  const docs = docsQ.data?.documents ?? [];
  const expiredCount = docs.filter((d) => d.expired).length;
  const pendingCount = docs.filter((d) => !d.has_file).length;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const resetForm = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setMsg(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const startEdit = (d) => {
    setEditing(d);
    setSelectedFile(null);
    setMsg(null);
    setForm({ issuer: d.issuer ?? '', issue_date: d.issue_date ?? '', valid_until: d.valid_until ?? '' });
  };

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
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      // Only the fields the server allows for business_partner accounts
      // (document-handlers.js PARTNER_EDITABLE): file + issuer/validity.
      // Upload the binary FIRST, then patch metadata: if the (up to 20 MB) upload
      // fails, the row keeps its previous state instead of being left with a
      // file_name pointing at content that never arrived (which would flip has_file
      // to true, hide the "upload pending" state and leave a dead download link).
      if (selectedFile) await odataUploadMedia('Documents', editing.ID, 'content', selectedFile);
      const meta = {
        issuer: form.issuer.trim() || null,
        issue_date: form.issue_date || null,
        valid_until: form.valid_until || null,
        ...(selectedFile
          ? { file_name: selectedFile.name, mime_type: selectedFile.type || 'application/octet-stream', file_size: selectedFile.size }
          : {})
      };
      await odataUpdate('Documents', editing.ID, meta);
    },
    onSuccess: () => {
      resetForm();
      qc.invalidateQueries({ queryKey: DOCS_KEY });
    },
    onError: (err) => setMsg({ kind: 'error', text: err instanceof ApiError ? err.message : 'Upload failed.' })
  });

  const submit = () => {
    setMsg(null);
    // A placeholder row exists to receive its file — require the upload there.
    if (!editing.has_file && !selectedFile) {
      setMsg({ kind: 'error', text: 'Please choose the file to upload for this document.' });
      return;
    }
    if (form.issue_date && form.valid_until && form.valid_until <= form.issue_date) {
      setMsg({ kind: 'error', text: 'The issue date must be before the valid-until date.' });
      return;
    }
    saveMut.mutate();
  };

  const today = new Date().toISOString().slice(0, 10);

  const columns = [
    {
      header: 'Document',
      cell: (d) => (
        <div className="flex min-w-0 items-center gap-2">
          <FileTypeIcon mime={d.mime_type} className="h-4 w-4 shrink-0 text-ink-muted" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{d.title}</div>
            <div className="truncate text-xs text-ink-muted">
              {[DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type, d.issuer].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      )
    },
    { header: 'Used for', cell: (d) => <ProductContext doc={d} /> },
    {
      header: 'File',
      cell: (d) =>
        d.has_file ? (
          <a
            href={`/odata/v4/dpp/Documents('${d.ID}')/content`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
            title="Open"
          >
            <Download className="h-4 w-4" />
            <span className="max-w-[180px] truncate">{d.file_name}</span>
            <span className="text-xs text-ink-muted">{fmtSize(d.file_size)}</span>
          </a>
        ) : (
          <Badge tone="amber" className="gap-1 font-normal">
            <Upload className="h-3 w-3" />
            Upload requested
          </Badge>
        )
    },
    {
      header: 'Valid until',
      cell: (d) => (
        <div>
          <span className={d.expired ? 'font-medium text-red-600' : 'text-sm text-ink'}>
            {d.valid_until ? formatDate(d.valid_until) : '—'}
          </span>
          {d.expired && (
            <div className="mt-1 flex max-w-[220px] items-start gap-1 text-xs font-medium text-red-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>This document has expired. Please upload a renewed version.</span>
            </div>
          )}
        </div>
      )
    },
    {
      header: 'Actions',
      cell: (d) => (
        <Button variant="outline" size="sm" onClick={() => startEdit(d)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My documents"
        subtitle={
          me?.businessPartnerName
            ? `Documents assigned to ${me.businessPartnerName}. Upload new files or renew expired ones.`
            : 'Documents assigned to your company. Upload new files or renew expired ones.'
        }
      />

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      {docsQ.isError && (
        <Banner kind="error">
          Your documents could not be loaded. Please reload the page or try again later.
        </Banner>
      )}

      {expiredCount > 0 && (
        <Banner kind="warning">
          {expiredCount === 1
            ? '1 document has passed its valid-until date and needs to be renewed.'
            : `${expiredCount} documents have passed their valid-until date and need to be renewed.`}
        </Banner>
      )}
      {pendingCount > 0 && (
        <Banner kind="info">
          {pendingCount === 1
            ? '1 document is waiting for your upload.'
            : `${pendingCount} documents are waiting for your upload.`}
        </Banner>
      )}

      <DataTable
        columns={columns}
        rows={docs}
        loading={docsQ.isLoading}
        empty="No documents have been assigned to you yet."
      />

      {editing && (
        <Card>
          <CardTitle>Update “{editing.title}”</CardTitle>
          <CardDescription className="mt-1">
            {editing.product?.name
              ? `For ${editing.product.name}${editing.batch ? ` — batch ${editing.batch.batch_number ?? ''}` : ''}. `
              : ''}
            Upload the {editing.has_file ? 'renewed' : 'requested'} file and maintain its validity dates.
          </CardDescription>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <FieldRow
              label="File"
              htmlFor="pd-file"
              className="md:col-span-2"
              hint={
                editing.has_file
                  ? 'Choose a new file to replace the existing one (optional). PDF, PNG or JPEG, max 20 MB.'
                  : 'PDF, PNG or JPEG, max 20 MB.'
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
                id="pd-file"
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePick(f);
                  e.target.value = '';
                }}
              />
              {editing.has_file && !selectedFile && (
                <p className="mt-1 text-xs text-ink-muted">Current file is kept.</p>
              )}
            </FieldRow>

            <FieldRow label="Issuer" htmlFor="pd-issuer">
              <Input id="pd-issuer" value={form.issuer} onChange={set('issuer')} maxLength={200} placeholder="e.g. Test institute" />
            </FieldRow>
            <FieldRow label="Issue date" htmlFor="pd-issue">
              <Input id="pd-issue" type="date" max={today} value={form.issue_date} onChange={set('issue_date')} />
            </FieldRow>
            <FieldRow label="Valid until" htmlFor="pd-valid">
              <Input id="pd-valid" type="date" min={form.issue_date || undefined} value={form.valid_until} onChange={set('valid_until')} />
            </FieldRow>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-black/5 pt-4">
            <Button type="button" variant="ghost" disabled={saveMut.isPending} onClick={resetForm}>
              Cancel
            </Button>
            <Button type="button" disabled={saveMut.isPending} onClick={submit}>
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
