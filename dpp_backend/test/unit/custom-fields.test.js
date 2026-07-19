'use strict';

const {
  normalizeCustomFields, publicCustomFields, customFieldsHashMap, isReservedLabel
} = require('../../srv/lib/custom-fields');
const { contentHash, diffNormalized } = require('../../srv/lib/snapshot-hash');

describe('custom-fields — normalizeCustomFields', () => {
  test('null / empty input canonicalizes to null', () => {
    expect(normalizeCustomFields(null)).toEqual({ ok: true, json: null });
    expect(normalizeCustomFields('')).toEqual({ ok: true, json: null });
    expect(normalizeCustomFields('[]')).toEqual({ ok: true, json: null });
    expect(normalizeCustomFields(JSON.stringify([{ label: ' ', value: '' }]))).toEqual({ ok: true, json: null });
  });

  test('valid entries are trimmed and visibility defaults to internal', () => {
    const res = normalizeCustomFields(JSON.stringify([
      { label: ' Water consumption ', value: ' 2700 l/kg ', visibility: 'public' },
      { label: 'Certifier', value: 'TÜV' }
    ]));
    expect(res.ok).toBe(true);
    expect(JSON.parse(res.json)).toEqual([
      { label: 'Water consumption', value: '2700 l/kg', visibility: 'public' },
      { label: 'Certifier', value: 'TÜV', visibility: 'internal' }
    ]);
  });

  test('malformed JSON and non-array shapes are rejected', () => {
    expect(normalizeCustomFields('not json').ok).toBe(false);
    expect(normalizeCustomFields('{"a":1}').ok).toBe(false);
    expect(normalizeCustomFields('["x"]').ok).toBe(false);
    expect(normalizeCustomFields(42).ok).toBe(false);
  });

  test('a value without a name is rejected', () => {
    const res = normalizeCustomFields(JSON.stringify([{ label: '', value: 'orphan' }]));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/needs a name/);
  });

  test('reserved names (hash-stripped keys) are rejected', () => {
    for (const label of ['status', 'id', 'ID', 'batch_ID', 'createdAt']) {
      const res = normalizeCustomFields(JSON.stringify([{ label, value: 'x' }]));
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/cannot be used as a field name/);
    }
    // Different case is a different key for the hash stripper — allowed.
    expect(normalizeCustomFields(JSON.stringify([{ label: 'Status', value: 'x' }])).ok).toBe(true);
  });

  test('duplicate names are rejected case-insensitively', () => {
    const res = normalizeCustomFields(JSON.stringify([
      { label: 'Farbe', value: 'a' },
      { label: 'farbe', value: 'b' }
    ]));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/same name/);
  });

  test('length limits and invalid visibility are rejected', () => {
    expect(normalizeCustomFields(JSON.stringify([{ label: 'x'.repeat(61), value: 'v' }])).ok).toBe(false);
    expect(normalizeCustomFields(JSON.stringify([{ label: 'ok', value: 'v'.repeat(501) }])).ok).toBe(false);
    expect(normalizeCustomFields(JSON.stringify([{ label: 'ok', value: 'v', visibility: 'secret' }])).ok).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => ({ label: `f${i}`, value: 'v' }));
    expect(normalizeCustomFields(JSON.stringify(many)).ok).toBe(false);
  });

  test('isReservedLabel flags _ID suffixes', () => {
    expect(isReservedLabel('supplier_ID')).toBe(true);
    expect(isReservedLabel('Supplier')).toBe(false);
  });
});

describe('custom-fields — publicCustomFields (consumer filter)', () => {
  test('only public entries with a non-empty value reach the consumer, without the flag', () => {
    const stored = JSON.stringify([
      { label: 'Water', value: '2700 l', visibility: 'public' },
      { label: 'Secret', value: 'intern', visibility: 'internal' },
      { label: 'Empty', value: '  ', visibility: 'public' }
    ]);
    expect(publicCustomFields(stored)).toEqual([{ label: 'Water', value: '2700 l' }]);
  });

  test('null / malformed input yields an empty list', () => {
    expect(publicCustomFields(null)).toEqual([]);
    expect(publicCustomFields('broken')).toEqual([]);
  });
});

// ── Drift-hash semantics: what must and must not change the content hash ──────

const baseSnap = (productExtra) => ({
  captured_at: '2026-07-01T00:00:00Z',
  dpp: { id: 'd1', status: 'approved', version: 1 },
  product: { name: 'Shirt', field_visibility: null, ...productExtra },
  variant: null,
  batch: null
});

describe('custom-fields — content hash integration', () => {
  test('absent, null and empty custom_fields hash identically (no drift for legacy baselines)', () => {
    const legacy = contentHash(baseSnap(undefined));
    expect(contentHash(baseSnap({ custom_fields: null }))).toBe(legacy);
    expect(contentHash(baseSnap({ custom_fields: '[]' }))).toBe(legacy);
  });

  test('value and visibility changes each change the hash; row order does not', () => {
    const h = (cf) => contentHash(baseSnap({ custom_fields: JSON.stringify(cf) }));
    const a = h([{ label: 'Water', value: '2700', visibility: 'public' }, { label: 'Cert', value: 'GOTS', visibility: 'internal' }]);
    expect(h([{ label: 'Water', value: '2701', visibility: 'public' }, { label: 'Cert', value: 'GOTS', visibility: 'internal' }])).not.toBe(a);
    expect(h([{ label: 'Water', value: '2700', visibility: 'internal' }, { label: 'Cert', value: 'GOTS', visibility: 'internal' }])).not.toBe(a);
    // Same content, different order → same hash (object keyed by label, sorted keys).
    expect(h([{ label: 'Cert', value: 'GOTS', visibility: 'internal' }, { label: 'Water', value: '2700', visibility: 'public' }])).toBe(a);
  });

  test('diff yields one readable entry per changed field', () => {
    const prev = baseSnap({ custom_fields: JSON.stringify([{ label: 'Water', value: '2700', visibility: 'public' }]) });
    const cur = baseSnap({ custom_fields: JSON.stringify([
      { label: 'Water', value: '2800', visibility: 'public' },
      { label: 'Cert', value: 'GOTS', visibility: 'internal' }
    ]) });
    const diff = diffNormalized(prev, cur);
    const paths = Object.fromEntries(diff.map((d) => [d.path, d]));
    expect(paths['product.custom_fields.Water']).toMatchObject({ label: 'Additional field · Water' });
    expect(paths['product.custom_fields.Water'].old).toContain('2700');
    expect(paths['product.custom_fields.Water'].new).toContain('2800');
    expect(paths['product.custom_fields.Cert']).toMatchObject({ old: '—' });
  });

  test('customFieldsHashMap encodes value + visibility and is null when empty', () => {
    expect(customFieldsHashMap(null)).toBeNull();
    expect(customFieldsHashMap('[]')).toBeNull();
    expect(customFieldsHashMap(JSON.stringify([{ label: 'Water', value: '2700', visibility: 'public' }])))
      .toEqual({ Water: '2700 · public' });
  });
});
