'use strict';

const cds = require('@sap/cds');

/**
 * Attribute-catalogue loader — the runtime access layer for the master-data
 * field catalogue (db/config.cds: AttributeDefinitions / AttributeSections /
 * CategoryRequirements). Single source of truth for which fields exist per
 * product category, which are mandatory, their visibility defaults and the
 * regulatory locked-public set. Consumed by mandatory-fields.js,
 * dpp-validation.js, field-visibility.js, public-handler.js, import and the
 * frontend (via the DPPService.fieldCatalogue function).
 *
 * The merged catalogue for a category = core rows (category null) ∪ that
 * category's rows. Definitions are master data curated by developers/IT
 * consultants and change only on (re)deploy or direct DB maintenance, so an
 * in-memory cache per category is safe; clearCache() exists for tests.
 */

// Bridge for data created before a category existed / with no category set:
// such products historically got the full textile field set (the app started
// textile-only), so resolving "no/unknown category" to 'textiles' preserves
// today's approve/publish and visibility behavior exactly.
const DEFAULT_CATEGORY = 'textiles';

// Keys that would collide with snapshot-hash.js#stripDeep (dropped from the
// drift hash) or with existing single-purpose columns. Enforced on load and by
// the attribute write validation.
const RESERVED_KEYS = new Set(['status', 'id', 'attributes', 'field_visibility']);
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const LEVELS = new Set(['product', 'variant', 'batch']);

const cache = new Map(); // categoryCode|'' → { category, sections, fields, byLevel }

function assertValidKey(def) {
  const key = String(def.key || '');
  if (!KEY_PATTERN.test(key) || key.endsWith('_id')) {
    throw new Error(`Invalid attribute key '${key}' in AttributeDefinitions (${def.ID}).`);
  }
  // Reserved names guard the JSON bag only: as a bag key they would collide with
  // snapshot-hash#stripDeep (silently dropped from the drift hash) or shadow the
  // bag/visibility columns. Column-backed core fields (e.g. the real `status`
  // column) legitimately carry these names.
  if (def.storage !== 'column' && RESERVED_KEYS.has(key)) {
    throw new Error(`Attribute key '${key}' is reserved and cannot be stored in the attributes bag (${def.ID}).`);
  }
  if (!LEVELS.has(def.level)) {
    throw new Error(`Invalid level '${def.level}' in AttributeDefinitions (${def.ID}).`);
  }
}

/** Parse an entity's `attributes` JSON bag ({key: value}); tolerant of null/garbage. */
function parseBag(json) {
  if (!json) return {};
  if (typeof json === 'object') return json;
  try {
    const o = JSON.parse(json);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/**
 * Read one field's value off a raw entity row according to its definition.
 * storage 'column': the physical column; for association-backed fields the raw
 * row carries the FK instead (e.g. catalogue key `category` ↔ column
 * `category_code`), so fall back to `<key>_code`.
 * storage 'json': the key inside the `attributes` bag.
 */
function getAttrValue(entity, def) {
  if (!entity) return undefined;
  if (def.storage === 'column') {
    const direct = entity[def.key];
    if (direct !== undefined && direct !== null) return direct;
    return entity[`${def.key}_code`];
  }
  return parseBag(entity.attributes)[def.key];
}

async function loadFromDb(categoryCode) {
  const { AttributeDefinitions, AttributeSections, ProductCategories } = cds.entities('dpp');

  let code = categoryCode || null;
  if (code) {
    const exists = await SELECT.one.from(ProductCategories).columns('code').where({ code });
    if (!exists) code = null;
  }
  if (!code) code = DEFAULT_CATEGORY;

  // The catalogue tables are small master data (a few dozen rows per category),
  // so load them whole and merge core ∪ category in JS — sidesteps SQL NULL-vs-IN
  // semantics and keeps the query portable across SQLite and HANA.
  const [allDefs, allSections] = await Promise.all([
    SELECT.from(AttributeDefinitions),
    SELECT.from(AttributeSections),
  ]);
  const forCategory = (row) => row.category_code == null || row.category_code === code;
  const defs = allDefs.filter((d) => d.is_active !== false && forCategory(d));
  const sections = allSections.filter(forCategory);

  for (const d of defs) assertValidKey(d);

  const sortedSections = sections
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const sectionById = Object.fromEntries(sortedSections.map((s) => [s.ID, s]));

  const fields = defs
    .slice()
    .sort((a, b) => {
      const sa = sectionById[a.section_ID]?.sort_order ?? 0;
      const sb = sectionById[b.section_ID]?.sort_order ?? 0;
      if (sa !== sb) return sa - sb;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    })
    .map((d) => ({
      key: d.key,
      level: d.level,
      storage: d.storage,
      category: d.category_code || null,   // null ⇒ core field (all categories)
      label: d.label,
      description: d.description ?? null,
      datatype: d.datatype,
      widget: d.widget ?? null,
      section: sectionById[d.section_ID]?.key ?? null,
      grp: d.grp ?? null,
      sort_order: d.sort_order ?? 0,
      unit: d.unit ?? null,
      min_value: d.min_value != null ? Number(d.min_value) : null,
      max_value: d.max_value != null ? Number(d.max_value) : null,
      max_length: d.max_length ?? null,
      regex: d.regex ?? null,
      options: d.options ? safeParseOptions(d.options, d.ID) : null,
      mandatory: !!d.mandatory,
      fix_hint: d.fix_hint ?? null,
      validation_section: d.validation_section ?? null,
      visibility: d.default_visibility || 'public',
      locked: !!d.locked_public,
    }));

  const byLevel = { product: [], variant: [], batch: [] };
  for (const f of fields) byLevel[f.level].push(f);

  return {
    category: code,
    sections: sortedSections.map((s) => ({
      key: s.key,
      title: s.title,
      icon: s.icon ?? null,
      sort_order: s.sort_order ?? 0,
      show_on_consumer: s.show_on_consumer !== false,
    })),
    fields,
    byLevel,
  };
}

function safeParseOptions(raw, id) {
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(o) ? o : null;
  } catch {
    console.warn(`[catalogue] ignoring malformed options JSON on AttributeDefinitions ${id}`);
    return null;
  }
}

/**
 * Merged catalogue for a category (core ∪ category rows), cached. `categoryCode`
 * may be null/unknown — resolves to the default category (see DEFAULT_CATEGORY).
 */
async function loadCatalogue(categoryCode) {
  const key = categoryCode || '';
  if (cache.has(key)) return cache.get(key);
  const cat = await loadFromDb(categoryCode);
  cache.set(key, cat);
  return cat;
}

/**
 * Expected ESPR evidence document types for a category (CategoryRequirements),
 * as an array of DocumentType values. Accepts a comma-separated list or a JSON
 * array in the column. Falls back to `fallback` when unconfigured.
 */
async function expectedDocTypes(categoryCode, fallback = []) {
  const { CategoryRequirements } = cds.entities('dpp');
  const code = categoryCode || DEFAULT_CATEGORY;
  const row = await SELECT.one.from(CategoryRequirements).where({ category_code: code });
  const raw = row && row.expected_doc_types;
  if (!raw) return fallback;
  const s = String(raw).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) && arr.length ? arr.map(String) : fallback;
    } catch {
      return fallback;
    }
  }
  const list = s.split(',').map((t) => t.trim()).filter(Boolean);
  return list.length ? list : fallback;
}

/** Drop the cached catalogues (tests / after definition maintenance). */
function clearCache() {
  cache.clear();
}

module.exports = {
  loadCatalogue,
  expectedDocTypes,
  getAttrValue,
  parseBag,
  clearCache,
  DEFAULT_CATEGORY,
  RESERVED_KEYS,
  KEY_PATTERN,
};
