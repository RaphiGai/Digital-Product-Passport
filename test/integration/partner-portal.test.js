'use strict';

// Business-partner portal accounts (role `business_partner`): account creation via
// createUser with a mandatory partner link, the fail-closed scope gate (assigned
// documents ONLY), the field-allowlist on partner updates, the placeholder flow
// (document without a file) and the myAssignedDocuments() portal feed.

const cds = require('@sap/cds');

const { GET, POST, PATCH, axios } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // ORG-A advanced
const pat   = { auth: { username: 'pat.partner', password: 'x' } };    // ORG-A partner login (created below)

const PARTNER_A = 'bp-oekotex';               // ORG-A certification body
const PARTNER_B = 'bp-fashionista-supplier';  // ORG-B partner — must be invisible to alice
const PRODUCT   = 'prod-tshirt-classic';      // ORG-A product
const BATCH     = 'batch-2026-05-A';          // ORG-A batch (variant of PRODUCT)

const DOC_EXPIRED     = 'doc-pp-expired';     // product-level, assigned, file, valid_until in the past
const DOC_PLACEHOLDER = 'doc-pp-placeholder'; // batch-level, assigned, NO file yet
const DOC_UNASSIGNED  = 'doc-pp-unassigned';  // product-level, no partner

const PDF = Buffer.from('%PDF-1.4\nfake partner certificate\n%%EOF', 'utf8');

const expectStatus = async (promise, status) => {
  try {
    await promise;
    throw new Error(`Expected status ${status}, but the request succeeded.`);
  } catch (err) {
    expect(err.response?.status || err.status || err.code).toBe(status);
  }
};

const putContent = (id, buf, mime, cfg) =>
  axios.put(`/odata/v4/dpp/Documents('${id}')/content`, buf, {
    headers: { 'Content-Type': mime },
    validateStatus: () => true,
    ...cfg
  });

beforeAll(async () => {
  // The partner login account, linked to ORG-A's certification body.
  await POST(
    '/odata/v4/dpp/createUser',
    { username: 'pat.partner', email: 'pat@oekotex.example', displayName: 'Pat Partner', role: 'business_partner', businessPartnerId: PARTNER_A },
    alice
  );

  // An assigned, already-expired certificate with a file.
  await POST(
    '/odata/v4/dpp/Documents',
    {
      ID: DOC_EXPIRED, product_ID: PRODUCT, title: 'OEKO-TEX certificate 2021',
      assigned_partner_ID: PARTNER_A, issue_date: '2020-01-01', valid_until: '2021-01-01',
      file_name: 'oekotex-2021.pdf', mime_type: 'application/pdf', file_size: PDF.length
    },
    alice
  );
  await putContent(DOC_EXPIRED, PDF, 'application/pdf', alice);

  // A batch-level placeholder waiting for the partner's upload (no file fields).
  await POST(
    '/odata/v4/dpp/Documents',
    { ID: DOC_PLACEHOLDER, batch_ID: BATCH, title: 'Batch test report 2026-05-A', assigned_partner_ID: PARTNER_A },
    alice
  );

  // A document without any partner — must stay invisible to the partner login.
  await POST(
    '/odata/v4/dpp/Documents',
    { ID: DOC_UNASSIGNED, product_ID: PRODUCT, title: 'Internal QA proof', file_name: 'qa.pdf', mime_type: 'application/pdf', file_size: PDF.length },
    alice
  );
});

describe('createUser — business_partner account rules', () => {
  test('role business_partner without a partner link → 400', async () => {
    await expectStatus(
      POST('/odata/v4/dpp/createUser', { username: 'nolink.partner', email: 'nolink@x.example', role: 'business_partner' }, alice),
      400
    );
  });

  test('partner of ANOTHER organization → 404', async () => {
    await expectStatus(
      POST('/odata/v4/dpp/createUser', { username: 'foreign.partner', email: 'foreign@x.example', role: 'business_partner', businessPartnerId: PARTNER_B }, alice),
      404
    );
  });

  test('a partner link on a company role → 400', async () => {
    await expectStatus(
      POST('/odata/v4/dpp/createUser', { username: 'weird.user', email: 'weird@x.example', role: 'company_user', businessPartnerId: PARTNER_A }, alice),
      400
    );
  });

  test('the created account carries the partner link (visible to the admin)', async () => {
    const r = await GET("/odata/v4/dpp/Users?$filter=username eq 'pat.partner'&$select=ID,role,business_partner_ID", alice);
    expect(r.data.value).toHaveLength(1);
    expect(r.data.value[0].role).toBe('business_partner');
    expect(r.data.value[0].business_partner_ID).toBe(PARTNER_A);
  });
});

describe('business_partner scope gate — everything but documents is blocked', () => {
  test('me() works and names the linked partner', async () => {
    const r = await GET('/odata/v4/dpp/me()', pat);
    expect(r.data.role).toBe('business_partner');
    expect(r.data.businessPartnerId).toBe(PARTNER_A);
    expect(r.data.businessPartnerName).toBe('OEKO-TEX Service GmbH');
  });

  test.each(['Products', 'Batches', 'Users', 'BusinessPartners', 'DPPs', 'Organizations'])(
    'READ %s → 403',
    async (entity) => {
      await expectStatus(GET(`/odata/v4/dpp/${entity}`, pat), 403);
    }
  );

  test('navigating from an assigned document to its product → 403', async () => {
    await expectStatus(GET(`/odata/v4/dpp/Documents('${DOC_EXPIRED}')/product`, pat), 403);
  });

  test('$expand on the allowed Documents read → 403 (no association escape hatch)', async () => {
    await expectStatus(GET('/odata/v4/dpp/Documents?$expand=product', pat), 403);
    await expectStatus(GET(`/odata/v4/dpp/Documents('${DOC_EXPIRED}')?$expand=assigned_partner`, pat), 403);
  });

  test('association-path $filter / $orderby / $select → 403 (no data oracle)', async () => {
    await expectStatus(GET('/odata/v4/dpp/Documents?$select=ID&$filter=batch/co2_footprint_kg gt 5', pat), 403);
    await expectStatus(GET("/odata/v4/dpp/Documents?$select=ID&$filter=product/gtin eq '123'", pat), 403);
    await expectStatus(GET('/odata/v4/dpp/Documents?$orderby=product/name', pat), 403);
    await expectStatus(GET('/odata/v4/dpp/Documents?$select=ID,product/gtin', pat), 403);
  });

  test('a plain own-column $filter still works (own scalar data only)', async () => {
    const r = await GET("/odata/v4/dpp/Documents?$select=ID&$filter=doc_type eq 'certificate'", pat);
    expect(r.status).toBe(200);
  });

  test('CREATE Documents → 403', async () => {
    await expectStatus(
      POST('/odata/v4/dpp/Documents', { ID: 'doc-pp-rogue', product_ID: PRODUCT, title: 'Rogue' }, pat),
      403
    );
  });

  test('DELETE an assigned document → 403', async () => {
    const r = await axios.delete(`/odata/v4/dpp/Documents('${DOC_EXPIRED}')`, { ...pat, validateStatus: () => true });
    expect(r.status).toBe(403);
  });

  test('admin/write actions (createUser, importProducts) → 403', async () => {
    await expectStatus(
      POST('/odata/v4/dpp/createUser', { username: 'evil', email: 'evil@x.example', role: 'company_advanced' }, pat),
      403
    );
    await expectStatus(POST('/odata/v4/dpp/importProducts', { rows: '[]', dryRun: true }, pat), 403);
  });

  test('company read functions (validationOverview) → 403', async () => {
    await expectStatus(GET('/odata/v4/dpp/validationOverview()', pat), 403);
  });
});

describe('business_partner document access — assigned rows only', () => {
  test('the document list contains exactly the assigned documents', async () => {
    const r = await GET('/odata/v4/dpp/Documents?$select=ID', pat);
    const ids = r.data.value.map((d) => d.ID).sort();
    expect(ids).toEqual([DOC_EXPIRED, DOC_PLACEHOLDER].sort());
  });

  test('an unassigned document is not addressable (404)', async () => {
    await expectStatus(GET(`/odata/v4/dpp/Documents('${DOC_UNASSIGNED}')`, pat), 404);
  });

  test('the assigned file can be downloaded', async () => {
    const r = await axios.get(`/odata/v4/dpp/Documents('${DOC_EXPIRED}')/content`, {
      ...pat, responseType: 'arraybuffer', validateStatus: () => true
    });
    expect(r.status).toBe(200);
    expect(Buffer.from(r.data)).toEqual(PDF);
  });

  test('updating issuer + validity dates on an assigned document works', async () => {
    const r = await PATCH(
      `/odata/v4/dpp/Documents('${DOC_EXPIRED}')`,
      { issuer: 'OEKO-TEX Institute', issue_date: '2026-06-01', valid_until: '2027-06-01' },
      pat
    );
    expect(r.status).toBeLessThan(300);
    const check = await GET(`/odata/v4/dpp/Documents('${DOC_EXPIRED}')?$select=valid_until,issuer`, pat);
    expect(check.data.valid_until).toBe('2027-06-01');
    expect(check.data.issuer).toBe('OEKO-TEX Institute');
  });

  test.each([
    ['title', { title: 'Renamed by partner' }],
    ['visibility', { visibility: 'public' }],
    ['doc_type', { doc_type: 'manual' }],
    ['anchor', { product_ID: PRODUCT }],
    ['assignment', { assigned_partner_ID: null }]
  ])('changing the locked field %s → 403', async (_label, payload) => {
    await expectStatus(PATCH(`/odata/v4/dpp/Documents('${DOC_EXPIRED}')`, payload, pat), 403);
  });

  test('updating a document assigned to nobody / someone else → 403', async () => {
    await expectStatus(PATCH(`/odata/v4/dpp/Documents('${DOC_UNASSIGNED}')`, { issuer: 'X' }, pat), 403);
  });

  test('uploading the file onto the placeholder (metadata PATCH + media PUT)', async () => {
    const meta = await PATCH(
      `/odata/v4/dpp/Documents('${DOC_PLACEHOLDER}')`,
      { file_name: 'test-report.pdf', mime_type: 'application/pdf', file_size: PDF.length, issue_date: '2026-06-01', valid_until: '2027-06-01' },
      pat
    );
    expect(meta.status).toBeLessThan(300);
    const put = await putContent(DOC_PLACEHOLDER, PDF, 'application/pdf', pat);
    expect(put.status).toBeLessThan(300);
  });

  test('media PUT on an unassigned document → 403', async () => {
    const r = await putContent(DOC_UNASSIGNED, PDF, 'application/pdf', pat);
    expect(r.status).toBe(403);
  });
});

describe('myAssignedDocuments() — the portal feed', () => {
  test('company users may not call it', async () => {
    await expectStatus(GET('/odata/v4/dpp/myAssignedDocuments()', alice), 403);
  });

  test('returns the assigned documents with product/batch context and expiry flags', async () => {
    const r = await GET('/odata/v4/dpp/myAssignedDocuments()', pat);
    const feed = JSON.parse(r.data.value ?? r.data);
    expect(feed.documents).toHaveLength(2);

    const byId = Object.fromEntries(feed.documents.map((d) => [d.ID, d]));

    // Product-level document: direct product context, renewed in the test above.
    const productDoc = byId[DOC_EXPIRED];
    expect(productDoc.level).toBe('product');
    expect(productDoc.product.ID).toBe(PRODUCT);
    expect(productDoc.product.name).toBeTruthy();
    expect(productDoc.has_file).toBe(true);
    expect(productDoc.expired).toBe(false); // renewed to 2027-06-01 above

    // Batch-level document: product resolved through variant, batch number included.
    const batchDoc = byId[DOC_PLACEHOLDER];
    expect(batchDoc.level).toBe('batch');
    expect(batchDoc.batch.batch_number).toBe('2026-05-A');
    expect(batchDoc.product.ID).toBe(PRODUCT);
  });

  test('flags an expired document', async () => {
    // Expire the product doc again (as the owning company).
    await PATCH(`/odata/v4/dpp/Documents('${DOC_EXPIRED}')`, { issue_date: '2020-01-01', valid_until: '2021-01-01' }, alice);
    const r = await GET('/odata/v4/dpp/myAssignedDocuments()', pat);
    const feed = JSON.parse(r.data.value ?? r.data);
    const doc = feed.documents.find((d) => d.ID === DOC_EXPIRED);
    expect(doc.expired).toBe(true);
  });
});

describe('company side — assignment stays visible and editable', () => {
  test('alice sees the assigned partner via $expand', async () => {
    const r = await GET(`/odata/v4/dpp/Documents('${DOC_EXPIRED}')?$expand=assigned_partner($select=ID,name)`, alice);
    expect(r.data.assigned_partner.ID).toBe(PARTNER_A);
    expect(r.data.assigned_partner.name).toBe('OEKO-TEX Service GmbH');
  });

  test('assigning a partner from another organization → 403', async () => {
    await expectStatus(
      PATCH(`/odata/v4/dpp/Documents('${DOC_UNASSIGNED}')`, { assigned_partner_ID: PARTNER_B }, alice),
      403
    );
  });

  test('alice can re-assign and un-assign', async () => {
    const r1 = await PATCH(`/odata/v4/dpp/Documents('${DOC_UNASSIGNED}')`, { assigned_partner_ID: PARTNER_A }, alice);
    expect(r1.status).toBeLessThan(300);
    const r2 = await PATCH(`/odata/v4/dpp/Documents('${DOC_UNASSIGNED}')`, { assigned_partner_ID: null }, alice);
    expect(r2.status).toBeLessThan(300);
  });
});

describe('tenant isolation of the partner link (raw Users write)', () => {
  test('repointing Users.business_partner_ID via raw PATCH → 403 (no cross-org redirect)', async () => {
    const users = await GET("/odata/v4/dpp/Users?$filter=username eq 'pat.partner'&$select=ID", alice);
    const patId = users.data.value[0].ID;
    // Even to a partner of the OWN org: the link is create-only, never repointable.
    await expectStatus(PATCH(`/odata/v4/dpp/Users('${patId}')`, { business_partner_ID: PARTNER_A }, alice), 403);
    // And certainly not to a FOREIGN-org partner (the actual tenant-break vector).
    await expectStatus(PATCH(`/odata/v4/dpp/Users('${patId}')`, { business_partner_ID: PARTNER_B }, alice), 403);
  });

  test('other Users PATCHes (display name) still work', async () => {
    const users = await GET("/odata/v4/dpp/Users?$filter=username eq 'pat.partner'&$select=ID", alice);
    const patId = users.data.value[0].ID;
    const r = await PATCH(`/odata/v4/dpp/Users('${patId}')`, { display_name: 'Pat P.' }, alice);
    expect(r.status).toBeLessThan(300);
  });
});

describe('archived partner revokes portal access', () => {
  test('archiving the linked partner locks the partner login on the next request', async () => {
    // Use a throwaway partner + account so archiving does not disturb the pat suite.
    await POST('/odata/v4/dpp/BusinessPartners', { ID: 'bp-throwaway', name: 'Throwaway Partner', country_iso2: 'DE' }, alice);
    await POST(
      '/odata/v4/dpp/createUser',
      { username: 'temp.partner', email: 'temp@x.example', role: 'business_partner', businessPartnerId: 'bp-throwaway' },
      alice
    );
    const temp = { auth: { username: 'temp.partner', password: 'x' } };

    // Works while the partner is active.
    const before = await GET('/odata/v4/dpp/me()', temp);
    expect(before.data.role).toBe('business_partner');

    // Archive the partner → the login must fail closed on its next request.
    await PATCH("/odata/v4/dpp/BusinessPartners('bp-throwaway')", { archived: true }, alice);
    await expectStatus(GET('/odata/v4/dpp/myAssignedDocuments()', temp), 403);
    await expectStatus(GET('/odata/v4/dpp/Documents', temp), 403);
  });
});
