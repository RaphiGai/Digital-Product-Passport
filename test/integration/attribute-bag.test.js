'use strict';

// Epic 12 — the `attributes` bag after the FULL migration (textile fields are
// bag-backed):
//  - writes validate against the category catalogue (unknown key → clean 400),
//  - the consumer DTO serves category fields via self-describing attribute_sections,
//  - regulatory-locked fields cannot be hidden from the sections,
//  - editing a bag value drifts a published DPP back to draft (end-to-end).

const cds = require('@sap/cds');
const tokens = require('../../srv/lib/token');

const { POST, PATCH, axios } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } };

async function attachToken(dppId) {
  const { DPPs } = cds.entities('dpp');
  const token = tokens.generate();
  await UPDATE(DPPs).set({ qr_token: token }).where({ ID: dppId });
  return token;
}

const getPublic = (token) => axios.get(`/public/dpp/${token}`, { validateStatus: () => true });

const sectionField = (dto, key) => {
  for (const s of dto.attribute_sections || []) {
    const f = s.fields.find((x) => x.key === key);
    if (f) return f;
  }
  return undefined;
};

const expectStatus = async (promise, status) => {
  try { await promise; throw new Error(`Expected ${status}, but it succeeded.`); }
  catch (err) { expect(err.response?.status || err.status || err.code).toBe(status); }
};

describe('attribute_sections — self-describing consumer sections', () => {
  test('bag-backed textile fields surface in their sections with rendering hints', async () => {
    const token = await attachToken('dpp-12345');
    const res = await getPublic(token);
    expect(res.status).toBe(200);
    const dto = res.data;

    const { Products } = cds.entities('dpp');
    const row = await SELECT.one.from(Products).columns('attributes').where({ ID: 'prod-tshirt-classic' });
    const bag = JSON.parse(row.attributes);

    const materials = dto.attribute_sections.find((s) => s.key === 'materials');
    expect(materials).toBeDefined();
    expect(materials.title).toBe('Material & composition');
    const fibre = materials.fields.find((f) => f.key === 'fibre_composition');
    expect(fibre).toBeDefined();
    expect(fibre.label).toBe('Fibre composition');
    expect(fibre.value).toBe(bag.fibre_composition);

    const care = sectionField(dto, 'care_instructions');
    expect(care).toBeDefined();
    expect(care.grp).toBe('care');

    // core fields never appear in attribute_sections (they live in the fixed blocks)
    const allKeys = dto.attribute_sections.flatMap((s) => s.fields.map((f) => f.key));
    expect(allKeys).not.toContain('name');
    expect(allKeys).not.toContain('substances_of_concern');
    expect(allKeys).not.toContain('country_of_origin');

    // the hero contract survives the migration: colour/size stay in the variant block
    expect(dto.variant.color).toBe('Blue');
    expect(dto.variant.size).toBe('M');
  });

  test('locked fields stay in the sections even when a stored override says internal', async () => {
    const { Products } = cds.entities('dpp');
    await UPDATE(Products)
      .set({ field_visibility: JSON.stringify({ fibre_composition: 'internal', care_instructions: 'internal' }) })
      .where({ ID: 'prod-tshirt-classic' });

    const dto = (await getPublic(await attachToken('dpp-12345'))).data;
    expect(sectionField(dto, 'fibre_composition')).toBeDefined(); // locked → never hidden
    expect(sectionField(dto, 'care_instructions')).toBeDefined(); // locked → never hidden

    await UPDATE(Products).set({ field_visibility: null }).where({ ID: 'prod-tshirt-classic' });
  });

  test('non-locked fields respect an internal override in the sections', async () => {
    const { Products } = cds.entities('dpp');
    await UPDATE(Products)
      .set({ field_visibility: JSON.stringify({ reuse_instructions: 'internal' }) })
      .where({ ID: 'prod-tshirt-classic' });

    const dto = (await getPublic(await attachToken('dpp-12345'))).data;
    expect(sectionField(dto, 'reuse_instructions')).toBeUndefined();
    expect(sectionField(dto, 'disposal_instructions')).toBeDefined(); // locked sibling stays

    await UPDATE(Products).set({ field_visibility: null }).where({ ID: 'prod-tshirt-classic' });
  });
});

describe('attributes bag — write validation', () => {
  test('an unknown attribute key is rejected with a clean message', async () => {
    await expectStatus(
      PATCH("/odata/v4/dpp/Products('prod-tshirt-classic')", { attributes: JSON.stringify({ energy_class: 'A' }) }, alice),
      400
    );
  });

  test('a malformed bag is rejected', async () => {
    await expectStatus(
      PATCH("/odata/v4/dpp/Products('prod-tshirt-classic')", { attributes: '{not json' }, alice),
      400
    );
  });

  test('a javascript: URL in a bag link field is rejected (stored-XSS guard)', async () => {
    await expectStatus(
      PATCH("/odata/v4/dpp/Products('prod-tshirt-classic')",
        { attributes: JSON.stringify({ care_video_url: 'javascript:alert(1)' }) }, alice),
      400
    );
  });

  test('an empty bag on a fresh product is stored as null', async () => {
    const created = await POST('/odata/v4/dpp/Products', {
      ID: 'test-attr-bag-prod',
      name: 'Bag Test Product',
      brand: 'Greenline',
      category_code: 'textiles',
      product_type: 'finished'
    }, alice);
    expect(created.status).toBe(201);

    const r = await PATCH("/odata/v4/dpp/Products('test-attr-bag-prod')", { attributes: '{}' }, alice);
    expect(r.status).toBe(200);
    const { Products } = cds.entities('dpp');
    const row = await SELECT.one.from(Products).columns('attributes').where({ ID: 'test-attr-bag-prod' });
    expect(row.attributes).toBeNull();
  });
});

describe('attributes bag — drift detection end-to-end', () => {
  test('editing a bag value reverts the published DPP to draft', async () => {
    const { Products, DPPs } = cds.entities('dpp');
    const before = await SELECT.one.from(DPPs).columns('status').where({ ID: 'dpp-12345' });
    expect(before.status).toBe('published'); // baseline anchored on server start

    const row = await SELECT.one.from(Products).columns('attributes').where({ ID: 'prod-tshirt-classic' });
    const bag = JSON.parse(row.attributes);
    bag.fibre_composition = '90% Cotton, 10% Elastane';
    const r = await PATCH("/odata/v4/dpp/Products('prod-tshirt-classic')",
      { attributes: JSON.stringify(bag) }, alice);
    expect(r.status).toBe(200);

    const after = await SELECT.one.from(DPPs).columns('status').where({ ID: 'dpp-12345' });
    expect(after.status).toBe('draft'); // bag content is drift-relevant
  });
});
