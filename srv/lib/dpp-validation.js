'use strict';

const cds = require('@sap/cds');
const { isPresent, isSatisfied, mandatoryFieldsFor, rawKey } = require('./mandatory-fields');
const { loadCatalogue, getAttrValue } = require('./catalogue');

/**
 * Unified DPP validation catalogue — the single source of truth for every
 * readiness check shown in the UI (Validation page, DPP-detail readiness panel)
 * AND for the approve/publish gate in dpp-handlers.js#checkDPPReady.
 *
 * Check shape: { key, label, passed, mandatory, gate, section, fixHint, message }
 *  - `mandatory` drives the display severity (red vs. amber in the report).
 *  - `gate` marks checks that block approveDPP/publishDPP. gate ⊆ mandatory.
 *  - `message` is the clean, user-facing sentence used in the gate rejection
 *    (`DPP cannot be approved: <message> | …`) — no internal IDs or column names.
 *
 * Since Epic 12 the FIELD-presence checks (which product/batch fields must be
 * filled, their report section and fix hint) come from the DB attribute
 * catalogue (srv/lib/catalogue.js — AttributeDefinitions master data) for the
 * product's category: `ctx.catalogue` is REQUIRED. Structural checks (workflow
 * status, variant/batch/item linkage, BOM completeness) are category-agnostic
 * and stay here. Optional informational field checks (reuse instructions,
 * variant size/color, CO₂/recycled) only appear when the category's catalogue
 * defines the field — values are read storage-aware (column or attributes bag).
 *
 * Deliberately NOT gate-blocking:
 *  - `qr_available` / `visibility_ready` — publishDPP generates the QR token
 *    itself and visibility is set as part of the publish flow; gating on them
 *    would deadlock the first publish.
 *  - Item checks gate only for item passports (dpp_type 'item'); product-level
 *    passports have no item by design.
 *  - BOM checks gate only for finished products; materials, components and
 *    packaging legitimately have no bill of materials.
 */

const hasNumber = (v) => {
  if (!isPresent(v)) return false;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n);
};

function check(key, label, passed, { mandatory = true, gate, section = 'General', fixHint = '', message } = {}) {
  const isGate = gate === undefined ? mandatory : gate;
  return {
    key,
    label,
    passed: Boolean(passed),
    mandatory: Boolean(mandatory || isGate), // gate ⊆ mandatory
    gate: Boolean(isGate),
    section,
    fixHint,
    message: message || `${label} is required.`
  };
}

/** Catalogue field lookup by level+key (returns undefined when the category does not define it). */
function defOf(catalogue, level, key) {
  const fields = catalogue.byLevel ? catalogue.byLevel[level] : catalogue.fields.filter((f) => f.level === level);
  return (fields || []).find((f) => f.key === key);
}

/**
 * Evaluate the full check catalogue for one DPP. Pure — takes pre-loaded records
 * plus the loaded attribute catalogue (see loadDppValidationContext for the
 * single-DPP loader; validationOverview bulk-loads and calls this per DPP).
 *
 * @param {{ dpp: object, product?: object|null, variant?: object|null,
 *   batch?: object|null, item?: object|null, bom?: object[], batchComponents?: object[],
 *   catalogue: { byLevel: object, fields: object[] } }} ctx
 * @returns {{ checks: object[], can_approve: boolean, gate_errors: string[],
 *   missing_mandatory: {key:string,label:string,message:string}[],
 *   mandatory_failed: number, passed: number, total: number, score: string, percent: number }}
 */
function evaluateDppChecks({ dpp, product, variant, batch, item, bom = [], batchComponents = [], catalogue }) {
  if (!catalogue) throw new Error('evaluateDppChecks requires ctx.catalogue (see srv/lib/catalogue.js).');
  const itemGate = dpp?.dpp_type === 'item';
  const bomGate = product?.product_type === 'finished';
  const checks = [];

  // ── Passport ──
  checks.push(check('dpp_status', 'DPP has workflow status', isPresent(dpp?.status), {
    section: 'Passport',
    fixHint: 'Set DPP status to Draft, In Review, Approved, Published or Archived.',
    message: 'DPP status is missing.'
  }));
  checks.push(check('visibility_ready', 'Visibility is defined', isPresent(dpp?.visibility), {
    mandatory: true, gate: false, section: 'Passport',
    fixHint: 'Set DPP visibility (done automatically when publishing).'
  }));
  checks.push(check('qr_available', 'QR/public access token available',
    isPresent(dpp?.qr_token) || isPresent(dpp?.public_url), {
      mandatory: false, gate: false, section: 'Passport',
      fixHint: 'A QR/public access token is generated automatically on publish.'
    }));

  // ── Product + Circularity: field presence from the attribute catalogue ──
  checks.push(check('product_exists', 'Product assigned', !!product, {
    section: 'Product', fixHint: 'Assign a product to the DPP.',
    message: 'The DPP must reference a product.'
  }));
  for (const f of mandatoryFieldsFor(catalogue, 'product')) {
    if (f.key === 'espr_compliance') {
      checks.push(check('espr_compliance', 'ESPR compliance status is Compliant',
        product?.espr_compliance === 'compliant', {
          section: f.validation_section || 'Product', fixHint: f.fix_hint || '',
          message: 'ESPR compliance status must be Compliant.'
        }));
    } else {
      const key = f.key === 'product_type' ? 'product_type' : `product_${rawKey(f)}`;
      checks.push(check(key, `${f.label} filled`, !!product && isSatisfied(f.key, getAttrValue(product, f)), {
        section: f.validation_section || 'Product',
        fixHint: f.fix_hint || `Add ${f.label.toLowerCase()}.`,
        message: `${f.label} is required.`
      }));
    }
  }
  const reuseDef = defOf(catalogue, 'product', 'reuse_instructions');
  if (reuseDef && !reuseDef.mandatory) {
    checks.push(check('reuse_instructions', 'Reuse instructions filled', isPresent(getAttrValue(product, reuseDef)), {
      mandatory: false, gate: false, section: reuseDef.validation_section || 'Circularity',
      fixHint: reuseDef.fix_hint || ''
    }));
  }

  // ── Variant (resolved directly or via the batch) ──
  checks.push(check('variant_exists', 'Variant assigned', !!variant, {
    section: 'Variant', fixHint: 'Assign a variant to the DPP (directly or via its batch).',
    message: 'The DPP must reference a variant (directly or via its batch).'
  }));
  checks.push(check('variant_status_active', 'Variant is active', variant?.status === 'active', {
    section: 'Variant', fixHint: 'Set variant status to Active.',
    message: 'Variant must be active.'
  }));
  checks.push(check('variant_identification', 'Variant identification filled',
    isPresent(variant?.sku) || isPresent(variant?.gtin) || isPresent(variant?.ID), {
      section: 'Variant', fixHint: 'Add SKU, GTIN or variant ID.',
      message: 'Variant identification (SKU, GTIN or ID) is required.'
    }));
  const sizeDef = defOf(catalogue, 'variant', 'size');
  if (sizeDef && !sizeDef.mandatory) {
    checks.push(check('variant_size', 'Size filled', isPresent(getAttrValue(variant, sizeDef)), {
      mandatory: false, gate: false, section: 'Variant', fixHint: sizeDef.fix_hint || 'Add size if relevant.'
    }));
  }
  const colorDef = defOf(catalogue, 'variant', 'color');
  if (colorDef && !colorDef.mandatory) {
    checks.push(check('variant_color', 'Color filled', isPresent(getAttrValue(variant, colorDef)), {
      mandatory: false, gate: false, section: 'Variant', fixHint: colorDef.fix_hint || 'Add color if relevant.'
    }));
  }

  // ── Production: batch + (for item passports) item ──
  checks.push(check('batch_exists', 'Batch assigned', !!batch, {
    section: 'Production', fixHint: 'Assign a production batch.',
    message: 'The DPP must reference a production batch.'
  }));
  checks.push(check('batch_status_approved', 'Batch is approved', batch?.status === 'approved', {
    section: 'Production', fixHint: 'Set batch status to Approved.',
    message: 'Batch must be approved.'
  }));
  for (const f of mandatoryFieldsFor(catalogue, 'batch')) {
    const key = f.key === 'batch_number' ? 'batch_number' : `batch_${rawKey(f)}`;
    checks.push(check(key, `${f.label} filled`, !!batch && isSatisfied(f.key, getAttrValue(batch, f)), {
      section: f.validation_section || 'Production', fixHint: f.fix_hint || '',
      message: `${f.label} is required.`
    }));
  }
  checks.push(check('factory_or_supplier', 'Factory or supplier assigned',
    isPresent(batch?.factory_ID) || isPresent(batch?.supplier_ID), {
      mandatory: false, gate: false, section: 'Production',
      fixHint: 'Assign factory or supplier.'
    }));
  // Item checks apply to item passports (gate) or when an item is attached (informational).
  if (itemGate || item || isPresent(dpp?.item_ID)) {
    checks.push(check('item_exists', 'Item assigned', !!item, {
      mandatory: itemGate, gate: itemGate, section: 'Production',
      fixHint: 'Assign an item to the DPP.',
      message: 'The DPP must reference an item.'
    }));
    checks.push(check('item_status_active', 'Item is active', item?.status === 'active', {
      mandatory: itemGate, gate: itemGate, section: 'Production',
      fixHint: 'Only active items should be published.',
      message: 'Item must be active.'
    }));
  }

  // ── Components: BOM completeness gates finished products only ──
  checks.push(check('bom_exists', 'BOM/components available', bom.length > 0, {
    mandatory: bomGate, gate: bomGate, section: 'Components',
    fixHint: bomGate
      ? 'Create BOM/components for this variant.'
      : 'Optional for materials, components and packaging.',
    message: 'Bill of materials is missing.'
  }));
  checks.push(check('bom_quantities', 'Component quantities complete',
    bom.length === 0 || bom.every((b) => hasNumber(b.quantity)), {
      mandatory: bomGate, gate: bomGate, section: 'Components',
      fixHint: 'Fill quantity for every BOM component.',
      message: 'Every BOM component needs a quantity.'
    }));
  checks.push(check('bom_units', 'Component units complete',
    bom.length === 0 || bom.every((b) => isPresent(b.unit)), {
      mandatory: bomGate, gate: bomGate, section: 'Components',
      fixHint: 'Fill unit for every BOM component.',
      message: 'Every BOM component needs a unit.'
    }));
  checks.push(check('component_sourcing', 'Batch component sourcing available', batchComponents.length > 0, {
    mandatory: false, gate: false, section: 'Components',
    fixHint: 'Link consumed component batches or supplier batch numbers.'
  }));

  // ── Sustainability ──
  const co2Def = defOf(catalogue, 'batch', 'co2_footprint_kg');
  if (co2Def && !co2Def.mandatory) {
    checks.push(check('co2_footprint', 'CO₂ footprint filled', hasNumber(getAttrValue(batch, co2Def)), {
      mandatory: false, gate: false, section: co2Def.validation_section || 'Sustainability',
      fixHint: co2Def.fix_hint || 'Add CO₂ footprint.'
    }));
  }
  const recycledDef = defOf(catalogue, 'batch', 'recycled_content_pct');
  if (recycledDef && !recycledDef.mandatory) {
    checks.push(check('recycled_content', 'Recycled content filled', hasNumber(getAttrValue(batch, recycledDef)), {
      mandatory: false, gate: false, section: recycledDef.validation_section || 'Sustainability',
      fixHint: recycledDef.fix_hint || 'Add recycled content percentage.'
    }));
  }

  const gateFailed = checks.filter((c) => c.gate && !c.passed);
  const mandatoryFailed = checks.filter((c) => c.mandatory && !c.passed);
  const passed = checks.filter((c) => c.passed).length;

  return {
    checks,
    can_approve: gateFailed.length === 0,
    gate_errors: gateFailed.map((c) => c.message),
    missing_mandatory: gateFailed.map((c) => ({ key: c.key, label: c.label, message: c.message })),
    mandatory_failed: mandatoryFailed.length,
    passed,
    total: checks.length,
    score: `${passed}/${checks.length}`,
    percent: Math.round((passed / checks.length) * 100)
  };
}

/**
 * Load the records evaluateDppChecks needs for ONE DPP, including the attribute
 * catalogue for the product's category. Resolution mirrors buildSnapshot
 * (dpp-handlers.js): variant via dpp.variant_ID, else via the batch; BOM edges
 * by parent variant. Reads the DB-level entities — callers are expected to have
 * done the tenant check (requireOwningOrg) already.
 */
async function loadDppValidationContext(dpp) {
  const { Products, ProductVariants, Batches, ProductItems, ProductBOMs, BatchComponents } = cds.entities('dpp');

  const [product, batch, item] = await Promise.all([
    dpp.product_ID ? SELECT.one.from(Products).where({ ID: dpp.product_ID }) : null,
    dpp.batch_ID ? SELECT.one.from(Batches).where({ ID: dpp.batch_ID }) : null,
    dpp.item_ID ? SELECT.one.from(ProductItems).where({ ID: dpp.item_ID }) : null
  ]);

  const variantId = dpp.variant_ID || (batch && batch.variant_ID) || null;
  const variant = variantId
    ? await SELECT.one.from(ProductVariants).where({ ID: variantId })
    : null;

  const [bom, batchComponents, catalogue] = await Promise.all([
    variant ? SELECT.from(ProductBOMs).where({ parent_ID: variant.ID }) : [],
    batch ? SELECT.from(BatchComponents).where({ batch_ID: batch.ID }) : [],
    loadCatalogue(product ? product.category_code : null)
  ]);

  return { dpp, product, variant, batch, item, bom, batchComponents, catalogue };
}

module.exports = { evaluateDppChecks, loadDppValidationContext };
