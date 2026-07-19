'use strict';

/**
 * GTIN validation for the bulk importer — mirrors the UI rule so both paths agree.
 *
 * A GTIN is optional; when present it must be digits only and a standard GTIN length:
 * GTIN-8, GTIN-12 (UPC-A), GTIN-13 (EAN-13) or GTIN-14. No check-digit (mod-10)
 * validation yet — length + digits only. Uniqueness is enforced separately by the
 * @assert.unique on Products (db/product.cds).
 *
 * KEEP IN SYNC with the frontend: dpp_frontend/app/src/lib/gtin.js
 */
const GTIN_LENGTHS = [8, 12, 13, 14];

/**
 * @param {*} value
 * @returns {string|null} an error message, or null when valid (or empty).
 */
function validateGtin(value) {
  const v = value == null ? '' : String(value).trim();
  if (!v) return null; // optional
  if (!/^\d+$/.test(v)) return 'GTIN must contain digits only.';
  if (!GTIN_LENGTHS.includes(v.length)) return 'GTIN must be 8, 12, 13 or 14 digits.';
  return null;
}

module.exports = { GTIN_LENGTHS, validateGtin };
