'use strict';

const cds = require('@sap/cds');
const { GET, POST, expect } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // usr-alice, ORG-A

describe('Product identifiers — optional UPC / EAN fields', () => {
  test('CREATE persists upc + ean and reads them back', async () => {
    await POST(
      '/odata/v4/dpp/Products',
      { ID: 'prod-upc-ean-1', name: 'Identifier Test', upc: '012345678905', ean: '4012345678901' },
      alice
    );
    const { data } = await GET("/odata/v4/dpp/Products('prod-upc-ean-1')?$select=ID,upc,ean", alice);
    expect(data.upc).toBe('012345678905');
    expect(data.ean).toBe('4012345678901');
  });

  test('upc + ean are optional (a product without them is valid)', async () => {
    const r = await POST(
      '/odata/v4/dpp/Products',
      { ID: 'prod-upc-ean-2', name: 'No Identifiers' },
      alice
    );
    expect(r.status).toBe(201);
    expect(r.data.upc ?? null).toBeNull();
    expect(r.data.ean ?? null).toBeNull();
  });

  const importRow = (overrides) => ({
    name: 'Import With Identifiers',
    brand: 'TestBrand',
    category: 'textiles',
    product_type: 'finished',
    status: 'draft',
    country_of_origin: 'DE',
    fibre_composition: '100% cotton',
    care_instructions: 'Wash cold',
    repair_instructions: 'Patch',
    disposal_instructions: 'Recycle',
    substances_of_concern: 'none',
    espr_compliance: 'draft',
    upc: '111111111119',
    ...overrides
  });

  test('importProducts maps upc + ean onto the created product', async () => {
    const row = importRow({ ean: '4099999999990' });
    const r = await POST(
      '/odata/v4/dpp/importProducts',
      { rows: JSON.stringify([row]), dryRun: false },
      alice
    );
    expect(r.data.created).toBe(1);

    const { data } = await GET(
      `/odata/v4/dpp/Products?$filter=name eq 'Import With Identifiers'&$select=ID,upc,ean`,
      alice
    );
    expect(data.value).toHaveLength(1);
    expect(data.value[0].upc).toBe('111111111119');
    expect(data.value[0].ean).toBe('4099999999990');
  });

  test('importProducts accepts the legacy "ein" column as ean', async () => {
    const row = importRow({ name: 'Import Legacy Ein Column', ein: '4088888888885' });
    const r = await POST(
      '/odata/v4/dpp/importProducts',
      { rows: JSON.stringify([row]), dryRun: false },
      alice
    );
    expect(r.data.created).toBe(1);

    const { data } = await GET(
      `/odata/v4/dpp/Products?$filter=name eq 'Import Legacy Ein Column'&$select=ID,ean`,
      alice
    );
    expect(data.value).toHaveLength(1);
    expect(data.value[0].ean).toBe('4088888888885');
  });
});
