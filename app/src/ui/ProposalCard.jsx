import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { FieldRow, Input, Select, Textarea } from './Form';
import { validateProposal, commitProposal } from '@/api/assistant';

/**
 * Editable card for an AI-proposed record. The user reviews/adjusts the fields,
 * optionally re-validates, then creates it. Creation reuses the existing guarded
 * importXxx flow (dryRun:false) — the assistant never writes on its own.
 */

const TITLES = { product: 'New product', variant: 'New variant', batch: 'New batch', bom: 'New BOM components' };

const FIELDS = {
  product: [
    { key: 'name', label: 'Name' },
    { key: 'brand', label: 'Brand' },
    { key: 'category', label: 'Category' },
    { key: 'product_type', label: 'Product type', type: 'select', options: ['finished', 'material', 'component', 'packaging'] },
    { key: 'country_of_origin', label: 'Country of origin (ISO-2)' },
    { key: 'fibre_composition', label: 'Fibre composition' },
    { key: 'care_instructions', label: 'Care instructions', type: 'textarea' },
    { key: 'repair_instructions', label: 'Repair instructions', type: 'textarea' },
    { key: 'disposal_instructions', label: 'Disposal instructions', type: 'textarea' },
    { key: 'substances_of_concern', label: 'Substances of concern' },
    { key: 'espr_compliance', label: 'ESPR compliance', type: 'select', options: ['draft', 'in_review', 'compliant', 'non_compliant'] },
    { key: 'gtin', label: 'GTIN' },
  ],
  variant: [
    { key: 'product_name', label: 'Product name' },
    { key: 'sku', label: 'SKU' },
    { key: 'color', label: 'Colour' },
    { key: 'size', label: 'Size' },
    { key: 'gtin', label: 'GTIN' },
    { key: 'weight_g', label: 'Weight (g)', type: 'number' },
  ],
  batch: [
    { key: 'product_name', label: 'Product name' },
    { key: 'variant_sku', label: 'Variant SKU' },
    { key: 'batch_number', label: 'Batch number' },
    { key: 'production_date', label: 'Production date (YYYY-MM-DD)' },
    { key: 'country_of_origin', label: 'Country of origin (ISO-2)' },
    { key: 'co2_footprint_kg', label: 'CO₂ (kg)', type: 'number' },
    { key: 'recycled_content_pct', label: 'Recycled content (%)', type: 'number' },
    { key: 'factory_name', label: 'Factory (business partner)' },
    { key: 'supplier_name', label: 'Supplier (business partner)' },
  ],
};

const selectOpts = (values) => [{ value: '', label: '—' }, ...values.map((v) => ({ value: v, label: v }))];

export function ProposalCard({ proposal, canWrite, onCommitted }) {
  const { entity } = proposal;
  const isBom = entity === 'bom';
  const [fields, setFields] = useState(() => (isBom ? proposal.draft || [] : { ...(proposal.draft || {}) }));
  const [errors, setErrors] = useState(proposal.validation?.errors || []);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState('');

  const setField = (key, value) => setFields((f) => ({ ...f, [key]: value }));
  const setBomField = (i, key, value) =>
    setFields((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const errorFields = new Set(errors.map((e) => e.field));

  async function handleValidate() {
    setBusy(true);
    setNote('');
    try {
      const { valid, errors: errs } = await validateProposal({ entity, fields });
      setErrors(errs);
      setNote(valid ? 'Looks good — ready to create.' : '');
    } catch (e) {
      setNote(e?.message || 'Validation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    setBusy(true);
    setNote('');
    try {
      const { created, valid, errors: errs } = await commitProposal({ entity, fields });
      setErrors(errs);
      if (valid && created > 0) {
        setDone(true);
        onCommitted?.(entity);
      } else {
        setNote('Some fields still need attention before this can be created.');
      }
    } catch (e) {
      setNote(e?.message || 'Could not create the record.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-brand-800">
          <CheckCircle2 className="h-4 w-4" /> {TITLES[entity]} created.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-black/5 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-600" />
        <h3 className="text-sm font-semibold text-ink">{TITLES[entity] || 'Proposal'}</h3>
        <span className="ml-auto text-xs text-ink-muted">Review &amp; adjust before creating</span>
      </div>

      {isBom ? (
        <div className="space-y-3">
          {(fields || []).map((row, i) => (
            <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border border-black/5 p-3 md:grid-cols-3">
              <FieldRow label="Component" htmlFor={`c-${i}`}>
                <Input id={`c-${i}`} value={row.component_product_name || ''} onChange={(e) => setBomField(i, 'component_product_name', e.target.value)} />
              </FieldRow>
              <FieldRow label="Quantity" htmlFor={`q-${i}`}>
                <Input id={`q-${i}`} type="number" value={row.quantity ?? ''} onChange={(e) => setBomField(i, 'quantity', e.target.value)} />
              </FieldRow>
              <FieldRow label="Unit" htmlFor={`u-${i}`}>
                <Select id={`u-${i}`} value={row.unit || ''} options={selectOpts(['g', 'kg', 'pcs', '%'])} onChange={(e) => setBomField(i, 'unit', e.target.value)} />
              </FieldRow>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(FIELDS[entity] || []).map((f) => (
            <FieldRow key={f.key} label={f.label} htmlFor={`${entity}-${f.key}`}
              className={errorFields.has(f.key) ? 'rounded-md' : undefined}>
              {f.type === 'select' ? (
                <Select id={`${entity}-${f.key}`} value={fields[f.key] || ''} options={selectOpts(f.options)}
                  onChange={(e) => setField(f.key, e.target.value)} />
              ) : f.type === 'textarea' ? (
                <Textarea id={`${entity}-${f.key}`} rows={2} value={fields[f.key] || ''}
                  onChange={(e) => setField(f.key, e.target.value)} />
              ) : (
                <Input id={`${entity}-${f.key}`} type={f.type === 'number' ? 'number' : 'text'} value={fields[f.key] ?? ''}
                  className={cn(errorFields.has(f.key) && 'border-red-400')}
                  onChange={(e) => setField(f.key, e.target.value)} />
              )}
            </FieldRow>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Still to fix
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {errors.slice(0, 8).map((e, i) => (
              <li key={i}>{e.field ? `${e.field}: ` : ''}{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {note && <p className="mt-2 text-xs text-ink-muted">{note}</p>}

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleValidate} disabled={busy}>Validate</Button>
        {canWrite ? (
          <Button size="sm" onClick={handleCreate} disabled={busy}>
            {busy ? 'Working…' : 'Create'}
          </Button>
        ) : (
          <span className="text-xs text-ink-muted">Read-only account — ask a full editor to create this.</span>
        )}
      </div>
    </div>
  );
}
