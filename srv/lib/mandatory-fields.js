'use strict';

/**
 * Mandatory-field catalogue for the DPP approve/publish gate — the single backend
 * source of truth for "what must be filled before a passport can be approved".
 *
 * KEEP IN SYNC with the frontend catalogue dpp_frontend/app/src/lib/fieldCatalogue.js
 * (the `mandatory: true` entries of PRODUCT_CATALOGUE / BATCH_CATALOGUE). The key set
 * is asserted equal in test/unit/mandatory-fields.test.js. Labels here are clean,
 * human-facing English (no internal column names), per the error-message conventions.
 *
 * Deliberately EXCLUDED from the approve gate: the product `status` field — it is the
 * product's own internal lifecycle, not DPP content. `product_type` is included for
 * catalogue fidelity (it is non-null in the DB, so it never actually blocks).
 * `espr_compliance` is checked for PRESENCE only — its default 'draft' counts as set;
 * compliance *quality* is surfaced separately in the compliance view, not the gate.
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
    { key: 'country_of_origin', label: 'Batch country of origin' }
  ]
};

/** A value is "present" when it is neither null/undefined nor an empty/whitespace string. */
function isPresent(value) {
  return value != null && String(value).trim() !== '';
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
      if (!isPresent(product[f.key])) missing.push({ scope: 'product', key: f.key, label: f.label });
    }
  }
  if (batch) {
    for (const f of MANDATORY.batch) {
      if (!isPresent(batch[f.key])) missing.push({ scope: 'batch', key: f.key, label: f.label });
    }
  }
  return missing;
}

module.exports = { MANDATORY, isPresent, missingMandatory };
