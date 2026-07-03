'use strict';

const cds = require('@sap/cds');
const { GET, POST, expect } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // usr-alice, ORG-A

describe('Product identifiers — optional UPC / EIN fields', () => {
  test('CREATE persists upc + ein and reads them back', async () => {
    await POST(
      '/odata/v4/dpp/Products',
      { ID: 'prod-upc-ein-1', name: 'Identifier Test', upc: '012345678905', ein: '4012345678901' },
      alice
    );
    const { data } = await GET("/odata/v4/dpp/Products('prod-upc-ein-1')?$select=ID,upc,ein", alice);
    expect(data.upc).toBe('012345678905');
    expect(data.ein).toBe('4012345678901');
  });

  test('upc + ein are optional (a product without them is valid)', async () => {
    const r = await POST(
      '/odata/v4/dpp/Products',
      { ID: 'prod-upc-ein-2', name: 'No Identifiers' },
      alice
    );
    expect(r.status).toBe(201);
    expect(r.data.upc ?? null).toBeNull();
    expect(r.data.ein ?? null).toBeNull();
  });

  test('importProducts maps upc + ein onto the created product', async () => {
    const row = {
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
      ein: '4099999999990'
    };
    const r = await POST(
      '/odata/v4/dpp/importProducts',
      { rows: JSON.stringify([row]), dryRun: false },
      alice
    );
    expect(r.data.created).toBe(1);

    const { data } = await GET(
      `/odata/v4/dpp/Products?$filter=name eq 'Import With Identifiers'&$select=ID,upc,ein`,
      alice
    );
    expect(data.value).toHaveLength(1);
    expect(data.value[0].upc).toBe('111111111119');
    expect(data.value[0].ein).toBe('4099999999990');
  });
});
