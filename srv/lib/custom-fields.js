'use strict';

/**
 * User-defined additional fields on Products / ProductVariants / Batches.
 *
 * Stored per entity as a JSON array in the `custom_fields` column:
 *   [{ label: String, value: String, visibility: 'internal' | 'public' }]
 * Array order is the user's display order. Each entry carries its OWN visibility flag
 * (like Documents.visibility / ProductBOMs.visibility) — deliberately NOT part of the
 * static field catalogue (srv/lib/field-visibility.js), whose resolve() treats unknown
 * keys as always-public and whose FE mirror drops unknown keys on save.
 *
 * Consumers see only 'public' entries (filtered in public-handler.js#toConsumerDTO);
 * because buildSnapshot selects full rows, the column flows into the drift hash and
 * version snapshots automatically (normalized in srv/lib/snapshot-hash.js).
 *
 * Leaf module — imports nothing (safe for both srv/lib and handler layers).
 * KEEP LIMITS/RESERVED NAMES IN SYNC with dpp_frontend/app/src/lib/customFields.js.
 */

const MAX_FIELDS = 50;
const MAX_LABEL = 60;
const MAX_VALUE = 500;

// Labels the drift-hash normalization (snapshot-hash.js stripDeep) removes as object
// keys at every depth. A field stored under one of these names would silently drop out
// of the content hash — edits to it would never drift-revert a published DPP — so they
// are rejected up front. Matching is exact (stripDeep compares case-sensitively).
const RESERVED_LABELS = new Set([
  'ID', 'id', 'status', 'captured_at', 'createdAt', 'createdBy', 'lastChange',
  'changedBy', 'modifiedAt', 'last_updated', 'updatedAt'
]);

function isReservedLabel(label) {
  return RESERVED_LABELS.has(label) || label.endsWith('_ID');
}

/** Parse a stored custom_fields value (JSON string / array / null) to an array; never throws. */
function parseCustomFields(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Validate + canonicalize a client-supplied custom_fields payload value.
 * Returns { ok: true, json } with the canonical JSON string (null when there are no
 * entries), or { ok: false, message } with a clean user-facing message.
 */
function normalizeCustomFields(raw) {
  if (raw == null || raw === '') return { ok: true, json: null };

  let entries;
  if (Array.isArray(raw)) {
    entries = raw;
  } else if (typeof raw === 'string') {
    try {
      entries = JSON.parse(raw);
    } catch {
      return { ok: false, message: 'Additional fields must be a list of name/value entries.' };
    }
  } else {
    return { ok: false, message: 'Additional fields must be a list of name/value entries.' };
  }
  if (!Array.isArray(entries)) {
    return { ok: false, message: 'Additional fields must be a list of name/value entries.' };
  }

  const out = [];
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, message: 'Additional fields must be a list of name/value entries.' };
    }
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    const value = typeof entry.value === 'string' ? entry.value.trim() : (entry.value == null ? '' : String(entry.value).trim());
    // Tolerate rows the user added but left completely empty.
    if (label === '' && value === '') continue;
    if (label === '') {
      return { ok: false, message: 'Each additional field needs a name.' };
    }
    if (label.length > MAX_LABEL) {
      return { ok: false, message: `Additional field names must be at most ${MAX_LABEL} characters.` };
    }
    if (value.length > MAX_VALUE) {
      return { ok: false, message: `Additional field values must be at most ${MAX_VALUE} characters.` };
    }
    if (isReservedLabel(label)) {
      return { ok: false, message: `"${label}" cannot be used as a field name. Please choose a different name.` };
    }
    const dedupeKey = label.toLowerCase();
    if (seen.has(dedupeKey)) {
      // Wording avoids "unique"/"duplicate" — the central error net (dpp-service.js)
      // rewrites such messages into a generic 409 for raw DB constraint violations.
      return { ok: false, message: 'Two additional fields cannot have the same name.' };
    }
    seen.add(dedupeKey);
    const visibility = entry.visibility === 'public' ? 'public' : entry.visibility === 'internal' || entry.visibility == null ? 'internal' : null;
    if (visibility === null) {
      return { ok: false, message: 'Additional field visibility must be either "public" or "internal".' };
    }
    out.push({ label, value, visibility });
  }
  if (out.length > MAX_FIELDS) {
    return { ok: false, message: `A maximum of ${MAX_FIELDS} additional fields is supported.` };
  }
  return { ok: true, json: out.length ? JSON.stringify(out) : null };
}

/** Consumer-visible entries only, as [{label, value}] — for the public DTO. */
function publicCustomFields(raw) {
  return parseCustomFields(raw)
    .filter((e) => e && e.visibility === 'public'
      && typeof e.label === 'string' && e.label.trim() !== ''
      && e.value != null && String(e.value).trim() !== '')
    .map((e) => ({ label: e.label, value: e.value }));
}

/**
 * Hash/diff normalization: entries as an object keyed by label ("value · visibility").
 * Object form (not array) so the drift diff yields ONE path per field
 * (e.g. product.custom_fields.<label>) instead of an opaque "N entries" change, and so
 * stableStringify's key sorting makes row order irrelevant to the hash. Returns null
 * when there are no entries — the caller must then DROP the key entirely, keeping
 * hashes of snapshots taken before this feature existed stable.
 */
function customFieldsHashMap(raw) {
  const entries = parseCustomFields(raw);
  const out = {};
  let any = false;
  for (const e of entries) {
    if (!e || typeof e.label !== 'string' || e.label.trim() === '') continue;
    const vis = e.visibility === 'public' ? 'public' : 'internal';
    out[e.label.trim()] = `${e.value == null ? '' : e.value} · ${vis}`;
    any = true;
  }
  return any ? out : null;
}

module.exports = {
  MAX_FIELDS, MAX_LABEL, MAX_VALUE,
  isReservedLabel, parseCustomFields, normalizeCustomFields,
  publicCustomFields, customFieldsHashMap
};
