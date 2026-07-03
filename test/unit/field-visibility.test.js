'use strict';

// Per-field visibility resolution (stored override → catalogue default,
// locked → always public). Since Epic 12 the defaults come from the attribute
// catalogue — these tests run against the REAL seed definitions (fixture parses
// db/data CSVs), which the catalogue-parity test pins against the legacy
// hardcoded CATALOGUES. Semantics asserted here are unchanged.

const { applyFieldVisibility, resolve } = require('../../srv/lib/field-visibility');
const { catalogueFixture } = require('../helpers/catalogue-fixture');

const defs = catalogueFixture().byLevel;

describe('field-visibility — catalogue defaults', () => {
  test('internal-default fields are dropped, public-default kept (no stored map)', () => {
    const out = applyFieldVisibility({ color: 'Blue', sku: 'X', gtin: 'Y' }, defs.variant, null);
    expect(out.color).toBe('Blue');
    expect(out).not.toHaveProperty('sku');
    expect(out).not.toHaveProperty('gtin');
  });
});

describe('field-visibility — stored overrides', () => {
  test('a public field set internal is removed; an internal field set public is kept', () => {
    const map = JSON.stringify({ color: 'internal', sku: 'public' });
    const out = applyFieldVisibility({ color: 'Blue', size: 'M', sku: 'X' }, defs.variant, map);
    expect(out).not.toHaveProperty('color');
    expect(out.size).toBe('M');
    expect(out.sku).toBe('X');
  });
});

describe('field-visibility — regulatory lock', () => {
  test('locked fields are never hidden, even when the map says internal', () => {
    const map = JSON.stringify({ name: 'internal', country_of_origin: 'internal', model: 'internal' });
    const out = applyFieldVisibility(
      { name: 'Tee', country_of_origin: 'PT', model: 'M1' },
      defs.product,
      map
    );
    expect(out.name).toBe('Tee');
    expect(out.country_of_origin).toBe('PT');
    expect(out).not.toHaveProperty('model'); // not locked → honoured
  });

  test('resolve() forces locked fields to public', () => {
    expect(resolve(defs.product, 'fibre_composition', { fibre_composition: 'internal' })).toBe('public');
    expect(resolve(defs.batch, 'country_of_origin', { country_of_origin: 'internal' })).toBe('public');
  });
});

describe('field-visibility — robustness', () => {
  test('unknown fields are never silently hidden', () => {
    const out = applyFieldVisibility({ weird: 1 }, defs.product, JSON.stringify({ weird: 'internal' }));
    expect(out.weird).toBe(1);
  });

  test('malformed stored JSON falls back to catalogue defaults', () => {
    const out = applyFieldVisibility({ batch_number: 'B1', co2_footprint_kg: 1 }, defs.batch, '{not json');
    expect(out).not.toHaveProperty('batch_number'); // default internal
    expect(out.co2_footprint_kg).toBe(1); // default public
  });

  test('null section is returned unchanged', () => {
    expect(applyFieldVisibility(null, defs.product, null)).toBeNull();
  });
});
