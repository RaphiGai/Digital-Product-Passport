'use strict';

/**
 * Controlled vocabulary for ProductVariant.size, used to validate bulk imports.
 *
 * KEEP IN SYNC with the frontend catalogue (dpp_frontend/app/src/lib/sizeCatalogue.js),
 * which drives the size dropdown in the UI. Same list, same canonical labels.
 *
 * The canonical stored value is the full label (e.g. "Women 34 · XS · UK 6 · US 2").
 * Imports may type either that full label OR the short leading key ("Women 34"),
 * case-insensitively; resolveSize() maps both to the canonical label.
 */
const SIZE_GROUPS = [
  {
    label: 'Women',
    sizes: [
      'Women 34 · XS · UK 6 · US 2',
      'Women 36 · S · UK 8 · US 4',
      'Women 38 · M · UK 10 · US 6',
      'Women 40 · M · UK 12 · US 8',
      'Women 42 · L · UK 14 · US 10',
      'Women 44 · XL · UK 16 · US 12',
      'Women 46 · XXL · UK 18 · US 14',
    ],
  },
  {
    label: 'Men',
    sizes: [
      'Men 44 · XS · UK 34 · US 34',
      'Men 46 · S · UK 36 · US 36',
      'Men 48 · M · UK 38 · US 38',
      'Men 50 · M · UK 40 · US 40',
      'Men 52 · L · UK 42 · US 42',
      'Men 54 · XL · UK 44 · US 44',
      'Men 56 · XXL · UK 46 · US 46',
    ],
  },
  {
    label: 'One size',
    sizes: ['One size'],
  },
];

// Lookup from a normalized key (full label OR short leading key like "women 34") → canonical.
const BY_KEY = new Map();
for (const group of SIZE_GROUPS) {
  for (const size of group.sizes) {
    BY_KEY.set(size.toLowerCase(), size);
    BY_KEY.set(size.split(' · ')[0].toLowerCase(), size);
  }
}

/**
 * Map a user-typed size to its canonical stored label, case-insensitively.
 * Accepts the full label ("Women 34 · XS · UK 6 · US 2") or the short key ("Women 34").
 * @param {string} input
 * @returns {string|null} canonical label, or null when it matches no known size.
 */
function resolveSize(input) {
  if (input == null) return null;
  return BY_KEY.get(String(input).trim().toLowerCase()) ?? null;
}

module.exports = { SIZE_GROUPS, resolveSize };
