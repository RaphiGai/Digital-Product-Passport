'use strict';

// User-defined additional fields ({label, value, visibility} rows in `custom_fields`)
// on Products/Variants/Batches: writes are validated + canonicalized server-side, and
// only 'public' entries surface in the consumer DTO as {label, value} pairs.

const cds = require('@sap/cds');
const tokens = require('../../srv/lib/token');

const { PATCH, GET, axios } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // company_advanced

async function attachToken(dppId) {
  const { DPPs } = cds.entities('dpp');
  const token = tokens.generate();
  await UPDATE(DPPs).set({ qr_token: token }).where({ ID: dppId });
  return token;
}

const getPublic = (token) => axios.get(`/public/dpp/${token}`, { validateStatus: () => true });

const patchProduct = (payload) =>
  PATCH("/odata/v4/dpp/Products('prod-tshirt-classic')", payload, alice);

// Keep tests order-independent — clear everything this suite writes.
async function reset() {
  const { Products, ProductVariants, Batches } = cds.entities('dpp');
  await UPDATE(Products).set({ custom_fields: null }).where({ ID: 'prod-tshirt-classic' });
  await UPDATE(ProductVariants).set({ custom_fields: null }).where({ ID: 'var-tshirt-blue-m' });
  await UPDATE(Batches).set({ custom_fields: null }).where({ ID: 'batch-2026-05-A' });
}

beforeEach(reset);

describe('Writes are validated and canonicalized', () => {
  test('valid rows are stored trimmed with visibility defaulting to internal', async () => {
    await patchProduct({
      custom_fields: JSON.stringify([
        { label: ' Water consumption ', value: ' 2700 l/kg ', visibility: 'public' },
        { label: 'Auditor', value: 'Institute X' },
        { label: '', value: '' } // empty row from the editor — dropped
      ])
    });
    const { data } = await GET("/odata/v4/dpp/Products('prod-tshirt-classic')", alice);
    expect(JSON.parse(data.custom_fields)).toEqual([
      { label: 'Water consumption', value: '2700 l/kg', visibility: 'public' },
      { label: 'Auditor', value: 'Institute X', visibility: 'internal' }
    ]);
  });

  test('clearing all rows stores null', async () => {
    await patchProduct({ custom_fields: JSON.stringify([{ label: 'X', value: '1' }]) });
    await patchProduct({ custom_fields: '[]' });
    const { data } = await GET("/odata/v4/dpp/Products('prod-tshirt-classic')", alice);
    expect(data.custom_fields).toBeNull();
  });

  const expect400 = async (payload) => {
    let status;
    try {
      const res = await patchProduct(payload);
      status = res.status;
    } catch (err) {
      status = err.response?.status || err.status;
    }
    expect(status).toBe(400);
  };

  test('duplicate names are rejected', () =>
    expect400({ custom_fields: JSON.stringify([{ label: 'A', value: '1' }, { label: 'a', value: '2' }]) }));

  test('reserved names are rejected', () =>
    expect400({ custom_fields: JSON.stringify([{ label: 'status', value: 'x' }]) }));

  test('a value without a name is rejected', () =>
    expect400({ custom_fields: JSON.stringify([{ label: '', value: 'orphan' }]) }));

  test('malformed JSON is rejected', () => expect400({ custom_fields: 'not json' }));

  test('variants and batches validate the same way', async () => {
    for (const url of [
      "/odata/v4/dpp/ProductVariants('var-tshirt-blue-m')",
      "/odata/v4/dpp/Batches('batch-2026-05-A')"
    ]) {
      let status;
      try {
        const res = await PATCH(url, { custom_fields: JSON.stringify([{ label: 'id', value: 'x' }]) }, alice);
        status = res.status;
      } catch (err) {
        status = err.response?.status || err.status;
      }
      expect(status).toBe(400);
    }
  });
});

describe('Consumer DTO carries only public entries', () => {
  test('public entries appear as {label, value}; internal ones never leak', async () => {
    const { Products, ProductVariants, Batches } = cds.entities('dpp');
    await UPDATE(Products).set({
      custom_fields: JSON.stringify([
        { label: 'Water consumption', value: '2700 l/kg', visibility: 'public' },
        { label: 'Internal note', value: 'do not show', visibility: 'internal' }
      ])
    }).where({ ID: 'prod-tshirt-classic' });
    await UPDATE(ProductVariants).set({
      custom_fields: JSON.stringify([{ label: 'Fit', value: 'Regular', visibility: 'public' }])
    }).where({ ID: 'var-tshirt-blue-m' });
    await UPDATE(Batches).set({
      custom_fields: JSON.stringify([{ label: 'Line audit', value: 'passed', visibility: 'internal' }])
    }).where({ ID: 'batch-2026-05-A' });

    const { status, data } = await getPublic(await attachToken('dpp-12345'));
    expect(status).toBe(200);

    expect(data.product.custom_fields).toEqual([{ label: 'Water consumption', value: '2700 l/kg' }]);
    expect(JSON.stringify(data)).not.toContain('do not show');
    expect(data.variant.custom_fields).toEqual([{ label: 'Fit', value: 'Regular' }]);
    // Batch has no public entries → no custom_fields key at all.
    expect(data.batch).not.toHaveProperty('custom_fields');
  });

  test('without custom fields the sections carry no custom_fields key', async () => {
    const { data } = await getPublic(await attachToken('dpp-12345'));
    expect(data.product).not.toHaveProperty('custom_fields');
    expect(data.variant).not.toHaveProperty('custom_fields');
  });
});
