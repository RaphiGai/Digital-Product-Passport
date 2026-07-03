'use strict';

// fieldCatalogue(category) — the merged per-category attribute catalogue served
// to the frontend (Epic 12). Covers: CSV seeds deploy into the config entities,
// core ∪ category merge, default-category fallback, auth gating, and the
// read-only nature of the config entity sets.

const cds = require('@sap/cds');

const { GET, POST } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // advanced
const carol = { auth: { username: 'carol.user', password: 'x' } };     // read-only

const fetchCatalogue = async (user, category) => {
  const q = category == null ? '' : `?category=${encodeURIComponent(category)}`;
  const r = await GET(`/odata/v4/dpp/fieldCatalogue(category=${category == null ? 'null' : `'${category}'`})${q ? '' : ''}`, user);
  return JSON.parse(r.data.value ?? r.data);
};

const expectStatus = async (promise, status) => {
  try { await promise; throw new Error(`Expected ${status}, but it succeeded.`); }
  catch (err) { expect(err.response?.status || err.status || err.code).toBe(status); }
};

describe('fieldCatalogue — merged per-category catalogue', () => {
  test('serves the textiles catalogue: core ∪ textiles fields with sections', async () => {
    const cat = await fetchCatalogue(alice, 'textiles');
    expect(cat.category).toBe('textiles');

    const keys = cat.fields.filter((f) => f.level === 'product').map((f) => f.key);
    // core field + textile field side by side
    expect(keys).toEqual(expect.arrayContaining(['name', 'brand', 'category', 'fibre_composition', 'care_instructions']));

    const fibre = cat.fields.find((f) => f.key === 'fibre_composition');
    expect(fibre.mandatory).toBe(true);
    expect(fibre.locked).toBe(true);
    expect(fibre.visibility).toBe('public');
    expect(fibre.storage).toBe('column');

    const gtin = cat.fields.find((f) => f.key === 'gtin' && f.level === 'product');
    expect(gtin.visibility).toBe('internal');
    expect(gtin.locked).toBe(false);

    const sectionKeys = cat.sections.map((s) => s.key);
    expect(sectionKeys).toEqual(expect.arrayContaining(['basic', 'materials', 'care', 'production', 'sustainability']));
  });

  test('unknown or missing category falls back to the default (textiles) — preserves legacy behavior', async () => {
    const unknown = await fetchCatalogue(alice, 'no-such-category');
    expect(unknown.category).toBe('textiles');
    const none = await fetchCatalogue(alice, null);
    expect(none.category).toBe('textiles');
  });

  test('readable by read-only company_user (not a write event)', async () => {
    const cat = await fetchCatalogue(carol, 'textiles');
    expect(cat.fields.length).toBeGreaterThan(20);
  });

  test('rejects unauthenticated access', async () => {
    await expectStatus(GET(`/odata/v4/dpp/fieldCatalogue(category='textiles')`), 401);
  });

  test('config entities are exposed read-only: writes are rejected', async () => {
    await expectStatus(POST('/odata/v4/dpp/AttributeDefinitions', {
      ID: 'attr-hack', level: 'product', key: 'hack', label: 'Hack', datatype: 'string'
    }, alice), 405);
  });

  test('batch mandatory trio is present (pins the Demo-branch validation update)', async () => {
    const cat = await fetchCatalogue(alice, 'textiles');
    const batchMandatory = cat.fields.filter((f) => f.level === 'batch' && f.mandatory).map((f) => f.key).sort();
    expect(batchMandatory).toEqual(['batch_number', 'country_of_origin', 'production_date']);
  });
});
