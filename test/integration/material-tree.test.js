'use strict';

const cds = require('@sap/cds');
const tokens = require('../../srv/lib/token');

const { GET, axios } = cds.test().in(__dirname + '/../..');

const aliceAdmin   = { auth: { username: 'alice.admin',   password: 'x' } };
const eveAuthority = { auth: { username: 'eve.authority', password: 'x' } };

describe('Material master data + BOM tree', () => {
  test('alice.admin can read tenant-scoped Materials', async () => {
    const { data } = await GET('/odata/v4/dpp/Materials?$select=ID,name,owning_organization_ID', aliceAdmin);
    expect(data.value.length).toBeGreaterThan(0);
    expect(data.value.every((m) => m.owning_organization_ID === 'org-greenline')).toBe(true);
  });

  test('alice.admin cannot see Fashionista Materials', async () => {
    const { data } = await GET('/odata/v4/dpp/Materials', aliceAdmin);
    expect(data.value.some((m) => m.owning_organization_ID === 'org-fashionista')).toBe(false);
  });

  test('eve.authority sees Materials across tenants', async () => {
    const { data } = await GET('/odata/v4/authority/Materials?$select=ID,owning_organization_ID', eveAuthority);
    const orgs = new Set(data.value.map((m) => m.owning_organization_ID));
    expect(orgs.has('org-greenline')).toBe(true);
    expect(orgs.has('org-fashionista')).toBe(true);
  });

  test('MaterialComponents define the BOM for Recycled Cotton PT', async () => {
    const { data } = await GET(
      "/odata/v4/dpp/MaterialComponents?$filter=parent_material_ID eq 'mat-rec-cotton'",
      aliceAdmin
    );
    const total = data.value.reduce((sum, e) => sum + Number(e.percentage), 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.01);
    const children = new Set(data.value.map((e) => e.child_material_ID));
    expect(children).toEqual(new Set(['mat-pcc-cotton', 'mat-pic-cotton']));
  });
});

describe('Public consumer DTO with recursive material tree', () => {
  test('dpp-002 exposes a nested Recycled Cotton sub-tree via QR token', async () => {
    // Mint a real HMAC-signed token and stamp it onto dpp-002.
    const token = tokens.generate();
    const { DPPs } = cds.entities('dpp');
    await UPDATE(DPPs).set({ qr_token: token }).where({ ID: 'dpp-002' });

    const { data } = await axios.get(`/public/dpp/${token}`);

    expect(Array.isArray(data.materials)).toBe(true);

    const recycled = data.materials.find((m) => m.name === 'Recycled Cotton PT');
    expect(recycled).toBeDefined();
    expect(Number(recycled.percentage)).toBe(60);
    expect(Number(recycled.recycled_content_pct)).toBe(100);
    expect(recycled.verification_status).toBe('third_party_verified');

    expect(recycled.components).toHaveLength(2);
    const names = recycled.components.map((c) => c.name).sort();
    expect(names).toEqual(['Post-consumer Cotton Scraps', 'Pre-consumer Cotton Waste']);

    const postConsumer = recycled.components.find((c) => c.name === 'Post-consumer Cotton Scraps');
    expect(Number(postConsumer.percentage)).toBe(70);
    expect(postConsumer.country_of_origin).toBe('PT');
    expect(postConsumer.verification_status).toBe('third_party_verified');
    expect(postConsumer.components).toEqual([]);
  });
});
