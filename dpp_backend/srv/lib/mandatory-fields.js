'use strict';

/**
 * Mandatory-field catalogue — the field-presence core of the unified DPP
 * validation (srv/lib/dpp-validation.js builds the full check catalogue on top
 * of these lists; add/remove FIELDS here, add/remove CHECKS there).
 *
 * Consumers:
 *  - srv/lib/dpp-validation.js → approve/publish gate + validationStatus/validationOverview
 *  - srv/handlers/compliance-handlers.js → product-level readiness KPIs
 *
 * Behavior is asserted in test/unit/versioning-lib.test.js and
 * test/unit/dpp-validation.test.js. Labels are clean, human-facing English
 * (no internal column names), per the error-message conventions.
 *
 * Deliberately EXCLUDED: the product `status` field — it is the product's own
 * internal lifecycle, not DPP content. `product_type` is included for catalogue
 * fidelity (it is non-null in the DB, so it never actually blocks).
 * `espr_compliance` must be 'compliant' — a merely-set status (draft/in_review/
 * non_compliant) blocks approval; see isSatisfied below.
 */

const MANDATORY = {
  product: [
    { key: 'product_type', label: 'Product type' },
    { key: 'name', label: 'Name' },
    { key: 'brand', label: 'Brand' },
    { key: 'category_code', label: 'Category' },   // FK to ProductCategories code list (raw product row carries category_code)
    { key: 'fibre_composition', label: 'Fibre composition' },
    { key: 'care_instructions', label: 'Care instructions' },
    { key: 'repair_instructions', label: 'Repair instructions' },
    { key: 'disposal_instructions', label: 'Disposal instructions' },
    { key: 'country_of_origin', label: 'Country of origin' },
    { key: 'substances_of_concern', label: 'Substances of concern' },
    { key: 'espr_compliance', label: 'ESPR compliance status' }
  ],
  batch: [
    { key: 'batch_number', label: 'Batch number' },
    { key: 'production_date', label: 'Production date' },
    { key: 'country_of_origin', label: 'Batch country of origin' }
  ]
};

/** A value is "present" when it is neither null/undefined nor an empty/whitespace string. */
function isPresent(value) {
  return value != null && String(value).trim() !== '';
}

/**
 * Whether a single mandatory field is satisfied. All fields are presence
 * checks except espr_compliance, which must be exactly 'compliant'.
 */
function isSatisfied(key, value) {
  if (key === 'espr_compliance') return value === 'compliant';
  return isPresent(value);
}

/**
 * Compute the missing mandatory fields for a DPP given its resolved product (and
 * optional batch). Returns `[{ scope, key, label }]` — empty means ready to approve.
 * @param {object|null} product
 * @param {object|null} batch
 */
function missingMandatory(product, batch) {
  const missing = [];
  if (!product) {
    missing.push({ scope: 'product', key: '_product', label: 'Product' });
  } else {
    for (const f of MANDATORY.product) {
      if (!isSatisfied(f.key, product[f.key])) missing.push({ scope: 'product', key: f.key, label: f.label });
    }
  }
  if (batch) {
    for (const f of MANDATORY.batch) {
      if (!isSatisfied(f.key, batch[f.key])) missing.push({ scope: 'batch', key: f.key, label: f.label });
    }
  }
  return missing;
}

module.exports = { MANDATORY, isPresent, isSatisfied, missingMandatory };
