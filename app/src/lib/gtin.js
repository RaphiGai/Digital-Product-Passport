/**
 * GTIN validation shared by the product & variant forms.
 *
 * A GTIN is optional; when present it must be digits only and a standard GTIN length:
 * GTIN-8, GTIN-12 (UPC-A), GTIN-13 (EAN-13) or GTIN-14. No check-digit (mod-10)
 * validation yet — length + digits only.
 *
 * KEEP IN SYNC with the backend: dpp_capgemini/srv/lib/gtin-validate.js
 */
export const GTIN_LENGTHS = [8, 12, 13, 14];

/** Short guidance string shown as the field hint when the value is valid/empty. */
export const GTIN_HINT = 'Digits only — 8, 12, 13 or 14 digits (GTIN-8/UPC/EAN/GTIN-14).';

/**
 * Validate a GTIN value.
 * @param {string} value
 * @returns {string|null} a user-facing error message, or null when valid (or empty).
 */
export function validateGtin(value) {
  const v = (value ?? '').trim();
  if (!v) return null; // optional
  if (!/^\d+$/.test(v)) return 'GTIN must contain digits only.';
  if (!GTIN_LENGTHS.includes(v.length)) return 'GTIN must be 8, 12, 13 or 14 digits.';
  return null;
}
