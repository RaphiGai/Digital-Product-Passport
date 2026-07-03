'use strict';

// Epic 12, increment 3 — the `attributes` bag write path and the self-describing
// consumer `attribute_sections`:
//  - writes are validated against the category catalogue (unknown key → clean 400),
//  - the consumer DTO projects CATEGORY-scoped catalogue fields (today still
//    column-backed textile fields) into attribute_sections with rendering hints,
//  - regulatory-locked fields cannot be hidden from the sections,
//  - the parity guarantee: adding the (empty) bag must NOT drift existing DPPs.

const cds = require('@sap/cds');
const tokens = require('../../srv/lib/token');

const { PATCH, axios } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } };

async function attachToken(dppId) {
  const { DPPs } = cds.entities('dpp');
  const token = tokens.generate();
  await UPDATE(DPPs).set({ qr_token: token }).where({ ID: dppId });
  return token;
}

const getPublic = (token) => axios.get(`/public/dpp/${token}`, { validateStatus: () => true });

const expectStatus = async (promise, status) => {
  try { await promise; throw new Error(`Expected ${status}, but it succeeded.`); }
  catch (err) { expect(err.response?.status || err.status || err.code).toBe(status); }
};

describe('attributes bag — write validation (textiles has no json fields yet)', () => {
  test('an unknown attribute key is rejected with a clean message', async () => {
    await expectStatus(
      PATCH("/odata/v4/dpp/Products('prod-tshirt-classic')", { attributes: JSON.stringify({ energy_class: 'A' }) }, alice),
      400
    );
  });

  test('an empty bag is accepted and stored as null (no drift, no noise)', async () => {
    const r = await PATCH("/odata/v4/dpp/Products('prod-tshirt-classic')", { attributes: '{}' }, alice);
    expect(r.status).toBe(200);
    const { Products } = cds.entities('dpp');
    const row = await SELECT.one.from(Products).columns('attributes').where({ ID: 'prod-tshirt-classic' });
    expect(row.attributes).toBeNull();
  });

  test('a malformed bag is rejected', async () => {
    await expectStatus(
      PATCH("/odata/v4/dpp/Products('prod-tshirt-classic')", { attributes: '{not json' }, alice),
      400
    );
  });

  test('adding the empty attributes column did not drift the published seed DPP', async () => {
    const { DPPs } = cds.entities('dpp');
    const dpp = await SELECT.one.from(DPPs).columns('status').where({ ID: 'dpp-12345' });
    // seeded 'published'; the {} PATCH above and the new column must not revert it
    expect(dpp.status).toBe('published');
  });
});

describe('attribute_sections — self-describing consumer sections', () => {
  test('category-scoped textile fields surface in their sections with rendering hints', async () => {
    const token = await attachToken('dpp-12345');
    const res = await getPublic(token);
    expect(res.status).toBe(200);
    const dto = res.data;

    expect(Array.isArray(dto.attribute_sections)).toBe(true);
    const materials = dto.attribute_sections.find((s) => s.key === 'materials');
    expect(materials).toBeDefined();
    expect(materials.title).toBe('Material & composition');
    const fibre = materials.fields.find((f) => f.key === 'fibre_composition');
    expect(fibre).toBeDefined();
    expect(fibre.label).toBe('Fibre composition');
    // value mirrors the (still column-backed) product field shown in the classic block
    expect(fibre.value).toBe(dto.product.fibre_composition);

    const care = dto.attribute_sections.find((s) => s.key === 'care');
    expect(care).toBeDefined();
    const careInstructions = care.fields.find((f) => f.key === 'care_instructions');
    expect(careInstructions).toBeDefined();
    expect(careInstructions.grp).toBe('care');

    // core fields never appear in attribute_sections (they live in the fixed blocks)
    const allKeys = dto.attribute_sections.flatMap((s) => s.fields.map((f) => f.key));
    expect(allKeys).not.toContain('name');
    expect(allKeys).not.toContain('substances_of_concern');
    expect(allKeys).not.toContain('country_of_origin');
  });

  test('locked fields stay in the sections even when a stored override says internal', async () => {
    const { Products } = cds.entities('dpp');
    await UPDATE(Products)
      .set({ field_visibility: JSON.stringify({ fibre_composition: 'internal', care_instructions: 'internal' }) })
      .where({ ID: 'prod-tshirt-classic' });

    const token = await attachToken('dpp-12345');
    const dto = (await getPublic(token)).data;
    const keys = (dto.attribute_sections || []).flatMap((s) => s.fields.map((f) => f.key));
    expect(keys).toContain('fibre_composition'); // locked → never hidden
    expect(keys).toContain('care_instructions'); // locked → never hidden

    await UPDATE(Products).set({ field_visibility: null }).where({ ID: 'prod-tshirt-classic' });
  });

  test('non-locked fields respect an internal override in the sections', async () => {
    const { Products } = cds.entities('dpp');
    await UPDATE(Products)
      .set({
        reuse_instructions: 'Give it a second life',
        field_visibility: JSON.stringify({ reuse_instructions: 'internal' })
      })
      .where({ ID: 'prod-tshirt-classic' });

    const token = await attachToken('dpp-12345');
    const dto = (await getPublic(token)).data;
    const keys = (dto.attribute_sections || []).flatMap((s) => s.fields.map((f) => f.key));
    expect(keys).not.toContain('reuse_instructions');

    await UPDATE(Products)
      .set({ reuse_instructions: null, field_visibility: null })
      .where({ ID: 'prod-tshirt-classic' });
  });
});
