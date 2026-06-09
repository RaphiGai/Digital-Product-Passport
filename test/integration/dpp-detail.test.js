'use strict';

const cds = require('@sap/cds');

const { GET } = cds.test().in(__dirname + '/../..');

const aliceAdmin = { auth: { username: 'alice.advanced', password: 'x' } };

describe('DPP list provenance (nested expand) + live aggregation function', () => {
  test('DPP list expands product/variant/batch and orders by createdAt', async () => {
    const { data } = await GET(
      '/odata/v4/dpp/DPPs?$expand=product,variant,batch($expand=variant)&$orderby=createdAt desc&$top=100',
      aliceAdmin
    );
    expect(data.value.length).toBeGreaterThan(0);

    const tshirt = data.value.find((d) => d.ID === 'dpp-12345');
    expect(tshirt).toBeDefined();
    expect(tshirt.product.name).toBe('Classic T-Shirt');
    expect(tshirt.batch.batch_number).toBe('2026-05-A');
    // Batch-level DPP has no own variant link → resolved via the batch.
    expect(tshirt.variant).toBeNull();
    expect(tshirt.batch.variant.sku).toBe('TSHIRT-BLUE-M');
  });

  test('aggregatedFootprint() returns the live BOM rollup for review', async () => {
    const { data } = await GET(
      "/odata/v4/dpp/DPPs('dpp-12345')/DPPService.aggregatedFootprint()",
      aliceAdmin
    );
    // 2.4 (cut&sew) + 15.0×0.171 (cotton) + 20.0×0.009 (elastane) + 0.01×1 (polybag, external) = 5.155.
    expect(Number(data.co2_footprint_kg)).toBeCloseTo(5.155, 2);
    expect(Number(data.recycled_content_pct)).toBeCloseTo(14.25, 2);
    expect(data.incomplete).toBe(false);
    const missing = JSON.parse(data.missing);
    expect(missing.length).toBe(0);

    // Per-component breakdown: own production + each component sums to the total.
    const bd = JSON.parse(data.breakdown);
    expect(Number(bd.own_co2_kg)).toBeCloseTo(2.4, 2);
    const sum = Number(bd.own_co2_kg) + bd.components.reduce((s, c) => s + (c.co2_kg ?? 0), 0);
    expect(sum).toBeCloseTo(5.155, 2);
    const cotton = bd.components.find((c) => c.name === 'Organic Cotton Fabric');
    expect(Number(cotton.co2_kg)).toBeCloseTo(2.565, 2);
  });
});
