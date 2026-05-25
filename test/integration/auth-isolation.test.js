'use strict';

const cds = require('@sap/cds');
const { GET, expect } = cds.test().in(__dirname + '/../..');

const aliceAdvanced = { auth: { username: 'alice.advanced', password: 'x' } };
const eveEndUser    = { auth: { username: 'eve.enduser',    password: 'x' } };

/**
 * NOTE (May 2026):
 *   The full role/tenant restrictions in dpp-service.cds + authority-service.cds
 *   are temporarily relaxed to `authenticated-user` because the BTP UCC
 *   learn-tenant does not let us assign role collections in the cockpit, and the
 *   CAP 9 middleware hooks do not reliably let us project app-managed roles onto
 *   req.user before @restrict evaluation. The detailed tenant-isolation tests
 *   from the previous iteration (Greenline vs Fashionista, viewer-only Carol,
 *   etc.) live in git history (commit 3f46dde) and will come back when role
 *   gating is reinstated.
 */
describe('Service smoke tests (auth required, no role gating)', () => {
  test('authenticated user can list Products on DPPService', async () => {
    const { data } = await GET(
      '/odata/v4/dpp/Products?$select=ID,owning_organization_ID',
      aliceAdvanced
    );
    expect(Array.isArray(data.value)).toBe(true);
    expect(data.value.length).toBeGreaterThan(0);
  });

  test('authenticated user can read DPPs on AuthorityService', async () => {
    const { data } = await GET(
      '/odata/v4/authority/DPPs?$select=ID,product_ID',
      eveEndUser
    );
    expect(Array.isArray(data.value)).toBe(true);
  });
});
