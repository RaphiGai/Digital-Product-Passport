'use strict';

// Approve-snapshot semantics: editing source data marks the changed fields as
// "unapproved" on the internal view (validationStatus.unapproved_changes); approving
// clears the markers, preserves the superseded state as a source='approve' version
// (never served to consumers) and makes the new data the internal baseline; only
// publishing moves the consumer view forward.

const cds = require('@sap/cds');
const tokens = require('../../srv/lib/token');

const { GET, POST, PATCH, axios } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // ORG-A advanced
const DPP = 'dpp-item-tshirt-0001';
const DPP_FIRST = 'dpp-item-tshirt-0002'; // draft seed — never approved before
const PRODUCT = 'prod-tshirt-classic';
const OLD_MODEL = 'Classic Tee 2026'; // seeded product model (data "A")
const NEW_MODEL = 'Approve Snapshot Model'; // data "B"

const getPublic = (token) => axios.get(`/public/dpp/${token}`, { validateStatus: () => true });
const publish = (id, reason) =>
  POST(`/odata/v4/dpp/DPPs('${id}')/DPPService.publishDPP`, { change_reason: reason }, alice);
const approve = (id) => POST(`/odata/v4/dpp/DPPs('${id}')/DPPService.approveDPP`, {}, alice);
const validation = async (id) => {
  const r = await GET(`/odata/v4/dpp/DPPs('${id}')/DPPService.validationStatus`, alice);
  return JSON.parse(r.data.value ?? r.data);
};
const versionsOf = async (id) => {
  const { data } = await GET(
    `/odata/v4/dpp/DPPVersions?$filter=dpp_ID eq '${id}'&$orderby=version_number asc`, alice);
  return data.value;
};

async function attachToken(id) {
  const { DPPs } = cds.entities('dpp');
  const token = tokens.generate();
  await UPDATE(DPPs).set({ qr_token: token }).where({ ID: id });
  return token;
}

describe('approve-snapshot lifecycle (old data preserved, markers cleared, consumer unaffected)', () => {
  let token;

  test('publish freezes data A for the consumer', async () => {
    token = await attachToken(DPP);
    const r = await publish(DPP, 'baseline A');
    expect(r.data.status).toBe('published');
    const pub = await getPublic(token);
    expect(pub.status).toBe(200);
    expect(pub.data.product.model).toBe(OLD_MODEL);
  });

  test('editing marks the field as unapproved; the consumer still sees data A', async () => {
    await PATCH(`/odata/v4/dpp/Products('${PRODUCT}')`, { model: NEW_MODEL }, alice);

    const v = await validation(DPP);
    expect(v.has_unapproved).toBe(true);
    const change = v.unapproved_changes.find((c) => c.path === 'product.model');
    expect(change).toBeTruthy();
    expect(change.old).toBe(OLD_MODEL);
    expect(change.new).toBe(NEW_MODEL);

    const pub = await getPublic(token);
    expect(pub.data.product.model).toBe(OLD_MODEL);
  });

  test('approve writes the OLD state as an approve-version, clears the markers, consumer still on A', async () => {
    const before = await versionsOf(DPP);
    const a = await approve(DPP);
    expect(a.data.status).toBe('approved');

    const after = await versionsOf(DPP);
    expect(after.length).toBe(before.length + 1);
    const snapRow = after[after.length - 1];
    expect(snapRow.source).toBe('approve');
    expect(snapRow.consumer_snapshot ?? null).toBeNull();
    expect(JSON.parse(snapRow.snapshot_data).product.model).toBe(OLD_MODEL);

    const v = await validation(DPP);
    expect(v.has_unapproved).toBe(false);      // markers cleared by the approve
    expect(v.unapproved_changes).toEqual([]);
    expect(v.live_version).toBe(1);            // consumer live version = latest PUBLISH
    expect(v.pending_changes).toBe(true);      // new data still awaits publish

    const pub = await getPublic(token);
    expect(pub.status).toBe(200);
    expect(pub.data.version).toBe(1);
    expect(pub.data.product.model).toBe(OLD_MODEL);
  });

  test('publish moves the consumer to data B', async () => {
    const p = await publish(DPP, 'release B');
    expect(p.data.status).toBe('published');

    const pub = await getPublic(token);
    expect(pub.data.product.model).toBe(NEW_MODEL);
    expect(pub.data.version).toBe(p.data.current_version);

    const v = await validation(DPP);
    expect(v.pending_changes).toBe(false);
    expect(v.has_unapproved).toBe(false);
  });

  test('a first-time approval has no superseded state → no approve-version is written', async () => {
    // dpp-item-tshirt-0002 is a draft seed blocked only by its sold item — activate it.
    const { ProductItems } = cds.entities('dpp');
    await UPDATE(ProductItems).set({ status: 'active' }).where({ ID: 'pi-tshirt-0002' });

    const a = await approve(DPP_FIRST);
    expect(a.data.status).toBe('approved');
    expect(await versionsOf(DPP_FIRST)).toEqual([]);

    // The approve anchored the baseline: no unapproved changes reported.
    const v = await validation(DPP_FIRST);
    expect(v.has_unapproved).toBe(false);
  });
});
