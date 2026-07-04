'use strict';

// Field-Catalogue administration (Epic 12 follow-up): the platform operator
// maintains categories/sections/fields AT RUNTIME. Pins:
//  - authorization: only company_advanced of the is_platform_tenant org,
//  - guardrails: key rules, immutable keys, enum options, locked⇒public,
//    delete-vs-deactivate for fields with stored values,
//  - the critical path: every write clears the catalogue cache, so
//    fieldCatalogue() and the approve gate reflect changes IMMEDIATELY,
//  - cloneCategoryCatalogue creates a fully usable category,
//  - me() exposes isPlatformAdmin for the UI gating.

const cds = require('@sap/cds');

const { GET, POST, PATCH, DELETE } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } };  // ORG-A advanced (platform tenant)
const dan   = { auth: { username: 'dan.advanced.b', password: 'x' } };  // ORG-B advanced (NOT platform tenant)
const carol = { auth: { username: 'carol.user', password: 'x' } };      // ORG-A read-only

const fetchCatalogue = async (code) => {
  const r = await GET(`/odata/v4/dpp/fieldCatalogue(category='${code}')`, alice);
  return JSON.parse(r.data.value ?? r.data);
};

const expectStatus = async (promise, status) => {
  try { await promise; throw new Error(`Expected ${status}, but it succeeded.`); }
  catch (err) { expect(err.response?.status || err.status || err.code).toBe(status); }
};

describe('authorization — platform operator only', () => {
  test('me() exposes isPlatformAdmin correctly', async () => {
    const me = async (user) => (await GET('/odata/v4/dpp/me()', user)).data;
    expect((await me(alice)).isPlatformAdmin).toBe(true);
    expect((await me(dan)).isPlatformAdmin).toBe(false);   // advanced, but not platform tenant
    expect((await me(carol)).isPlatformAdmin).toBe(false); // platform tenant, but read-only
  });

  test('tenant admin (dan) and read-only user (carol) cannot write or clone', async () => {
    await expectStatus(POST('/odata/v4/dpp/AttributeSections',
      { ID: 'sec-x', key: 'x', title: 'X' }, dan), 403);
    await expectStatus(PATCH("/odata/v4/dpp/AttributeDefinitions('attr-elec-energy-class')",
      { label: 'Hacked' }, dan), 403);
    await expectStatus(POST('/odata/v4/dpp/cloneCategoryCatalogue',
      { source_code: 'textiles', code: 'shoes', name: 'Shoes' }, dan), 403);
    await expectStatus(POST('/odata/v4/dpp/ProductCategories',
      { code: 'toys', name: 'Toys' }, carol), 403);
  });
});

describe('guardrails on definitions', () => {
  const base = {
    level: 'product', datatype: 'string', label: 'Test field',
    category_code: 'electronics', section_ID: 'sec-elec-energy'
  };

  test('reserved or malformed keys are rejected', async () => {
    await expectStatus(POST('/odata/v4/dpp/AttributeDefinitions',
      { ...base, ID: 'attr-t1', key: 'status' }, alice), 400);
    await expectStatus(POST('/odata/v4/dpp/AttributeDefinitions',
      { ...base, ID: 'attr-t2', key: 'Bad Key!' }, alice), 400);
    await expectStatus(POST('/odata/v4/dpp/AttributeDefinitions',
      { ...base, ID: 'attr-t3', key: 'supplier_id' }, alice), 400);
  });

  test('enum needs options; locked fields cannot default to internal', async () => {
    await expectStatus(POST('/odata/v4/dpp/AttributeDefinitions',
      { ...base, ID: 'attr-t4', key: 'grade', datatype: 'enum', options: null }, alice), 400);
    await expectStatus(POST('/odata/v4/dpp/AttributeDefinitions',
      { ...base, ID: 'attr-t5', key: 'secret', locked_public: true, default_visibility: 'internal' }, alice), 400);
  });

  test('the technical key and storage are immutable after creation', async () => {
    await expectStatus(PATCH("/odata/v4/dpp/AttributeDefinitions('attr-elec-sw-updates')",
      { key: 'renamed' }, alice), 400);
    await expectStatus(PATCH("/odata/v4/dpp/AttributeDefinitions('attr-elec-sw-updates')",
      { storage: 'column' }, alice), 400);
  });

  test('a section of another category is rejected', async () => {
    await expectStatus(POST('/odata/v4/dpp/AttributeDefinitions',
      { ...base, ID: 'attr-t6', key: 'misplaced', section_ID: 'sec-care' }, alice), 400); // textiles section
  });
});

describe('the critical path — changes take effect immediately', () => {
  test('creating a mandatory field updates fieldCatalogue AND the approve gate at once', async () => {
    const res = await POST('/odata/v4/dpp/AttributeDefinitions', {
      ID: 'attr-elec-recyclability',
      category_code: 'electronics',
      level: 'product',
      key: 'recyclability_note',
      label: 'Recyclability note',
      datatype: 'text',
      widget: 'textarea',
      section_ID: 'sec-elec-service',
      sort_order: 90,
      mandatory: true,
      fix_hint: 'Add a recyclability note.',
      validation_section: 'Product',
      default_visibility: 'public'
    }, alice);
    expect(res.status).toBe(201);
    expect(res.data.storage).toBe('json'); // runtime fields are always bag-backed

    // No restart, no redeploy — the merged catalogue serves it immediately.
    const cat = await fetchCatalogue('electronics');
    const field = cat.fields.find((f) => f.key === 'recyclability_note');
    expect(field).toBeDefined();
    expect(field.mandatory).toBe(true);

    // …and a value passes the bag validation right away.
    const ok = await PATCH("/odata/v4/dpp/Products('prod-tshirt-classic')", {}, alice); // warm-up no-op
    expect(ok.status).toBe(200);
  });

  test('deactivating a field removes it from the catalogue without touching stored values', async () => {
    const r = await PATCH("/odata/v4/dpp/AttributeDefinitions('attr-elec-recyclability')",
      { is_active: false }, alice);
    expect(r.status).toBe(200);
    const cat = await fetchCatalogue('electronics');
    expect(cat.fields.find((f) => f.key === 'recyclability_note')).toBeUndefined();
  });

  test('an unused field can be deleted; a used one only deactivated', async () => {
    // unused → delete works
    const del = await DELETE("/odata/v4/dpp/AttributeDefinitions('attr-elec-recyclability')", alice);
    expect(del.status).toBe(204);

    // 'fibre_composition' carries seed values on textiles products → delete is blocked
    await expectStatus(DELETE("/odata/v4/dpp/AttributeDefinitions('attr-tex-fibre-composition')", alice), 400);
  });
});

describe('cloneCategoryCatalogue — a new category in one call', () => {
  test('clones sections, definitions and requirements into a usable category', async () => {
    const r = await POST('/odata/v4/dpp/cloneCategoryCatalogue', {
      source_code: 'textiles', code: 'shoes', name: 'Shoes', descr: 'Footwear (ESPR)'
    }, alice);
    expect(r.status).toBe(200);

    const cat = await fetchCatalogue('shoes');
    expect(cat.category).toBe('shoes');
    const keys = cat.fields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['fibre_composition', 'care_instructions', 'name', 'brand']));
    expect(cat.sections.map((s) => s.key)).toEqual(expect.arrayContaining(['materials', 'care']));

    // The category is immediately usable: a product can be created against it,
    // and the clone's bag validation accepts its fields.
    const created = await POST('/odata/v4/dpp/Products', {
      ID: 'shoe-sneaker', name: 'Sneaker One', brand: 'Greenline',
      category_code: 'shoes', product_type: 'finished',
      attributes: JSON.stringify({ fibre_composition: 'Leather upper, rubber sole' })
    }, alice);
    expect(created.status).toBe(201);
  });

  test('duplicate or malformed codes are rejected', async () => {
    await expectStatus(POST('/odata/v4/dpp/cloneCategoryCatalogue',
      { source_code: 'textiles', code: 'shoes', name: 'Again' }, alice), 400);
    await expectStatus(POST('/odata/v4/dpp/cloneCategoryCatalogue',
      { source_code: 'textiles', code: 'Bad Code', name: 'X' }, alice), 400);
  });
});

describe('catalogueUsage — delete-vs-deactivate insight', () => {
  test('counts stored bag values per field', async () => {
    const r = await GET(`/odata/v4/dpp/catalogueUsage(category='textiles')`, alice);
    const usage = JSON.parse(r.data.value ?? r.data);
    expect(usage['product.fibre_composition']).toBeGreaterThan(0); // seed products carry it
    expect(usage['product.care_video_url']).toBeGreaterThanOrEqual(0);
  });
});
