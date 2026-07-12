/**
 * Controlled vocabulary for ProductVariant.size — replaces the old free-text size box.
 *
 * Each option is one garment size with its regional labels on a single line; the whole
 * label string is what gets stored in ProductVariant.size (widened to String(40) in
 * dpp_capgemini/db/product.cds). This is deliberately NOT a conversion engine — it is a
 * curated, indicative equivalence table for women's / men's apparel tops. Real
 * conversions wobble by brand and garment, so treat the cross-region labels as a guide.
 *
 * To extend (kids', shoes, jeans-by-waist, extra regions): add a group below — no code
 * or schema change is needed, as long as each label stays ≤ 40 characters.
 */
export const SIZE_GROUPS = [
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

/** Flat set of every valid size label — handy for validating imports against the list. */
export const VALID_SIZES = new Set(SIZE_GROUPS.flatMap((g) => g.sizes));
