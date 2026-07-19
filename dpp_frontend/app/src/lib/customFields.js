/**
 * User-defined additional fields on Products / ProductVariants / Batches.
 *
 * Stored per entity as a JSON array in the `custom_fields` column:
 *   [{ label, value, visibility: 'internal' | 'public' }]
 * Each entry carries its OWN visibility flag — deliberately NOT part of the static
 * field catalogue (fieldCatalogue.js), whose mergeVisibility drops unknown keys.
 * Only 'public' entries appear on the consumer passport (filtered server-side).
 *
 * KEEP LIMITS/RESERVED NAMES IN SYNC with the backend:
 * dpp_capgemini/srv/lib/custom-fields.js (authoritative validation).
 */

export const MAX_CUSTOM_FIELDS = 50;
export const CUSTOM_FIELD_LIMITS = { label: 60, value: 500 };

// Names the backend rejects because the drift-hash normalization would silently drop
// them (see dpp_capgemini/srv/lib/custom-fields.js). Exact, case-sensitive matches.
const RESERVED_LABELS = new Set([
  'ID', 'id', 'status', 'captured_at', 'createdAt', 'createdBy', 'lastChange',
  'changedBy', 'modifiedAt', 'last_updated', 'updatedAt'
]);

export function isReservedLabel(label) {
  return RESERVED_LABELS.has(label) || label.endsWith('_ID');
}

/** Parse a stored custom_fields value into editor rows; never throws. */
export function parseCustomFields(json) {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter((e) => e && typeof e === 'object')
      .map((e) => ({
        label: typeof e.label === 'string' ? e.label : '',
        value: e.value == null ? '' : String(e.value),
        visibility: e.visibility === 'public' ? 'public' : 'internal'
      }));
  } catch {
    return [];
  }
}

/**
 * Validate editor rows before save. Returns the first user-facing error message, or
 * null when valid. Fully empty rows are ignored (serializeCustomFields drops them).
 * Mirrors the backend messages in dpp_capgemini/srv/lib/custom-fields.js.
 */
export function validateCustomFields(rows) {
  const seen = new Set();
  let count = 0;
  for (const r of rows ?? []) {
    const label = (r.label ?? '').trim();
    const value = (r.value ?? '').trim();
    if (!label && !value) continue;
    count += 1;
    if (!label) return 'Each additional field needs a name.';
    if (label.length > CUSTOM_FIELD_LIMITS.label) {
      return `Additional field names must be at most ${CUSTOM_FIELD_LIMITS.label} characters.`;
    }
    if (value.length > CUSTOM_FIELD_LIMITS.value) {
      return `Additional field values must be at most ${CUSTOM_FIELD_LIMITS.value} characters.`;
    }
    if (isReservedLabel(label)) {
      return `"${label}" cannot be used as a field name. Please choose a different name.`;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) return 'Two additional fields cannot have the same name.';
    seen.add(key);
  }
  if (count > MAX_CUSTOM_FIELDS) {
    return `A maximum of ${MAX_CUSTOM_FIELDS} additional fields is supported.`;
  }
  return null;
}

/** Canonical JSON for the PATCH payload: trimmed entries, empty rows dropped, null when none. */
export function serializeCustomFields(rows) {
  const out = (rows ?? [])
    .map((r) => ({
      label: (r.label ?? '').trim(),
      value: (r.value ?? '').trim(),
      visibility: r.visibility === 'public' ? 'public' : 'internal'
    }))
    .filter((r) => r.label || r.value);
  return out.length ? JSON.stringify(out) : null;
}
