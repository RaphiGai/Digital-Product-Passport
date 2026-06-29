'use strict';

// Pure-logic units behind the versioning rework: the normalized drift hash + diff
// (srv/lib/snapshot-hash.js) and the mandatory-field gate (srv/lib/mandatory-fields.js).

const { contentHash, diffNormalized, stableStringify } = require('../../srv/lib/snapshot-hash');
const { missingMandatory } = require('../../srv/lib/mandatory-fields');

const baseSnap = () => ({
  captured_at: '2026-01-01T00:00:00Z',
  dpp: { id: 'd1', dpp_type: 'item', status: 'published', visibility: 'public', version: 3, valid_from: '2026-01-01' },
  product: { ID: 'p1', name: 'Tee', model: 'M1', createdAt: '2025-01-01T00:00:00Z', changedBy_ID: 'u1', status: 'published' },
  batch: { ID: 'b1', co2_footprint_kg: '2.4', factory: { ID: 'f1', name: 'ACME' } },
  bom: [{ ID: 'e1', component_ID: 'c1', quantity: 5 }],
  documents: [{ id: 'doc1', title: 'Cert', visibility: 'public' }],
  marketing_links: []
});

describe('snapshot-hash — drift hashing', () => {
  test('ignores volatile / audit / surrogate / lifecycle-status fields', () => {
    const a = baseSnap();
    const b = baseSnap();
    // Mutate only fields that must NOT affect the content hash.
    b.captured_at = '2099-12-31T23:59:59Z';
    b.dpp.version = 99;
    b.dpp.status = 'draft';
    b.dpp.visibility = 'internal';
    b.product.createdAt = '2000-01-01T00:00:00Z';
    b.product.changedBy_ID = 'someone-else';
    b.product.status = 'archived';
    expect(contentHash(a)).toBe(contentHash(b));
  });

  test('changes when a real content field changes', () => {
    const a = baseSnap();
    const b = baseSnap();
    b.product.model = 'M2';
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  test('is order-independent (stable key sorting)', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });

  test('diffNormalized reports the changed field with a friendly label', () => {
    const a = baseSnap();
    const b = baseSnap();
    b.product.model = 'M2';
    const diff = diffNormalized(a, b);
    const entry = diff.find((d) => d.path === 'product.model');
    expect(entry).toBeTruthy();
    expect(entry.old).toBe('M1');
    expect(entry.new).toBe('M2');
  });
});

describe('mandatory-fields — approve gate', () => {
  const fullProduct = {
    product_type: 'finished', name: 'Tee', brand: 'Greenline', category_code: 'tops',
    fibre_composition: '100% Cotton', care_instructions: 'Wash 30', repair_instructions: 'Sew',
    disposal_instructions: 'Recycle', country_of_origin: 'PT', substances_of_concern: 'None',
    espr_compliance: 'compliant'
  };

  test('a fully-populated product (no batch) has no missing fields', () => {
    expect(missingMandatory(fullProduct, null)).toEqual([]);
  });

  test('lists every missing product field by friendly label', () => {
    const p = { ...fullProduct, care_instructions: '', repair_instructions: null };
    const labels = missingMandatory(p, null).map((m) => m.label);
    expect(labels).toContain('Care instructions');
    expect(labels).toContain('Repair instructions');
    expect(labels).not.toContain('Name');
  });

  test('a referenced batch must carry country_of_origin', () => {
    const labels = missingMandatory(fullProduct, { country_of_origin: '' }).map((m) => m.label);
    expect(labels).toContain('Batch country of origin');
  });

  test('espr_compliance default "draft" counts as present (presence check only)', () => {
    expect(missingMandatory({ ...fullProduct, espr_compliance: 'draft' }, null)).toEqual([]);
  });

  test('a missing product is reported', () => {
    expect(missingMandatory(null, null).length).toBeGreaterThan(0);
  });
});
