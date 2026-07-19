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

    // ...and the unapproved-changes diff that drives the internal field markers.
    expect(v.has_unapproved).toBe(true);
    expect(v.unapproved_changes.some((c) => c.path === 'product.model')).toBe(true);
  });

  test('re-approve preserves the old state as an approve-version; re-publish makes the new state live', async () => {
    const a = await approve();
    expect(a.data.status).toBe('approved');

    // Approve re-anchored the baseline: the internal field markers are cleared,
    // but the consumer live version is still the old v1 → publish is pending.
    const afterApprove = await validation();
    expect(afterApprove.has_unapproved).toBe(false);
    expect(afterApprove.pending_changes).toBe(true);

    // The approve-snapshot must NOT leak to the consumer — still frozen v1.
    const pubBefore = await getPublic(token);
    expect(pubBefore.status).toBe(200);
    expect(pubBefore.data.version).toBe(1);
    expect(pubBefore.data.product.model).not.toBe('Edited Model 2026');

    // Publish → v3 (v2 was consumed by the approve-snapshot of the old state).
    const p = await publish('publish with new model');
    expect(p.data.current_version).toBe(3);

    const pub = await getPublic(token);
    expect(pub.status).toBe(200);
    expect(pub.data.version).toBe(3);
    expect(pub.data.product.model).toBe('Edited Model 2026');

    // History: v1 publish (old), v2 approve-snapshot (old state, no consumer payload),
    // v3 publish (new state).
    const { data } = await GET(`/odata/v4/dpp/DPPVersions?$filter=dpp_ID eq '${DPP}'&$orderby=version_number desc`, alice);
    const byNumber = Object.fromEntries(data.value.map((x) => [x.version_number, x]));
    expect(byNumber[1].source).toBe('publish');
    expect(byNumber[2].source).toBe('approve');
    expect(byNumber[2].consumer_snapshot ?? null).toBeNull();
    expect(JSON.parse(byNumber[2].snapshot_data).product.model).not.toBe('Edited Model 2026');
    expect(byNumber[3].source).toBe('publish');

    // No net change after publishing → no pending changes.
    const v = await validation();
    expect(v.pending_changes).toBe(false);
  });

  test('approve lists ALL missing mandatory fields (full catalogue), not just the legacy four', async () => {
    // Clear two catalogue-mandatory fields → editing reverts to draft → approve must list both.
    await PATCH(`/odata/v4/dpp/Products('${PRODUCT}')`, { care_instructions: null, repair_instructions: null }, alice);
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

    // The gate fires BEFORE the approve-snapshot is written — a rejected approve
    // must not add a version row (history still v1/v2/v3 from the tests above).
    const { data } = await GET(`/odata/v4/dpp/DPPVersions?$filter=dpp_ID eq '${DPP}'`, alice);
    expect(data.value.length).toBe(3);
  });
});
