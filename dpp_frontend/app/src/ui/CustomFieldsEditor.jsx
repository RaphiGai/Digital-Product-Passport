import { Input } from '@/ui/Form';
import { Button } from '@/ui/Button';
import { EditableVisibilityBadge } from '@/ui/Badge';
import { MAX_CUSTOM_FIELDS, CUSTOM_FIELD_LIMITS } from '@/lib/customFields';

/**
 * Row editor for user-defined additional fields ({label, value, visibility}) on
 * Products / Variants / Batches. Controlled: `rows` live in the parent form state and
 * are serialized into the entity's `custom_fields` column on save (see lib/customFields).
 * Per-row Public/Internal toggle — independent of the static field catalogue.
 */
export function CustomFieldsEditor({ rows, onChange, canEditVisibility }) {
  const setRow = (i, key) => (e) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: e.target.value } : r)));
  const setVisibility = (i) => (v) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, visibility: v } : r)));
  const addRow = () => onChange([...rows, { label: '', value: '', visibility: 'internal' }]);
  const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3 md:col-span-2">
      {rows.length === 0 && (
        <p className="text-sm text-ink-muted">
          No additional fields yet. Add one to capture information the standard fields don’t cover.
        </p>
      )}
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg border border-black/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <EditableVisibilityBadge
              value={r.visibility}
              onChange={setVisibility(i)}
              locked={false}
              canEdit={canEditVisibility}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="text-xs text-ink-muted hover:text-red-600"
            >
              Remove
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              value={r.label}
              onChange={setRow(i, 'label')}
              placeholder="Field name (e.g. Water consumption)"
              maxLength={CUSTOM_FIELD_LIMITS.label}
              aria-label="Additional field name"
            />
            <Input
              value={r.value}
              onChange={setRow(i, 'value')}
              placeholder="Value (e.g. 2,700 l per kg)"
              maxLength={CUSTOM_FIELD_LIMITS.value}
              aria-label="Additional field value"
            />
          </div>
        </div>
      ))}
      {rows.length < MAX_CUSTOM_FIELDS && (
        <Button type="button" variant="outline" onClick={addRow}>
          + Add field
        </Button>
      )}
    </div>
  );
}
