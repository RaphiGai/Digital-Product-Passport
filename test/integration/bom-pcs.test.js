'use strict';

const cds = require('@sap/cds');

const { POST, GET } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } };

describe('Aggregation with a per-piece (pcs) BOM component', () => {
  test('pcs component contributes count × per-piece CO2; pcs without mass stays out of recycled', async () => {
    // Add an external button to the seeded T-shirt variant: 2 pcs × 0.5 kg CO2e/piece.
    const { status } = await POST(
      '/odata/v4/dpp/ProductBOMs',
      {
        ID: 'test-bom-button',
        parent_ID: 'var-tshirt-blue-m',
        component_ID: null,
        component_name: 'Horn button',
        quantity: 2,
        unit: 'pcs',
        external_dpp_url: 'https://supplier.example/dpp/button',
        ext_co2_footprint: 0.5,
        ext_recycled_content_pct: 50,
        is_mandatory: true,
        status: 'active'
      },
      alice
    );
    expect(status).toBe(201);

    const { data } = await GET(
      "/odata/v4/dpp/DPPs('dpp-12345')/DPPService.aggregatedFootprint()",
      alice
    );
    // 2.4 (own) + 15×0.171 (cotton) + 20×0.009 (elastane) + 0.01×1 (polybag) + 0.5×2 (button) = 6.155.
    expect(Number(data.co2_footprint_kg)).toBeCloseTo(6.155, 2);
    // Recycled is mass-weighted; the pcs button has no mass basis → excluded → still 14.25 %.
    expect(Number(data.recycled_content_pct)).toBeCloseTo(14.25, 2);
    expect(data.incomplete).toBe(false);
  });
});
