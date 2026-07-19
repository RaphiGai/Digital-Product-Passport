'use strict';

// Internal-review preview (public-handler.js): a not-yet-published (draft) DPP is served on
// the PUBLIC /public/dpp/:token endpoint ONLY to an authenticated, ACTIVE company user of the
// SAME organization. Everyone else (anonymous, other org, inactive) gets 404 so drafts never
// leak. Self-seeds its own minimal data, so it is independent of the shipped db/data seed.

const cds = require('@sap/cds');
const tokens = require('../../srv/lib/token');
const session = require('../../srv/lib/session');

const { axios } = cds.test().in(__dirname + '/../..');

const getPublic = (token, cookie) =>
  axios.get(`/public/dpp/${token}`, {
    validateStatus: () => true,
    headers: cookie ? { Cookie: cookie } : {}
  });

const cookieFor = (uid) =>
  `dpp_session=${session.sign({ uid, sub: uid, role: 'company_advanced', tenant: 'x' }, { scope: 'full' })}`;

let draftToken;

beforeAll(async () => {
  const { Organizations, Users, Products, DPPs } = cds.entities('dpp');
  await INSERT.into(Organizations).entries(
    { ID: 'prev-o-a', legal_name: 'Preview Org A', tenant_id: 'PREV-A' },
    { ID: 'prev-o-b', legal_name: 'Preview Org B', tenant_id: 'PREV-B' }
  );
  await INSERT.into(Users).entries(
    { ID: 'prev-u-a', email: 'a@prev.example', username: 'prev.rev.a', organization_ID: 'prev-o-a', role: 'company_advanced', active: true },
    { ID: 'prev-u-b', email: 'b@prev.example', username: 'prev.rev.b', organization_ID: 'prev-o-b', role: 'company_advanced', active: true },
    { ID: 'prev-u-x', email: 'x@prev.example', username: 'prev.rev.x', organization_ID: 'prev-o-a', role: 'company_advanced', active: false }
  );
  await INSERT.into(Products).entries(
    { ID: 'prev-p-a', owning_organization_ID: 'prev-o-a', name: 'Draft Preview Product', product_type: 'finished', status: 'draft' }
  );
  draftToken = tokens.generate();
  await INSERT.into(DPPs).entries({
    ID: 'prev-dpp-draft', product_ID: 'prev-p-a', dpp_type: 'product',
    status: 'draft', visibility: 'internal', current_version: 1, qr_token: draftToken
  });
});

describe('draft DPP internal-review preview', () => {
  test('an anonymous request is rejected (404) — drafts never leak publicly', async () => {
    expect((await getPublic(draftToken)).status).toBe(404);
  });

  test('a same-org active company reviewer gets a live preview (200 + preview flag)', async () => {
    const res = await getPublic(draftToken, cookieFor('prev-u-a'));
    expect(res.status).toBe(200);
    expect(res.data.preview).toBe(true);
    expect(res.data.identification.dpp_id).toBe('prev-dpp-draft');
  });

  test('a reviewer from another organization is denied (404)', async () => {
    expect((await getPublic(draftToken, cookieFor('prev-u-b'))).status).toBe(404);
  });

  test('an inactive user is denied (404)', async () => {
    expect((await getPublic(draftToken, cookieFor('prev-u-x'))).status).toBe(404);
  });
});
