'use strict';

// Versioning lifecycle rework: approve requires the full mandatory-field catalogue;
// publish freezes a version the consumer sees; editing the underlying data reverts the
// DPP to draft (old-vs-new drift) WITHOUT changing what the consumer sees; re-approve +
// re-publish makes the new version live and the previous one immutable history.

const cds = require('@sap/cds');
const tokens = require('../../srv/lib/token');

const { GET, POST, PATCH, axios } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // ORG-A advanced
const DPP = 'dpp-item-tshirt-0001'; // ORG-A, finished product with all mandatory fields
const PRODUCT = 'prod-tshirt-classic';

const expectStatus = async (promise, status) => {
  try { await promise; throw new Error(`Expected ${status}, but it succeeded.`); }
  catch (err) { expect(err.response?.status || err.status || err.code).toBe(status); }
};
const getPublic = (token) => axios.get(`/public/dpp/${token}`, { validateStatus: () => true });
const readDpp = () => GET(`/odata/v4/dpp/DPPs('${DPP}')`, alice);
const publish = (reason) => POST(`/odata/v4/dpp/DPPs('${DPP}')/DPPService.publishDPP`, { change_reason: reason }, alice);
const approve = () => POST(`/odata/v4/dpp/DPPs('${DPP}')/DPPService.approveDPP`, {}, alice);
const validation = async () => {
  const r = await GET(`/odata/v4/dpp/DPPs('${DPP}')/DPPService.validationStatus`, alice);
  return JSON.parse(r.data.value ?? r.data);
};
async function attachToken() {
  const { DPPs } = cds.entities('dpp');
  const token = tokens.generate();
  await UPDATE(DPPs).set({ qr_token: token }).where({ ID: DPP });
  return token;
}

describe('DPP versioning lifecycle (publish-driven, frozen, drift-reverting)', () => {
  let token;

  test('publish creates v1 and the consumer sees the frozen v1', async () => {
    token = await attachToken();
    const r = await publish('v1');
    expect(r.data.status).toBe('published');
    expect(r.data.current_version).toBe(1);

    const pub = await getPublic(token);
    expect(pub.status).toBe(200);
    expect(pub.data.version).toBe(1);
    expect(pub.data.identification.dpp_id).toBe(DPP);
  });

  test('editing the product reverts the DPP to draft; the consumer still sees v1 (frozen)', async () => {
    await PATCH(`/odata/v4/dpp/Products('${PRODUCT}')`, { model: 'Edited Model 2026' }, alice);

    // Status reverted to draft (drift), but the live version pointer + published_at stay.
    const { data: dpp } = await readDpp();
    expect(dpp.status).toBe('draft');
    expect(dpp.current_version).toBe(1);

    // Consumer keeps seeing the frozen v1 — the new model is NOT leaked.
    const pub = await getPublic(token);
    expect(pub.status).toBe(200);
    expect(pub.data.version).toBe(1);
    expect(pub.data.product.model).not.toBe('Edited Model 2026');

    // validationStatus surfaces the pending change with a field-level diff.
    const v = await validation();
    expect(v.live_version).toBe(1);
    expect(v.next_version).toBe(2);
    expect(v.pending_changes).toBe(true);
    expect(v.changed_fields.some((c) => c.label === 'Model' || c.path === 'product.model')).toBe(true);
  });

  test('re-approve + re-publish makes v2 live; v1 becomes immutable history', async () => {
    const a = await approve();
    expect(a.data.status).toBe('approved');
    const p = await publish('v2 with new model');
    expect(p.data.current_version).toBe(2);

    const pub = await getPublic(token);
    expect(pub.status).toBe(200);
    expect(pub.data.version).toBe(2);
    expect(pub.data.product.model).toBe('Edited Model 2026');

    // Both versions are recorded; v1 is frozen history.
    const { data } = await GET(`/odata/v4/dpp/DPPVersions?$filter=dpp_ID eq '${DPP}'&$orderby=version_number desc`, alice);
    const numbers = data.value.map((x) => x.version_number);
    expect(numbers).toEqual(expect.arrayContaining([1, 2]));

    // No net change after publishing → no pending changes.
    const v = await validation();
    expect(v.pending_changes).toBe(false);
  });

  test('approve lists ALL missing mandatory fields (full catalogue), not just the legacy four', async () => {
    // Clear two catalogue-mandatory fields → editing reverts to draft → approve must list both.
    await PATCH(`/odata/v4/dpp/Products('${PRODUCT}')`, { attributes: JSON.stringify({ fibre_composition: '95% Cotton, 5% Elastane', disposal_instructions: 'Textile recycling bin' }) }, alice);
    const { data: dpp } = await readDpp();
    expect(dpp.status).toBe('draft'); // reverted by drift

    try {
      await approve();
      throw new Error('approve should have been rejected');
    } catch (err) {
      expect(err.response?.status).toBe(400);
      const msg = err.response?.data?.error?.message || '';
      expect(msg).toMatch(/Care instructions/i);
      expect(msg).toMatch(/Repair instructions/i);
    }
  });
});
