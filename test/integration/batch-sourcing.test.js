'use strict';

// Per-batch component sourcing: a finished-good batch references the concrete
// component batch(es) consumed. The aggregator averages their footprints (a
// batch's footprint = the DPP of its first item) and the consumer link points to
// that representative passport. External lines just carry an informational batch no.

const cds = require('@sap/cds');
const tokens = require('../../srv/lib/token');

const { axios } = cds.test().in(__dirname + '/../..');

// Build two component batches with different footprints + a finished good consuming
// the component, sourced from BOTH component batches.
async function seed() {
  const { Products, ProductVariants, Batches, ProductItems, ProductBOMs, BatchComponents, DPPs } =
    cds.entities('dpp');

  // Same tenant as the existing seed so the public handler's org-scoped product map includes ours.
  const anyProduct = await SELECT.one.from(Products).columns(['owning_organization_ID']);
  const org = anyProduct.owning_organization_ID;

  // --- Internal component with two production batches (different CO2 / recycled) ---
  await INSERT.into(Products).entries({
    ID: 'bsrc-mat', owning_organization_ID: org, product_type: 'material', name: 'BSRC Material'
  });
  await INSERT.into(ProductVariants).entries({
    ID: 'bsrc-mat-var', product_ID: 'bsrc-mat', sku: 'BSRC-MAT', status: 'active'
  });

  const itemDpp = {};
  for (const [key, b] of Object.entries({
    A: { id: 'bsrc-mat-bA', co2: 10, rec: 20 },
    B: { id: 'bsrc-mat-bB', co2: 20, rec: 40 }
  })) {
    await INSERT.into(Batches).entries({
      ID: b.id, variant_ID: 'bsrc-mat-var', batch_number: b.id,
      co2_footprint_kg: b.co2, recycled_content_pct: b.rec, status: 'approved'
    });
    const itemId = `${b.id}-item1`;
    await INSERT.into(ProductItems).entries({
      ID: itemId, batch_ID: b.id, serial_number: `${b.id}-0001`, upi: `UPI-${b.id}-0001`, status: 'active'
    });
    const dppId = `${b.id}-dpp`;
    await INSERT.into(DPPs).entries({
      ID: dppId, product_ID: 'bsrc-mat', variant_ID: 'bsrc-mat-var', batch_ID: b.id, item_ID: itemId,
      dpp_type: 'item', status: 'published', visibility: 'public', current_version: 1,
      qr_token: tokens.generate()
    });
    itemDpp[key] = dppId;
  }

  // --- Finished good consuming 1 kg of the component, no variant-default sub_dpp ---
  await INSERT.into(Products).entries({
    ID: 'bsrc-fin', owning_organization_ID: org, product_type: 'finished', name: 'BSRC Finished'
  });
  await INSERT.into(ProductVariants).entries({
    ID: 'bsrc-fin-var', product_ID: 'bsrc-fin', sku: 'BSRC-FIN', weight_g: 1000, status: 'active'
  });
  await INSERT.into(Batches).entries({
    ID: 'bsrc-fin-batch', variant_ID: 'bsrc-fin-var', batch_number: 'BSRC-FIN-A',
    co2_footprint_kg: 5, status: 'approved'
  });
  await INSERT.into(ProductBOMs).entries({
    ID: 'bsrc-bom', parent_ID: 'bsrc-fin-var', component_ID: 'bsrc-mat',
    quantity: 1000, unit: 'g', component_role: 'Main', is_mandatory: true, status: 'active'
  });

  // Source the finished batch from BOTH component batches → averaged.
  await INSERT.into(BatchComponents).entries([
    { ID: 'bsrc-bc-A', batch_ID: 'bsrc-fin-batch', bom_ID: 'bsrc-bom', component_batch_ID: 'bsrc-mat-bA' },
    { ID: 'bsrc-bc-B', batch_ID: 'bsrc-fin-batch', bom_ID: 'bsrc-bom', component_batch_ID: 'bsrc-mat-bB' }
  ]);

  const finToken = tokens.generate();
  await INSERT.into(DPPs).entries({
    ID: 'bsrc-fin-dpp', product_ID: 'bsrc-fin', batch_ID: 'bsrc-fin-batch',
    dpp_type: 'product', status: 'published', visibility: 'public', current_version: 1, qr_token: finToken
  });

  return { finToken, itemDpp };
}

describe('Per-batch component sourcing (multiple batches → averaged)', () => {
  let finToken;
  let itemDpp;

  beforeAll(async () => {
    ({ finToken, itemDpp } = await seed());
  });

  test('aggregation averages the sourced component batches; consumer links the representative item DPP', async () => {
    const { data } = await axios.get(`/public/dpp/${finToken}`);

    // CO2: own 5 + mean(10,20)=15 per kg × 1 kg = 20. Recycled: mean(20,40)=30.
    expect(data.aggregated.values.co2_footprint_kg).toBeCloseTo(20, 3);
    expect(data.aggregated.values.recycled_content_pct).toBeCloseTo(30, 3);

    // The linked sub-passport is the first item's DPP of a sourced component batch
    // (proves per-batch sourcing drives the link — the BOM line has no default sub_dpp).
    const mat = data.materials.find((m) => m.component_ID === 'bsrc-mat');
    expect(mat).toBeDefined();
    expect([itemDpp.A, itemDpp.B]).toContain(mat.sub_dpp?.id);
  });

  test('external supplier batch number is informational and does not change the calculation', async () => {
    const { BatchComponents } = cds.entities('dpp');
    await INSERT.into(BatchComponents).entries({
      ID: 'bsrc-bc-ext', batch_ID: 'bsrc-fin-batch', bom_ID: 'bsrc-bom-ext', external_batch_number: 'EXT-2026-01'
    });
    const { data } = await axios.get(`/public/dpp/${finToken}`);
    // Unrelated BOM line ('bsrc-bom-ext' not in this variant) → no effect on the totals.
    expect(data.aggregated.values.co2_footprint_kg).toBeCloseTo(20, 3);
  });
});
