'use strict';

/**
 * Catalogue parity — proves the AttributeDefinitions seed data reproduces the
 * (still) hardcoded catalogues EXACTLY, before any code path is switched over:
 *
 *   1. srv/lib/field-visibility.js#CATALOGUES  (visibility defaults + locked set)
 *   2. srv/lib/mandatory-fields.js#MANDATORY   (approve/publish field-presence gate)
 *   3. srv/lib/dpp-validation.js FIELD_META    (readiness sections + fix hints)
 *
 * This is the safety net of Epic 12: if a seed row is missing or wrong, the
 * later catalogue-driven code would change behavior — most dangerously the
 * "unknown field ⇒ public" visibility default could LEAK an internal field
 * (e.g. gtin) to the consumer passport. Parses the seed CSVs directly (no DB).
 *
 * Key mapping: the catalogue models the category association as ONE field with
 * key `category`; the raw Products row carries the FK `category_code`, which is
 * what MANDATORY/FIELD_META reference (see catalogue.js#getAttrValue fallback).
 */

const fs = require('fs');
const path = require('path');

const { CATALOGUES } = require('../../srv/lib/field-visibility');
const { MANDATORY } = require('../../srv/lib/mandatory-fields');

const DATA_DIR = path.join(__dirname, '..', '..', 'db', 'data');

// FIELD_META is not exported from dpp-validation.js — read the expected values
// from the same sources it was built from (kept literal here on purpose: this
// test pins the CURRENT behavior, so the expectations must not be computed).
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

function parseCsv(file) {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split(';');
  return lines.slice(1).map((line) => {
    const cells = line.split(';');
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

const defs = parseCsv('dpp-AttributeDefinitions.csv');
const sections = parseCsv('dpp-AttributeSections.csv');

// The catalogue for the (only) seeded category = core rows ∪ textiles rows —
// what srv/lib/catalogue.js#loadCatalogue('textiles') will serve.
const textiles = defs.filter((d) => d.category_code === '' || d.category_code === 'textiles');
const byLevel = (level) => textiles.filter((d) => d.level === level);

// Map catalogue key → the key MANDATORY/FIELD_META use on the raw row.
const rawKey = (def) => (def.key === 'category' ? 'category_code' : def.key);

describe('catalogue seeds — key hygiene', () => {
  test('every key matches the allowed pattern and avoids stripDeep collisions', () => {
    // `status` is allowed ONLY as a column-backed core field (it exists as a real
    // column and is deliberately excluded from the drift hash); the reserved-key
    // rule guards the JSON bag, where such a key would silently vanish from hashes.
    for (const d of defs) {
      expect(d.key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(d.key.endsWith('_id')).toBe(false);
      if (d.storage !== 'column') {
        expect(['status', 'id', 'attributes', 'field_visibility']).not.toContain(d.key);
      }
    }
  });

  test('every definition references an existing section of a compatible category', () => {
    const sectionById = Object.fromEntries(sections.map((s) => [s.ID, s]));
    for (const d of defs) {
      const s = sectionById[d.section_ID];
      expect(s).toBeDefined();
      // core field (no category) must not sit in a category-scoped section
      if (d.category_code === '') expect(s.category_code).toBe('');
    }
  });

  test('definitions are unique per (category, level, key)', () => {
    const seen = new Set();
    for (const d of defs) {
      const k = `${d.category_code}|${d.level}|${d.key}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
});

describe('parity with field-visibility.js#CATALOGUES', () => {
  const KIND_LEVEL = { product: 'product', variant: 'variant', batch: 'batch' };

  for (const [kind, level] of Object.entries(KIND_LEVEL)) {
    test(`${kind}: every hardcoded entry has a seed twin with identical visibility + locked`, () => {
      const seedByKey = Object.fromEntries(byLevel(level).map((d) => [d.key, d]));
      for (const [key, def] of Object.entries(CATALOGUES[kind])) {
        const seed = seedByKey[key];
        expect(seed).toBeDefined();
        expect(`${kind}.${key}:${seed.default_visibility}`).toBe(`${kind}.${key}:${def.vis}`);
        expect(`${kind}.${key}:${seed.locked_public}`).toBe(`${kind}.${key}:${String(def.locked)}`);
      }
    });

    test(`${kind}: no seed field is public/locked beyond the hardcoded catalogue (leak guard)`, () => {
      const hardcoded = new Set(Object.keys(CATALOGUES[kind]));
      // storytelling & co. ARE in CATALOGUES; the only seed extras are internal-only
      // bookkeeping fields that never appear in a consumer DTO section.
      for (const d of byLevel(level)) {
        if (hardcoded.has(d.key)) continue;
        expect(`${kind}.${d.key}:${d.default_visibility}`).toBe(`${kind}.${d.key}:internal`);
        expect(`${kind}.${d.key}:${d.locked_public}`).toBe(`${kind}.${d.key}:false`);
      }
    });
  }
});

describe('parity with mandatory-fields.js#MANDATORY', () => {
  test('product: identical mandatory key set and labels', () => {
    const seedMandatory = byLevel('product').filter((d) => d.mandatory === 'true');
    const seedKeys = seedMandatory.map(rawKey).sort();
    const beKeys = MANDATORY.product.map((f) => f.key).sort();
    expect(seedKeys).toEqual(beKeys);

    const labelByKey = Object.fromEntries(seedMandatory.map((d) => [rawKey(d), d.label]));
    for (const f of MANDATORY.product) {
      expect(`${f.key}:${labelByKey[f.key]}`).toBe(`${f.key}:${f.label}`);
    }
  });

  test('batch: identical mandatory key set and labels', () => {
    const seedMandatory = byLevel('batch').filter((d) => d.mandatory === 'true');
    const seedKeys = seedMandatory.map(rawKey).sort();
    const beKeys = MANDATORY.batch.map((f) => f.key).sort();
    expect(seedKeys).toEqual(beKeys);

    const labelByKey = Object.fromEntries(seedMandatory.map((d) => [rawKey(d), d.label]));
    for (const f of MANDATORY.batch) {
      expect(`${f.key}:${labelByKey[f.key]}`).toBe(`${f.key}:${f.label}`);
    }
  });

  test('variant: no mandatory fields (unchanged behavior)', () => {
    expect(byLevel('variant').filter((d) => d.mandatory === 'true')).toEqual([]);
  });
});

describe('parity with dpp-validation.js FIELD_META (fix hints + report sections)', () => {
  for (const scope of ['product', 'batch']) {
    test(`${scope}: fix_hint and validation_section match for every mandatory field`, () => {
      const seedByRawKey = Object.fromEntries(byLevel(scope).map((d) => [rawKey(d), d]));
      for (const [key, meta] of Object.entries(FIELD_META[scope])) {
        const seed = seedByRawKey[key];
        expect(seed).toBeDefined();
        expect(`${key}:${seed.fix_hint}`).toBe(`${key}:${meta.fixHint}`);
        expect(`${key}:${seed.validation_section}`).toBe(`${key}:${meta.section}`);
      }
    });
  }

  test('reuse_instructions keeps its optional readiness check metadata', () => {
    const seed = byLevel('product').find((d) => d.key === 'reuse_instructions');
    expect(seed.mandatory).toBe('false');
    expect(seed.fix_hint).toBe('Add reuse or second-life information.');
    expect(seed.validation_section).toBe('Circularity');
  });
});
