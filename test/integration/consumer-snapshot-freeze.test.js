'use strict';

// The external DPP view must serve only the last PUBLISHED (frozen) state — never live
// data. Seed/legacy DPPs are marked 'published' but ship without a consumer_snapshot, so
// they used to fall back to LIVE rendering (edits/re-approvals leaked to the public view).
// freezeLegacyConsumerSnapshots() closes that: it freezes their current state as a publish
// version so the public view is publish-gated like app-published DPPs.

const cds = require('@sap/cds');
const tokens = require('../../srv/lib/token');
const dppHandlers = require('../../srv/handlers/dpp-handlers');

const { POST, axios } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } };
const DPP = 'dpp-12345';
const PRODUCT = 'prod-tshirt-classic';

// Mint a verifiable token for the seed DPP (seed tokens are placeholders).
async function attachToken(dppId) {
  const { DPPs } = cds.entities('dpp');
  const token = tokens.generate();
  await UPDATE(DPPs).set({ qr_token: token }).where({ ID: dppId });
  return token;
}
const getPublic = (token) => axios.get(`/public/dpp/${token}`, { validateStatus: () => true });
const snapshotRows = async () => {
  const { DPPVersions } = cds.entities('dpp');
  const rows = await SELECT.from(DPPVersions).columns('ID', 'consumer_snapshot').where({ dpp_ID: DPP });
  return rows.filter((v) => v.consumer_snapshot);
};

describe('External view is publish-gated for legacy/seed DPPs', () => {
  test('freeze creates a consumer snapshot; live edits stay invisible until publish', async () => {
    const { Products } = cds.entities('dpp');

    // Precondition: a seed DPP has no frozen consumer snapshot (would render live).
    expect((await snapshotRows()).length).toBe(0);

    // Freeze → exactly one consumer snapshot; idempotent on a second call.
    await dppHandlers.freezeLegacyConsumerSnapshots();
    expect((await snapshotRows()).length).toBe(1);
    await dppHandlers.freezeLegacyConsumerSnapshots();
    expect((await snapshotRows()).length).toBe(1);

    const origName = (await SELECT.one.from(Products).columns('name').where({ ID: PRODUCT })).name;

    // The public view serves the frozen state.
    let res = await getPublic(await attachToken(DPP));
    expect(res.status).toBe(200);
    expect(res.data.product.name).toBe(origName);

    // A live edit of the underlying product must NOT change the public view.
    await UPDATE(Products).set({ name: 'LEAKED NAME' }).where({ ID: PRODUCT });
    res = await getPublic(await attachToken(DPP));
    expect(res.data.product.name).toBe(origName);
    expect(res.data.product.name).not.toBe('LEAKED NAME');

    // Publishing freezes the new state → the public view now reflects the change.
    await POST(`/odata/v4/dpp/DPPs('${DPP}')/DPPService.publishDPP`, { change_reason: 'rename' }, alice);
    res = await getPublic(await attachToken(DPP));
    expect(res.data.product.name).toBe('LEAKED NAME');
  });
});
