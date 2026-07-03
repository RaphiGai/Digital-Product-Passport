'use strict';

const { getAttrValue } = require('./catalogue');

/**
 * Mandatory-field gate — the field-presence core of the unified DPP validation
 * (srv/lib/dpp-validation.js builds the full check catalogue on top of this;
 * add/remove FIELDS in the AttributeDefinitions master data, add/remove CHECKS
 * there).
 *
 * Since Epic 12 the mandatory field set comes from the DB attribute catalogue
 * (srv/lib/catalogue.js): callers pass the loaded catalogue and the gate
 * evaluates its `mandatory` definitions for the product's category (core ∪
 * category fields). The legacy MANDATORY constant below is kept ONLY as the
 * parity reference pinned by test/unit/catalogue-parity.test.js against the
 * seed data — runtime code must not read it.
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

// LEGACY PARITY REFERENCE — do not consume at runtime (see header).
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

/**
 * The key a catalogue field has on the RAW entity row / in legacy reports.
 * Association-backed catalogue fields are modelled once under their display key
 * (`category`) while the raw row carries the FK (`category_code`) — reports and
 * check keys stay on the raw key so existing consumers see unchanged shapes.
 */
function rawKey(field) {
  return field.key === 'category' ? 'category_code' : field.key;
}

/** Mandatory catalogue fields of one level ('product' | 'variant' | 'batch'). */
function mandatoryFieldsFor(catalogue, level) {
  const fields = catalogue.byLevel ? catalogue.byLevel[level] : catalogue.fields.filter((f) => f.level === level);
  return (fields || []).filter((f) => f.mandatory);
}

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
 * optional batch) against the product's category catalogue (srv/lib/catalogue.js).
 * Returns `[{ scope, key, label }]` — empty means ready to approve.
 * @param {object|null} product
 * @param {object|null} batch
 * @param {{byLevel: object, fields: object[]}} catalogue
 */
function missingMandatory(product, batch, catalogue) {
  if (!catalogue) throw new Error('missingMandatory requires the loaded attribute catalogue.');
  const missing = [];
  if (!product) {
    missing.push({ scope: 'product', key: '_product', label: 'Product' });
  } else {
    for (const f of mandatoryFieldsFor(catalogue, 'product')) {
      if (!isSatisfied(f.key, getAttrValue(product, f))) {
        missing.push({ scope: 'product', key: rawKey(f), label: f.label });
      }
    }
  }
  if (batch) {
    for (const f of mandatoryFieldsFor(catalogue, 'batch')) {
      if (!isSatisfied(f.key, getAttrValue(batch, f))) {
        missing.push({ scope: 'batch', key: rawKey(f), label: f.label });
      }
    }
  }
  return missing;
}

module.exports = { MANDATORY, isPresent, isSatisfied, missingMandatory, mandatoryFieldsFor, rawKey };
