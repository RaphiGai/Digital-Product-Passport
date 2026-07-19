'use strict';

// Write-side tenant isolation + active-user enforcement + consumer-URL validation.
// Regression guard for the audit findings #1–#6:
//   #1 cross-tenant DELETE, #2 cross-tenant UPDATE, #3 Users cross-tenant,
//   #4 cross-tenant CREATE (parent FK), #5 deactivated user retains access,
//   #6 stored javascript: XSS via unvalidated consumer URL fields.

const cds = require('@sap/cds');
const { GET, POST, PATCH, DELETE, expect } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // usr-alice, ORG-A (org-greenline)
const dan = { auth: { username: 'dan.advanced.b', password: 'x' } };    // ORG-B (org-fashionista)
const carol = { auth: { username: 'carol.user', password: 'x' } };      // ORG-A, company_user

// ORG-A seed entities.
const A = {
  product: 'prod-tshirt-classic',
  variant: 'var-tshirt-blue-m',
  batch: 'batch-2026-05-A',
  dpp: 'dpp-12345',
  bom: 'bom-tshirt-cotton',
  user: 'usr-alice',
};

const expectStatus = async (promise, status) => {
  try {
    await promise;
    throw new Error(`Expected status ${status}, but the request succeeded.`);
  } catch (err) {
    expect(err.response?.status || err.status || err.code).toBe(status);
  }
};

describe('#1 cross-tenant DELETE is blocked', () => {
  test('ORG-B cannot delete ORG-A DPP / product / variant / batch', async () => {
    await expectStatus(DELETE(`/odata/v4/dpp/DPPs('${A.dpp}')`, dan), 403);
    await expectStatus(DELETE(`/odata/v4/dpp/Products('${A.product}')`, dan), 403);
    await expectStatus(DELETE(`/odata/v4/dpp/ProductVariants('${A.variant}')`, dan), 403);
    await expectStatus(DELETE(`/odata/v4/dpp/Batches('${A.batch}')`, dan), 403);
  });
});

describe('#2 cross-tenant UPDATE is blocked', () => {
  test('ORG-B PATCH of an ORG-A product (no owning_organization_ID in body) is rejected', async () => {
    await expectStatus(
      PATCH(`/odata/v4/dpp/Products('${A.product}')`, { model: 'hijacked' }, dan),
      403
    );
  });
});

describe('#3 Users cannot be manipulated cross-tenant', () => {
  test('ORG-B PATCH / DELETE of an ORG-A user is rejected', async () => {
    await expectStatus(
      PATCH(`/odata/v4/dpp/Users('${A.user}')`, { role: 'company_user' }, dan),
      403
    );
    await expectStatus(DELETE(`/odata/v4/dpp/Users('${A.user}')`, dan), 403);
  });
});

describe('#4 cross-tenant CREATE (parent FK) is blocked', () => {
  test('ORG-B cannot attach a variant / batch / QR code to ORG-A parents', async () => {
    await expectStatus(
      POST('/odata/v4/dpp/ProductVariants', { ID: 'sec-var-1', product_ID: A.product, sku: 'SEC-1' }, dan),
      403
    );
    await expectStatus(
      POST('/odata/v4/dpp/Batches', { ID: 'sec-batch-1', variant_ID: A.variant, batch_number: 'SEC-1' }, dan),
      403
    );
    await expectStatus(
      POST('/odata/v4/dpp/QRCodes', { ID: 'sec-qr-1', dpp_ID: A.dpp }, dan),
      403
    );
  });
});

describe('#5 a deactivated user loses access immediately', () => {
  test('deactivated user is rejected; reactivation restores access', async () => {
    const { Users } = cds.entities('dpp');
    // Baseline: carol can read while active.
    const before = await GET('/odata/v4/dpp/Products?$top=1', carol);
    expect(before.status).toBe(200);

    await UPDATE(Users).set({ active: false }).where({ username: 'carol.user' });
    try {
      await expectStatus(GET('/odata/v4/dpp/Products?$top=1', carol), 403);
    } finally {
      await UPDATE(Users).set({ active: true }).where({ username: 'carol.user' });
    }

    const after = await GET('/odata/v4/dpp/Products?$top=1', carol);
    expect(after.status).toBe(200);
  });
});

describe('#6 consumer URL fields must be http(s) (stored-XSS guard)', () => {
  test('javascript: in a product care-video URL is rejected; https is accepted', async () => {
    await expectStatus(
      PATCH(`/odata/v4/dpp/Products('${A.product}')`, { care_video_url: 'javascript:alert(1)' }, alice),
      400
    );
    const ok = await PATCH(
      `/odata/v4/dpp/Products('${A.product}')`,
      { care_video_url: 'https://example.com/care.mp4' },
      alice
    );
    expect(ok.status).toBe(200);
  });

  test('javascript: in a recommended-products URL is rejected', async () => {
    await expectStatus(
      PATCH(`/odata/v4/dpp/Products('${A.product}')`, { care_products_url: 'javascript:alert(1)' }, alice),
      400
    );
  });

  test('javascript: in a BOM external_dpp_url is rejected', async () => {
    await expectStatus(
      PATCH(`/odata/v4/dpp/ProductBOMs('${A.bom}')`, { external_dpp_url: 'javascript:alert(1)' }, alice),
      400
    );
  });
});

describe('positive regression: same-org writes still work', () => {
  test('ORG-A owner can update its own product', async () => {
    const r = await PATCH(`/odata/v4/dpp/Products('${A.product}')`, { model: 'AW-2026' }, alice);
    expect(r.status).toBe(200);
    expect(r.data.model).toBe('AW-2026');
  });
});
