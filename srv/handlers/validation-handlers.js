'use strict';

const cds = require('@sap/cds');
const { randomUUID } = require('crypto');

/**
 * Persist (or update) a set of warnings for one (entity_type, entity_id) target.
 * Existing unresolved warnings for the same code+field are reused; obsolete ones
 * are marked resolved so the warnings list always reflects the latest state.
 */
async function persistWarnings(entityType, entityId, warnings) {
  const { ValidationWarnings } = cds.entities('dpp');
  const now = new Date().toISOString();

  const existing = await SELECT.from(ValidationWarnings)
    .where({ entity_type: entityType, entity_id: entityId, resolved: false });
  const keyOf = (w) => `${w.warning_code}::${w.field_name || ''}`;
  const existingMap = new Map(existing.map((w) => [keyOf(w), w]));

  const seen = new Set();
  for (const w of warnings) {
    const k = keyOf(w);
    seen.add(k);
    if (existingMap.has(k)) {
      await UPDATE(ValidationWarnings)
        .set({ severity: w.severity, message: w.message, detected_at: now })
        .where({ ID: existingMap.get(k).ID });
    } else {
      await INSERT.into(ValidationWarnings).entries({
        ID: randomUUID(),
        entity_type: entityType,
        entity_id: entityId,
        warning_code: w.warning_code,
        severity: w.severity,
        field_name: w.field_name,
        message: w.message,
        detected_at: now,
        resolved: false
      });
    }
  }

  for (const [k, w] of existingMap) {
    if (!seen.has(k)) {
      await UPDATE(ValidationWarnings)
        .set({ resolved: true, resolved_at: now })
        .where({ ID: w.ID });
    }
  }
}

/**
 * Product-level validation rules (US10.1/10.2/10.7).
 */
async function validateProduct(product) {
  const warnings = [];
  const required = ['name', 'brand', 'category', 'fibre_composition'];
  for (const f of required) {
    if (!product[f]) {
      warnings.push({
        warning_code: 'missing_field',
        severity: 'blocking',
        field_name: f,
        message: `Required field '${f}' is missing on product.`
      });
    }
  }
  if (!product.care_instructions) {
    warnings.push({
      warning_code: 'missing_field',
      severity: 'warning',
      field_name: 'care_instructions',
      message: 'Care instructions are recommended for textile products.'
    });
  }
  await persistWarnings('Product', product.ID, warnings);
  return warnings.filter((w) => w.severity === 'blocking');
}

/**
 * DPP-level validation: walks Product → Variant → Batch → Item linkage,
 * checks compliance and certificate expiry. Returns the list of error-severity
 * warnings (publication-blocking).
 */
async function validateDPP(dpp) {
  const {
    Products, ProductItems, Batches, ProductVariants, Certifications
  } = cds.entities('dpp');

  const warnings = [];

  if (!dpp.product_ID) {
    warnings.push({
      warning_code: 'missing_field',
      severity: 'blocking',
      field_name: 'product',
      message: 'DPP must reference a product.'
    });
  }

  const product = dpp.product_ID
    ? await SELECT.one.from(Products).where({ ID: dpp.product_ID })
    : null;
  if (product) {
    const productErrors = await validateProduct(product);
    for (const e of productErrors) {
      warnings.push({
        ...e,
        warning_code: 'product_' + e.warning_code,
        message: `Linked product: ${e.message}`
      });
    }
  }

  if (dpp.granularity === 'item' && !dpp.item_ID) {
    warnings.push({
      warning_code: 'missing_field',
      severity: 'blocking',
      field_name: 'item',
      message: 'Item-level DPP requires a linked ProductItem.'
    });
  }

  if (dpp.item_ID) {
    const item = await SELECT.one.from(ProductItems).where({ ID: dpp.item_ID });
    if (!item) {
      warnings.push({
        warning_code: 'invalid_reference',
        severity: 'blocking',
        field_name: 'item',
        message: `Referenced ProductItem '${dpp.item_ID}' does not exist.`
      });
    } else {
      if (!item.upi) {
        warnings.push({
          warning_code: 'missing_field',
          severity: 'blocking',
          field_name: 'item.upi',
          message: 'ProductItem must have a Unique Product Identity (UPI).'
        });
      }
      const batch = await SELECT.one.from(Batches).where({ ID: item.batch_ID });
      const variant = batch
        ? await SELECT.one.from(ProductVariants).where({ ID: batch.variant_ID })
        : null;
      if (!batch || !variant) {
        warnings.push({
          warning_code: 'broken_hierarchy',
          severity: 'blocking',
          field_name: 'hierarchy',
          message: 'Item is not linked to a valid Batch/Variant chain.'
        });
      }
    }
  }

  if (dpp.product_ID) {
    const certs = await SELECT.from(Certifications).where({ product_ID: dpp.product_ID });
    const today = new Date();
    const soon = new Date(today.getTime() + 30 * 24 * 3600 * 1000);
    for (const c of certs) {
      if (c.valid_until) {
        const validUntil = new Date(c.valid_until);
        if (validUntil < today) {
          warnings.push({
            warning_code: 'expired_cert',
            severity: 'blocking',
            field_name: c.standard || c.certificate_number,
            message: `Certificate '${c.certificate_number}' expired on ${c.valid_until}.`
          });
        } else if (validUntil < soon) {
          warnings.push({
            warning_code: 'expiring_cert',
            severity: 'warning',
            field_name: c.standard || c.certificate_number,
            message: `Certificate '${c.certificate_number}' expires on ${c.valid_until}.`
          });
        }
      }
    }
  }

  await persistWarnings('DPP', dpp.ID, warnings);
  return warnings.filter((w) => w.severity === 'blocking');
}

module.exports = (srv) => {
  const { Products, Certifications } = srv.entities;

  srv.after(['CREATE', 'UPDATE'], Products, async (product) => {
    if (product && product.ID) await validateProduct(product);
  });

  srv.after(['CREATE', 'UPDATE'], Certifications, async (cert) => {
    if (!cert || !cert.product_ID) return;
    const { Products: ProductsDB, DPPs } = cds.entities('dpp');
    const product = await SELECT.one.from(ProductsDB).where({ ID: cert.product_ID });
    if (product) await validateProduct(product);
    const dpps = await SELECT.from(DPPs).where({ product_ID: cert.product_ID });
    for (const dpp of dpps) await validateDPP(dpp);
  });
};

module.exports.validateProduct = validateProduct;
module.exports.validateDPP = validateDPP;
module.exports.persistWarnings = persistWarnings;
