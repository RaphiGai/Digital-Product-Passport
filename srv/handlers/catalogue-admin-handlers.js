'use strict';

const cds = require('@sap/cds');
const { randomUUID } = require('crypto');
const { requireActiveUser, requireRole } = require('./auth-helpers');
const { clearCache, parseBag, KEY_PATTERN, RESERVED_KEYS } = require('../lib/catalogue');

/**
 * Runtime administration of the attribute catalogue (Epic 12 follow-up):
 * ProductCategories / AttributeSections / AttributeDefinitions /
 * CategoryRequirements become writable through the Field-Catalogue admin UI.
 *
 * Authorization: the catalogue is GLOBAL master data (applies to every tenant),
 * so writes are restricted to the PLATFORM OPERATOR — a company_advanced user
 * whose organization has is_platform_tenant = true. Regular tenant admins keep
 * read access only.
 *
 * Guardrails (mirrors what the seed conventions enforced by hand):
 *  - field keys follow catalogue.js#KEY_PATTERN and avoid RESERVED_KEYS/_id
 *    (those would silently vanish from the drift hash — snapshot-hash#stripDeep),
 *  - keys are immutable after creation (stored bag values hang off them),
 *  - runtime-created fields are always storage='json' (columns are developer terrain),
 *  - enum fields need a [{value,label}] options array; locked fields must be public,
 *  - a field's section must belong to the same category (or be a core section),
 *  - definitions with stored values cannot be deleted — deactivate instead,
 *  - every write clears the in-memory catalogue cache, so fieldCatalogue()
 *    serves the change immediately (no redeploy, no restart).
 */

const LEVELS = new Set(['product', 'variant', 'batch']);
const DATATYPES = new Set(['string', 'text', 'number', 'integer', 'date', 'boolean', 'url', 'enum']);
const CATEGORY_CODE_PATTERN = /^[a-z][a-z0-9_-]*$/;

const CONFIG_ENTITIES = ['ProductCategories', 'AttributeSections', 'AttributeDefinitions', 'CategoryRequirements'];

/** company_advanced of the platform-operator org — everyone else gets a clean 403. */
async function requirePlatformAdmin(req) {
  const orgId = await requireActiveUser(req);
  requireRole(req, 'company_advanced');
  const { Organizations } = cds.entities('dpp');
  const org = await SELECT.one.from(Organizations).columns('is_platform_tenant').where({ ID: orgId });
  if (!org || org.is_platform_tenant !== true) {
    req.reject(403, 'Only the platform operator can maintain the field catalogue.');
  }
}

const keyOf = (req) => {
  const last = req.params && req.params[req.params.length - 1];
  return last && typeof last === 'object' ? last.ID : last;
};

/** Load the current row on UPDATE/DELETE so validations see the effective state. */
async function currentRow(req, entity) {
  const id = keyOf(req);
  if (!id) return null;
  return SELECT.one.from(cds.entities('dpp')[entity]).where({ ID: id });
}

// ── Per-entity validation ────────────────────────────────────────────────────

async function validateDefinition(req) {
  const existing = req.event === 'UPDATE' ? await currentRow(req, 'AttributeDefinitions') : null;
  const eff = { ...(existing || {}), ...req.data };

  if (req.event === 'UPDATE' && req.data.key !== undefined && existing && req.data.key !== existing.key) {
    req.reject(400, 'The technical key of a field cannot be changed — stored values reference it. Create a new field instead.');
  }
  const key = String(eff.key || '');
  if (!KEY_PATTERN.test(key) || RESERVED_KEYS.has(key) || key.endsWith('_id')) {
    req.reject(400, 'The technical key must be lowercase letters, digits and underscores (not a reserved name).');
  }
  if (!LEVELS.has(eff.level)) {
    req.reject(400, 'Level must be product, variant or batch.');
  }
  if (!DATATYPES.has(eff.datatype)) {
    req.reject(400, 'Please choose a valid data type.');
  }
  // Runtime-created fields live in the attributes bag; physical columns are code.
  if (req.event === 'CREATE') req.data.storage = 'json';
  else if (req.data.storage !== undefined && existing && req.data.storage !== existing.storage) {
    req.reject(400, 'The storage of a field cannot be changed.');
  }
  if (!String(eff.label || '').trim()) {
    req.reject(400, 'A field label is required.');
  }
  if (eff.datatype === 'enum') {
    let opts = null;
    try { opts = typeof eff.options === 'string' ? JSON.parse(eff.options) : eff.options; } catch { opts = null; }
    const ok = Array.isArray(opts) && opts.length > 0 &&
      opts.every((o) => o && typeof o === 'object' && String(o.value ?? '').trim() !== '');
    if (!ok) req.reject(400, 'A choice field needs at least one option (value and label).');
  }
  if (eff.locked_public === true && eff.default_visibility === 'internal') {
    req.reject(400, 'A regulatory-locked field is always public — it cannot default to internal.');
  }
  // The section must be a core section or belong to the field's category.
  if (eff.section_ID) {
    const { AttributeSections } = cds.entities('dpp');
    const section = await SELECT.one.from(AttributeSections)
      .columns('category_code').where({ ID: eff.section_ID });
    if (!section) req.reject(400, 'The selected section does not exist.');
    if (section.category_code != null && section.category_code !== (eff.category_code ?? null)) {
      req.reject(400, 'The section belongs to a different category.');
    }
  }
}

async function validateSection(req) {
  const existing = req.event === 'UPDATE' ? await currentRow(req, 'AttributeSections') : null;
  const eff = { ...(existing || {}), ...req.data };
  if (!KEY_PATTERN.test(String(eff.key || ''))) {
    req.reject(400, 'The section key must be lowercase letters, digits and underscores.');
  }
  if (!String(eff.title || '').trim()) {
    req.reject(400, 'A section title is required.');
  }
}

async function validateCategory(req) {
  if (req.event === 'CREATE' && !CATEGORY_CODE_PATTERN.test(String(req.data.code || ''))) {
    req.reject(400, 'The category code must be lowercase letters, digits, hyphens or underscores.');
  }
  if (req.event === 'UPDATE' && req.data.code !== undefined) {
    const existing = await currentRow(req, 'ProductCategories');
    // ProductCategories is keyed by code — a key change would orphan every reference.
    if (existing && req.data.code !== existing.code) {
      req.reject(400, 'The category code cannot be changed.');
    }
  }
  if (req.event === 'DELETE') {
    const code = keyOf(req);
    const { Products } = cds.entities('dpp');
    const used = await SELECT.one.from(Products).columns('ID').where({ category_code: code });
    if (used) req.reject(400, 'This category is used by existing products and cannot be deleted.');
  }
}

/** Usage counts of a category's bag-backed fields: { "<level>.<key>": count }. */
async function usageForCategory(categoryCode) {
  const { AttributeDefinitions, Products, ProductVariants, Batches } = cds.entities('dpp');
  const defs = (await SELECT.from(AttributeDefinitions)
    .columns('key', 'level', 'storage')
    .where({ category_code: categoryCode })).filter((d) => d.storage === 'json');
  const usage = Object.fromEntries(defs.map((d) => [`${d.level}.${d.key}`, 0]));
  if (!defs.length) return usage;

  const products = await SELECT.from(Products).columns('ID', 'category_code', 'attributes')
    .where({ category_code: categoryCode });
  const productIds = products.map((p) => p.ID);
  const variants = productIds.length
    ? await SELECT.from(ProductVariants).columns('ID', 'attributes').where({ product_ID: { in: productIds } })
    : [];
  const variantIds = variants.map((v) => v.ID);
  const batches = variantIds.length
    ? await SELECT.from(Batches).columns('ID', 'attributes').where({ variant_ID: { in: variantIds } })
    : [];

  const rowsByLevel = { product: products, variant: variants, batch: batches };
  for (const d of defs) {
    for (const row of rowsByLevel[d.level] || []) {
      const v = parseBag(row.attributes)[d.key];
      if (v !== undefined && v !== null && v !== '') usage[`${d.level}.${d.key}`] += 1;
    }
  }
  return usage;
}

module.exports = (srv) => {
  // ── Authorization + validation on every catalogue write ──
  for (const entity of CONFIG_ENTITIES) {
    srv.before(['CREATE', 'UPDATE', 'DELETE'], entity, requirePlatformAdmin);
  }
  srv.before(['CREATE', 'UPDATE'], 'AttributeDefinitions', validateDefinition);
  srv.before(['CREATE', 'UPDATE'], 'AttributeSections', validateSection);
  srv.before(['CREATE', 'UPDATE', 'DELETE'], 'ProductCategories', validateCategory);

  // Definitions with stored values must be deactivated, not deleted.
  srv.before('DELETE', 'AttributeDefinitions', async (req) => {
    const row = await currentRow(req, 'AttributeDefinitions');
    if (!row) return;
    const usage = await usageForCategory(row.category_code);
    if ((usage[`${row.level}.${row.key}`] || 0) > 0) {
      req.reject(400, 'This field has stored values and cannot be deleted. Deactivate it instead.');
    }
  });

  // A section that still carries fields must not disappear.
  srv.before('DELETE', 'AttributeSections', async (req) => {
    const id = keyOf(req);
    const { AttributeDefinitions } = cds.entities('dpp');
    const used = await SELECT.one.from(AttributeDefinitions).columns('ID').where({ section_ID: id });
    if (used) req.reject(400, 'This section still contains fields. Move or delete them first.');
  });

  // Every successful write invalidates the in-memory catalogue cache — this is
  // what makes admin changes take effect immediately in forms, gate and consumer.
  for (const entity of CONFIG_ENTITIES) {
    srv.after(['CREATE', 'UPDATE', 'DELETE'], entity, () => clearCache());
  }

  // ── action cloneCategoryCatalogue: new category as a copy of an existing one ──
  srv.on('cloneCategoryCatalogue', async (req) => {
    await requirePlatformAdmin(req);
    const { source_code, code, name, descr } = req.data;
    const { ProductCategories, AttributeSections, AttributeDefinitions, CategoryRequirements } = cds.entities('dpp');

    if (!CATEGORY_CODE_PATTERN.test(String(code || ''))) {
      req.reject(400, 'The category code must be lowercase letters, digits, hyphens or underscores.');
    }
    if (!String(name || '').trim()) req.reject(400, 'A category name is required.');
    if (await SELECT.one.from(ProductCategories).columns('code').where({ code })) {
      req.reject(400, 'A category with this code already exists.');
    }
    const source = source_code
      ? await SELECT.one.from(ProductCategories).columns('code').where({ code: source_code })
      : null;
    if (source_code && !source) req.reject(400, 'The source category does not exist.');

    await INSERT.into(ProductCategories).entries({ code, name: name.trim(), descr: descr || null });

    if (source) {
      const sections = await SELECT.from(AttributeSections).where({ category_code: source_code });
      const sectionIdMap = new Map();
      for (const s of sections) {
        const newId = `sec-${code}-${s.key}`.slice(0, 36);
        sectionIdMap.set(s.ID, newId);
        await INSERT.into(AttributeSections).entries({
          ...s, ID: newId, category_code: code,
        });
      }
      const defs = await SELECT.from(AttributeDefinitions).where({ category_code: source_code });
      for (const d of defs) {
        await INSERT.into(AttributeDefinitions).entries({
          ...d,
          ID: randomUUID(),
          category_code: code,
          section_ID: d.section_ID ? (sectionIdMap.get(d.section_ID) ?? d.section_ID) : null,
        });
      }
      const reqs = await SELECT.from(CategoryRequirements).where({ category_code: source_code });
      for (const r of reqs) {
        await INSERT.into(CategoryRequirements).entries({ ...r, ID: randomUUID(), category_code: code });
      }
    }

    clearCache();
    return code;
  });

  // ── function catalogueUsage: delete-vs-deactivate support for the admin UI ──
  srv.on('catalogueUsage', async (req) => {
    await requireActiveUser(req); // read-only insight; no platform gate needed
    return JSON.stringify(await usageForCategory(req.data.category || null));
  });
};
