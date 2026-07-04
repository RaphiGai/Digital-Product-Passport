'use strict';

const { parseBag, RESERVED_KEYS, KEY_PATTERN } = require('./catalogue');
const { isHttpUrl } = require('./url-validate');

/**
 * Write-side validation of the `attributes` JSON bag on Products / ProductVariants /
 * Batches against the category's attribute catalogue (Epic 12).
 *
 * Rules per definition (storage='json' rows of the entity's level):
 *  - unknown keys are rejected (an attribute must be defined for the category),
 *  - reserved keys are rejected (they would vanish from the drift hash — see
 *    catalogue.js#RESERVED_KEYS),
 *  - datatype: number/integer (locale-tolerant comma), date (YYYY-MM-DD), boolean,
 *    url (http(s)-only — same stored-XSS guard as srv/lib/url-validate.js, the
 *    values render as <a href> on the UNAUTHENTICATED consumer page), enum
 *    (against the definition's options), string/text (max_length),
 *  - min/max/max_length/regex constraints.
 *
 * Empty values (null/'') are allowed here — presence is the approve/publish
 * gate's concern (mandatory-fields.js), not the save path's; users may save
 * drafts with gaps. Error messages are clean, user-facing English (no internal
 * column names), per the project's error-message conventions.
 *
 * Returns the NORMALIZED bag (sorted keys, empty values dropped) to store, or
 * null when the bag is empty. Throws nothing itself — callers pass `reject`
 * (message → void) and stop on the first error via the return contract.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toNumber(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate one value against its definition. Returns an error MESSAGE string or
 * null when valid.
 */
function validateValue(def, value) {
  if (value === null || value === undefined || value === '') return null; // presence is the gate's concern
  const label = def.label;

  switch (def.datatype) {
    case 'number':
    case 'integer': {
      const n = toNumber(value);
      if (n === null) return `${label} must be a number.`;
      if (def.datatype === 'integer' && !Number.isInteger(n)) return `${label} must be a whole number.`;
      if (def.min_value != null && n < def.min_value) return `${label} must be at least ${def.min_value}.`;
      if (def.max_value != null && n > def.max_value) return `${label} must be at most ${def.max_value}.`;
      return null;
    }
    case 'date': {
      const s = String(value).slice(0, 10);
      if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) return `${label} must be a date (YYYY-MM-DD).`;
      return null;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return null;
      const s = String(value).toLowerCase();
      if (s === 'true' || s === 'false') return null;
      return `${label} must be yes or no.`;
    }
    case 'url': {
      if (!isHttpUrl(value)) return `${label} must be a full web address starting with https:// or http:// (for example https://example.com).`;
      if (def.max_length != null && String(value).length > def.max_length) {
        return `${label} must be at most ${def.max_length} characters.`;
      }
      return null;
    }
    case 'enum': {
      const allowed = (def.options || []).map((o) => String(o.value));
      if (!allowed.includes(String(value))) {
        return `${label} must be one of: ${allowed.join(', ')}.`;
      }
      return null;
    }
    default: { // string | text
      if (typeof value === 'object') return `${label} has an invalid value.`;
      const s = String(value);
      if (def.max_length != null && s.length > def.max_length) {
        return `${label} must be at most ${def.max_length} characters.`;
      }
      if (def.regex) {
        try {
          if (!new RegExp(def.regex).test(s)) return `${label} has an invalid format.`;
        } catch { /* malformed regex in master data — do not block users */ }
      }
      return null;
    }
  }
}

/**
 * Validate + normalize an entity's `attributes` bag for one level.
 *
 * @param {string|object|null} rawBag   the incoming attributes value (JSON string or object)
 * @param {{byLevel: object}} catalogue loaded catalogue of the entity's category
 * @param {'product'|'variant'|'batch'} level
 * @param {(message: string) => void} reject  called with a clean message on the FIRST error
 * @returns {string|null|undefined} normalized JSON string to store (null = empty bag);
 *   undefined when reject was called.
 */
function validateAttributes(rawBag, catalogue, level, reject) {
  if (rawBag === undefined) return undefined; // field not part of the payload — nothing to do
  if (rawBag === null || rawBag === '') return null;

  let bag;
  if (typeof rawBag === 'object') {
    bag = rawBag;
  } else {
    try {
      bag = JSON.parse(rawBag);
    } catch {
      reject('Attributes must be a valid set of field values.');
      return undefined;
    }
  }
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
    reject('Attributes must be a valid set of field values.');
    return undefined;
  }

  const defs = (catalogue.byLevel?.[level] || []).filter((f) => f.storage === 'json');
  const defByKey = Object.fromEntries(defs.map((f) => [f.key, f]));

  const out = {};
  for (const key of Object.keys(bag).sort()) {
    const value = bag[key];
    if (!KEY_PATTERN.test(key) || RESERVED_KEYS.has(key) || key.endsWith('_id')) {
      reject(`'${key}' is not a valid attribute name.`);
      return undefined;
    }
    const def = defByKey[key];
    if (!def) {
      reject(`'${key}' is not an attribute of this product category.`);
      return undefined;
    }
    if (value === null || value === undefined || value === '') continue; // drop empties
    const err = validateValue(def, value);
    if (err) {
      reject(err);
      return undefined;
    }
    out[key] = value;
  }

  return Object.keys(out).length ? JSON.stringify(out) : null;
}

module.exports = { validateAttributes, validateValue };
