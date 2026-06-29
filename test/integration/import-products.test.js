'use strict';

const cds = require('@sap/cds');
const { POST, GET, expect } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // usr-alice, ORG-A

const validRow = {
  name: 'Repro Import Tee',
  brand: 'TestBrand',
  category: 'textiles',
  product_type: 'finished',
  status: 'draft',
  country_of_origin: 'DE',
  fibre_composition: '100% cotton',
  care_instructions: 'Wash cold',
  repair_instructions: 'Patch holes',
  disposal_instructions: 'Recycle at textile bin',
  substances_of_concern: 'none',
  espr_compliance: 'draft'
};

describe('importProducts — category code-list (post-merge regression)', () => {
  test('imports a valid product row mapping category → ProductCategories code list', async () => {
    const r = await POST(
      '/odata/v4/dpp/importProducts',
      { rows: JSON.stringify([validRow]), dryRun: false },
      alice
    );
    expect(r.status).toBe(200);
    expect(r.data.created).toBe(1);
    expect(r.data.skipped).toBe(0);
    expect(JSON.parse(r.data.errors)).toHaveLength(0);

    // The created product must carry the category foreign key.
    const { data } = await GET(
      `/odata/v4/dpp/Products?$filter=name eq 'Repro Import Tee'&$select=ID,name,category_code`,
      alice
    );
    expect(data.value).toHaveLength(1);
    expect(data.value[0].category_code).toBe('textiles');
  });

  test('rejects an unknown category with a per-row error (no crash)', async () => {
    const r = await POST(
      '/odata/v4/dpp/importProducts',
      { rows: JSON.stringify([{ ...validRow, name: 'Bad Category Row', category: 'spaceships' }]), dryRun: false },
      alice
    );
    expect(r.status).toBe(200);
    expect(r.data.created).toBe(0);
    const issues = JSON.parse(r.data.errors);
    expect(issues.some((e) => e.field === 'category' && e.severity === 'error')).toBe(true);
  });
});
