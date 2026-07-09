import { useRef, useState } from 'react';
import { Sparkles, Upload, FileText } from 'lucide-react';
import { Breadcrumb, Banner } from '@/ui/Breadcrumb';
import { Button } from '@/ui/Button';
import { Select } from '@/ui/Form';
import { AssistantConversation } from '@/ui/AssistantConversation';
import { useAssistant } from '@/app/hooks/useAssistant';
import { useMe } from '@/auth/useMe';
import { extractDocument, validateProposal } from '@/api/assistant';

const ENTITY_OPTIONS = [
  { value: 'product', label: 'Product' },
  { value: 'variant', label: 'Variant' },
  { value: 'batch', label: 'Batch' },
];

/**
 * Full "DPP Assistant" page: a chat with the tool-calling agent plus a document
 * upload that extracts draft fields into an editable proposal card. Available to
 * every company user; creating/approving is gated to company_advanced (the cards
 * and lifecycle buttons hide their write actions for read-only accounts).
 */
export function Assistant() {
  const { data: me } = useMe();
  const canWrite = me?.role === 'company_advanced';
  const assistant = useAssistant();

  const [entity, setEntity] = useState('product');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const { entity: ent, fields } = await extractDocument({ file, entity });
      let validation = { valid: false, errors: [] };
      try {
        validation = await validateProposal({ entity: ent, fields });
      } catch {
        /* validation is best-effort here */
      }
      assistant.addProposalMessage(
        { entity: ent, draft: fields, validation },
        `I read "${file.name}" and prepared a ${ent} draft. Please review and adjust the fields, then create it. Tell me anything that's still missing.`
      );
    } catch (err) {
      setError(err?.message || 'The document could not be analysed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-5">
      <div>
        <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'DPP Assistant' }]} />
        <h1 className="mt-2 flex items-center gap-2 text-xl font-semibold text-ink">
          <Sparkles className="h-5 w-5 text-brand-600" /> DPP Assistant
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Create products, variants, BOMs and batches by chat, extract data from a document, and get guided through
          approval and publishing.
        </p>
      </div>

      {/* Document upload → extraction */}
      <div className="rounded-xl border border-black/5 bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink" htmlFor="extract-entity">Extract as</label>
            <Select id="extract-entity" value={entity} options={ENTITY_OPTIONS} onChange={(e) => setEntity(e.target.value)} className="w-40" />
          </div>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4" />
            {busy ? 'Analysing…' : 'Upload document'}
          </Button>
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <FileText className="h-3.5 w-3.5" /> PDF, PNG or JPEG · max 20 MB
          </span>
          <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={onFile} />
        </div>
        {error && <div className="mt-3"><Banner kind="error">{error}</Banner></div>}
      </div>

      {/* Chat */}
      <div className="min-h-[420px] flex-1 rounded-xl border border-black/5 bg-card p-4">
        <AssistantConversation assistant={assistant} canWrite={canWrite} />
      </div>
    </div>
  );
}
