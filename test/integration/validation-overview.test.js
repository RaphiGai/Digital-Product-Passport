'use strict';

// validationOverview (unbound function) + direct-PATCH hardening: the Validation
// page consumes org-wide readiness computed from the unified check catalogue;
// approved/published can only be reached through the approve/publish actions.

const cds = require('@sap/cds');

const { GET, PATCH } = cds.test().in(__dirname + '/../..');
const loadDemoFixtures = require('../helpers/loadDemoFixtures');

// Restore the demo rows removed from the shipped seed (second tenant + jacket/hoodie chains).
beforeAll(loadDemoFixtures);

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // ORG-A advanced
const carol = { auth: { username: 'carol.user', password: 'x' } };     // ORG-A read-only
const dan   = { auth: { username: 'dan.advanced.b', password: 'x' } }; // ORG-B advanced

const overview = async (user) => {
  const r = await GET('/odata/v4/dpp/validationOverview()', user);
  return JSON.parse(r.data.value ?? r.data);
};

const expectStatus = async (promise, status) => {
  try { await promise; throw new Error(`Expected ${status}, but it succeeded.`); }
  catch (err) { expect(err.response?.status || err.status || err.code).toBe(status); }
};

describe('validationOverview — org-wide readiness (unified catalogue)', () => {
  test('returns every ORG-A DPP with the full check list and display fields', async () => {
    const data = await overview(alice);
    expect(Array.isArray(data.dpps)).toBe(true);
    const ids = data.dpps.map((e) => e.dpp.ID);
    expect(ids).toEqual(expect.arrayContaining(['dpp-item-tshirt-0001', 'dpp-12345', 'dpp-cotton']));

    const entry = data.dpps.find((e) => e.dpp.ID === 'dpp-item-tshirt-0001');
    expect(entry.product.name).toBe('Classic T-Shirt');
    expect(entry.variant.sku).toBe('TSHIRT-BLUE-M');
    expect(entry.batch.batch_number).toBe('2026-05-A');
    expect(entry.item.serial_number).toBe('SN-TSH-0001');
    expect(entry.validation.checks.length).toBeGreaterThan(20);
    for (const c of entry.validation.checks) {
      expect(typeof c.key).toBe('string');
      expect(typeof c.label).toBe('string');
      expect(typeof c.passed).toBe('boolean');
      expect(typeof c.section).toBe('string');
    }
  });

  test('overview readiness equals the approve gate: complete item DPP approvable, sold-item DPP blocked', async () => {
    const data = await overview(alice);
    const ready = data.dpps.find((e) => e.dpp.ID === 'dpp-item-tshirt-0001');
    expect(ready.validation.can_approve).toBe(true);

    // dpp-item-tshirt-0002 references item pi-tshirt-0002 (status 'sold').
    const blocked = data.dpps.find((e) => e.dpp.ID === 'dpp-item-tshirt-0002');
    expect(blocked.validation.can_approve).toBe(false);
    expect(blocked.validation.missing_mandatory.map((m) => m.message)).toContain('Item must be active.');
  });

  test('product-level DPPs are not blocked by item or BOM checks', async () => {
    // dpp-cotton: material product passport — no item, no BOM. The seed's empty
    // care/repair instructions still block (field gate), but item/BOM must not.
    const data = await overview(alice);
    const cotton = data.dpps.find((e) => e.dpp.ID === 'dpp-cotton');
    const keys = cotton.validation.missing_mandatory.map((m) => m.key);
    expect(keys).not.toContain('item_exists');
    expect(keys).not.toContain('item_status_active');
    expect(keys).not.toContain('bom_exists');
  });

  test('tenant isolation: ORG-B never sees ORG-A passports', async () => {
    const data = await overview(dan);
    const ids = data.dpps.map((e) => e.dpp.ID);
    expect(ids).not.toContain('dpp-item-tshirt-0001');
    expect(ids).not.toContain('dpp-12345');
  });

  test('read-only company_user may call the overview', async () => {
    const data = await overview(carol);
    expect(Array.isArray(data.dpps)).toBe(true);
    expect(data.dpps.length).toBeGreaterThan(0);
  });
});

describe('direct status PATCH hardening', () => {
  test('PATCH to approved/published is rejected; workflow statuses stay editable', async () => {
    await expectStatus(
      PATCH("/odata/v4/dpp/DPPs('dpp-item-tshirt-0002')", { status: 'published' }, alice), 400);
    await expectStatus(
      PATCH("/odata/v4/dpp/DPPs('dpp-item-tshirt-0002')", { status: 'approved' }, alice), 400);

    const r = await PATCH("/odata/v4/dpp/DPPs('dpp-item-tshirt-0002')", { status: 'in_review' }, alice);
    expect(r.status).toBe(200);
    // restore the seed state for any later suite in this run
    await PATCH("/odata/v4/dpp/DPPs('dpp-item-tshirt-0002')", { status: 'draft' }, alice);
  });
});
