'use strict';

// Publishing a DPP must make it consumer-visible. Runtime/item DPPs default to
// visibility 'internal' (see product-item-handlers.js), so publishDPP has to flip it to
// 'public' — otherwise the QR/consumer link resolves to 404 even after publishing.
// Regression for the "published hoodie item DPP -> /public/dpp/... 404" report.

const cds = require('@sap/cds');
const { GET, POST, axios } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } };
const DPP = 'dpp-item-tshirt-0001'; // ORG-A item DPP (active item, publishable)

const getPublic = (t) => axios.get(`/public/dpp/${t}`, { validateStatus: () => true });

describe('publishDPP makes the passport consumer-visible', () => {
  test('an internal DPP → 404; after publish it is public → 200', async () => {
    const { DPPs } = cds.entities('dpp');
    // Simulate the bug state: a DPP whose visibility is 'internal' (the default for
    // runtime/item DPPs). Mint a verifiable token (seed tokens use a different secret).
    await UPDATE(DPPs).set({ visibility: 'internal' }).where({ ID: DPP });
    const token = (await POST(`/odata/v4/dpp/DPPs('${DPP}')/DPPService.regenerateQRToken`, {}, alice)).data.qr_token;

    // Internal → the consumer endpoint must 404.
    expect((await getPublic(token)).status).toBe(404);

    // Publish → the fix flips visibility to 'public'.
    const pub = await POST(`/odata/v4/dpp/DPPs('${DPP}')/DPPService.publishDPP`, { change_reason: 'test' }, alice);
    expect(pub.data.visibility).toBe('public');
    expect(pub.data.status).toBe('published');

    // Consumer view now resolves.
    const res = await getPublic(token);
    expect(res.status).toBe(200);
    expect(res.data.product.name).toBe('Classic T-Shirt');
  });
});
