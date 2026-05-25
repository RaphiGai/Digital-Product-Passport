'use strict';

const cds = require('@sap/cds');
const { GET, POST, expect } = cds.test().in(__dirname + '/../..');

const aliceAdmin    = { auth: { username: 'alice.admin',     password: 'x' } };
const danAdvancedB  = { auth: { username: 'dan.advanced.b',  password: 'x' } };
const eveAuthority  = { auth: { username: 'eve.authority',   password: 'x' } };

describe('Tenant isolation & role gates (DPPService)', () => {
  test('alice.admin (ORG-A) sees only Greenline products', async () => {
    const { data } = await GET('/odata/v4/dpp/Products?$select=ID,owning_organization_ID', aliceAdmin);
    expect(data.value.every((p) => p.owning_organization_ID === 'org-greenline')).toBe(true);
    expect(data.value.length).toBeGreaterThan(0);
  });

  test('dan.advanced.b (ORG-B) sees only Fashionista products', async () => {
    const { data } = await GET('/odata/v4/dpp/Products?$select=ID,owning_organization_ID', danAdvancedB);
    expect(data.value.every((p) => p.owning_organization_ID === 'org-fashionista')).toBe(true);
  });

  test('dan.advanced.b cannot publish an ORG-A DPP', async () => {
    await expect(
      POST(`/odata/v4/dpp/DPPs('dpp-12345')/DPPService.publishDPP`, {}, danAdvancedB)
    ).rejects.toThrow(/403/);
  });
});

describe('Authority cross-tenant read', () => {
  test('eve.authority sees DPPs from every organization', async () => {
    const { data } = await GET('/odata/v4/authority/DPPs?$select=ID,product_ID', eveAuthority);
    expect(data.value.length).toBeGreaterThan(0);
  });

  test('eve.authority is forbidden on DPPService (no admin/advanced/user/viewer scope)', async () => {
    await expect(GET('/odata/v4/dpp/DPPs', eveAuthority)).rejects.toThrow(/403/);
  });
});
