'use strict';

const cds = require('@sap/cds');
const { MANDATORY, isPresent } = require('./mandatory-fields');

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
 * Deliberately NOT gate-blocking:
 *  - `qr_available` / `visibility_ready` — publishDPP generates the QR token
 *    itself and visibility is set as part of the publish flow; gating on them
 *    would deadlock the first publish.
 *  - Item checks gate only for item passports (dpp_type 'item'); product-level
 *    passports have no item by design.
 *  - BOM checks gate only for finished products; materials, components and
 *    packaging legitimately have no bill of materials.
 *
 * The field-presence core (which product/batch fields must be filled) comes
 * from srv/lib/mandatory-fields.js — keep field additions there, not here.
 */

/** Sections + fix hints for the field-presence checks defined in MANDATORY. */
const FIELD_META = {
  product: {
    product_type:          { section: 'Product',     fixHint: 'Add product type.' },
    name:                  { section: 'Product',     fixHint: 'Add product name.' },
    brand:                 { section: 'Product',     fixHint: 'Add brand.' },
    category_code:         { section: 'Product',     fixHint: 'Select a product category.' },
    fibre_composition:     { section: 'Product',     fixHint: 'Add fibre composition.' },
    care_instructions:     { section: 'Circularity', fixHint: 'Add washing/care instructions.' },
    repair_instructions:   { section: 'Circularity', fixHint: 'Add repair information.' },
    disposal_instructions: { section: 'Circularity', fixHint: 'Add disposal or recycling information.' },
    country_of_origin:     { section: 'Product',     fixHint: 'Add country of origin.' },
    substances_of_concern: { section: 'Product',     fixHint: 'Add substances of concern, REACH status or SCIP reference.' },
    espr_compliance:       { section: 'Product',     fixHint: 'Set ESPR compliance status to Compliant in Product information.' }
  },
  batch: {
    batch_number:      { section: 'Production', fixHint: 'Add supplier/production batch number.' },
    production_date:   { section: 'Production', fixHint: 'Add production date.' },
    country_of_origin: { section: 'Production', fixHint: 'Add production country.' }
  }
};

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

/**
 * Evaluate the full check catalogue for one DPP. Pure — takes pre-loaded records
 * (see loadDppValidationContext for the single-DPP loader; validationOverview
 * bulk-loads and calls this per DPP).
 *
 * @param {{ dpp: object, product?: object|null, variant?: object|null,
 *   batch?: object|null, item?: object|null, bom?: object[], batchComponents?: object[] }} ctx
 * @returns {{ checks: object[], can_approve: boolean, gate_errors: string[],
 *   missing_mandatory: {key:string,label:string,message:string}[],
 *   mandatory_failed: number, passed: number, total: number, score: string, percent: number }}
 */
function evaluateDppChecks({ dpp, product, variant, batch, item, bom = [], batchComponents = [] }) {
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

  // ── Product + Circularity: field presence from the shared MANDATORY catalogue ──
  checks.push(check('product_exists', 'Product assigned', !!product, {
    section: 'Product', fixHint: 'Assign a product to the DPP.',
    message: 'The DPP must reference a product.'
  }));
  for (const f of MANDATORY.product) {
    const meta = FIELD_META.product[f.key] || {};
    if (f.key === 'espr_compliance') {
      checks.push(check('espr_compliance', 'ESPR compliance status is Compliant',
        product?.espr_compliance === 'compliant', {
          section: meta.section || 'Product', fixHint: meta.fixHint,
          message: 'ESPR compliance status must be Compliant.'
        }));
    } else {
      const key = f.key === 'product_type' ? 'product_type' : `product_${f.key}`;
      checks.push(check(key, `${f.label} filled`, !!product && isPresent(product[f.key]), {
        section: meta.section || 'Product',
        fixHint: meta.fixHint || `Add ${f.label.toLowerCase()}.`,
        message: `${f.label} is required.`
      }));
    }
  }
  checks.push(check('reuse_instructions', 'Reuse instructions filled', isPresent(product?.reuse_instructions), {
    mandatory: false, gate: false, section: 'Circularity',
    fixHint: 'Add reuse or second-life information.'
  }));

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
  checks.push(check('variant_size', 'Size filled', isPresent(variant?.size), {
    mandatory: false, gate: false, section: 'Variant', fixHint: 'Add size if relevant.'
  }));
  checks.push(check('variant_color', 'Color filled', isPresent(variant?.color), {
    mandatory: false, gate: false, section: 'Variant', fixHint: 'Add color if relevant.'
  }));

  // ── Production: batch + (for item passports) item ──
  checks.push(check('batch_exists', 'Batch assigned', !!batch, {
    section: 'Production', fixHint: 'Assign a production batch.',
    message: 'The DPP must reference a production batch.'
  }));
  checks.push(check('batch_status_approved', 'Batch is approved', batch?.status === 'approved', {
    section: 'Production', fixHint: 'Set batch status to Approved.',
    message: 'Batch must be approved.'
  }));
  for (const f of MANDATORY.batch) {
    const meta = FIELD_META.batch[f.key] || {};
    const key = f.key === 'batch_number' ? 'batch_number' : `batch_${f.key}`;
    checks.push(check(key, `${f.label} filled`, !!batch && isPresent(batch[f.key]), {
      section: meta.section || 'Production', fixHint: meta.fixHint || '',
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
  checks.push(check('co2_footprint', 'CO₂ footprint filled', hasNumber(batch?.co2_footprint_kg), {
    mandatory: false, gate: false, section: 'Sustainability', fixHint: 'Add CO₂ footprint.'
  }));
  checks.push(check('recycled_content', 'Recycled content filled', hasNumber(batch?.recycled_content_pct), {
    mandatory: false, gate: false, section: 'Sustainability', fixHint: 'Add recycled content percentage.'
  }));

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
 * Load the records evaluateDppChecks needs for ONE DPP. Resolution mirrors
 * buildSnapshot (dpp-handlers.js): variant via dpp.variant_ID, else via the
 * batch; BOM edges by parent variant. Reads the DB-level entities — callers
 * are expected to have done the tenant check (requireOwningOrg) already.
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

  const [bom, batchComponents] = await Promise.all([
    variant ? SELECT.from(ProductBOMs).where({ parent_ID: variant.ID }) : [],
    batch ? SELECT.from(BatchComponents).where({ batch_ID: batch.ID }) : []
  ]);

  return { dpp, product, variant, batch, item, bom, batchComponents };
}

module.exports = { evaluateDppChecks, loadDppValidationContext };
