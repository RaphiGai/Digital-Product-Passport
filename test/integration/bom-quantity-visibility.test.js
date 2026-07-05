'use strict';

// BOM component quantities are shown on the public materials tree only when the line is
// opted into quantity_visibility 'public' (default 'internal'). The amount always counts
// towards the CO2/recycled aggregation regardless (display-only flag).

const cds = require('@sap/cds');
const tokens = require('../../srv/lib/token');

const { axios } = cds.test().in(__dirname + '/../..');

async function attachToken(dppId) {
  const { DPPs } = cds.entities('dpp');
  const token = tokens.generate();
  await UPDATE(DPPs).set({ qr_token: token }).where({ ID: dppId });
  return token;
}
const getPublic = (t) => axios.get(`/public/dpp/${t}`, { validateStatus: () => true });
const cottonOf = (data) => data.materials.find((m) => m.component_ID === 'prod-mat-cotton');

describe('BOM quantity visibility on the consumer view', () => {
  test('quantity is hidden by default (internal) and shown when set public', async () => {
    const { ProductBOMs } = cds.entities('dpp');
    const token = await attachToken('dpp-12345'); // published+public, live-rendered in tests

    // Internal (default) → the component is still listed, but its quantity is omitted.
    await UPDATE(ProductBOMs).set({ quantity_visibility: 'internal' }).where({ ID: 'bom-tshirt-cotton' });
    let cotton = cottonOf((await getPublic(token)).data);
    expect(cotton).toBeTruthy();
    expect(cotton.quantity == null).toBe(true);
    expect(cotton.unit == null).toBe(true);

    // Public → quantity + unit appear.
    await UPDATE(ProductBOMs).set({ quantity_visibility: 'public' }).where({ ID: 'bom-tshirt-cotton' });
    cotton = cottonOf((await getPublic(token)).data);
    expect(cotton.quantity != null).toBe(true);
    expect(Number(cotton.quantity)).toBeGreaterThan(0);
  });
});
