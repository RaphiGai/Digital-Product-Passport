'use strict';

// End-to-end check of the shipped seed data: both finished products must resolve
// cleanly through the public consumer endpoint using their SEED QR tokens (signed
// with QR_TOKEN_HMAC_SECRET), with linked component passports + rolled-up footprint.
// NOTE: the seed tokens are signed with the dev default secret
// (change-me-to-a-long-random-string). If that secret changes, regenerate the seed
// tokens (db/data/dpp-DPPs.csv + dpp-QRCodes.csv).

const cds = require('@sap/cds');

const { axios } = cds.test().in(__dirname + '/../..');

const TSHIRT_TOKEN = 'e1fdd917-e3e5-4b53-acfa-bbd55d9666e4.RZsqxfAj5IG6WTxWBPqOj9P1SgoCnvtJGElVhTzJolA';
const JACKET_TOKEN = 'd054bcef-1b87-485f-929c-659e76654710.jiayKDa-HXcHe8J7dLnp4XtTpG9H2vqZrZinmx0cvNI';

describe('Seed data: two finished products render via their public DPP', () => {
  test('Classic T-Shirt — cotton (internal), elastane + polybag (external), footprint rolled up', async () => {
    const { data } = await axios.get(`/public/dpp/${TSHIRT_TOKEN}`);
    expect(data.product.name).toBe('Classic T-Shirt');

    const cotton = data.materials.find((m) => m.component_ID === 'prod-mat-cotton');
    expect(cotton.sub_dpp?.id).toBe('dpp-cotton');

    const elastane = data.materials.find((m) => m.name === 'Elastane Yarn');
    expect(elastane.external_dpp_url).toMatch(/^https?:\/\//);
    expect(elastane.sub_dpp).toBeNull();

    // External packaging is shown with its supplier link, no batch number leaked.
    const polybag = data.materials.find((m) => m.name === 'Compostable Polybag');
    expect(polybag.external_dpp_url).toMatch(/polybag-2026/);
    expect(polybag.external_batch_number).toBeUndefined();

    expect(data.aggregated.values.co2_footprint_kg).toBeCloseTo(5.155, 2);
    expect(data.aggregated.values.recycled_content_pct).toBeCloseTo(14.25, 2);
  });

  test('Eco Denim Jacket — denim (2 batches avg), lining, button & box internal, zipper external', async () => {
    const { data } = await axios.get(`/public/dpp/${JACKET_TOKEN}`);
    expect(data.product.name).toBe('Eco Denim Jacket');

    // Denim sourced from two component batches → link is the first item's DPP of one of them.
    const denim = data.materials.find((m) => m.component_ID === 'prod-mat-denim');
    expect(['dpp-item-denim-A-0001', 'dpp-item-denim-B-0001']).toContain(denim.sub_dpp?.id);

    const lining = data.materials.find((m) => m.component_ID === 'prod-mat-lining');
    expect(lining.sub_dpp?.id).toBe('dpp-item-lining-0001');

    // Internal button + internal packaging link to their batch's first item DPP.
    const button = data.materials.find((m) => m.component_ID === 'prod-comp-button');
    expect(button.sub_dpp?.id).toBe('dpp-item-button-0001');
    const box = data.materials.find((m) => m.component_ID === 'prod-pkg-box');
    expect(box.sub_dpp?.id).toBe('dpp-item-box-0001');

    // External zipper: supplier link shown, no internal passport, no batch number leaked.
    const zipper = data.materials.find((m) => m.name === 'Metal Zipper');
    expect(zipper.external_dpp_url).toMatch(/zipper-2026/);
    expect(zipper.sub_dpp).toBeNull();
    expect(zipper.external_batch_number).toBeUndefined();

    // CO2 = own 3.2 + denim mean(12,14)=13 ×0.52 + lining 8 ×0.12 + zipper 0.05 + button 0.02×4 + box 0.15 = 11.20.
    expect(data.aggregated.values.co2_footprint_kg).toBeCloseTo(11.2, 2);
    // Recycled = mass-weighted: (55×0.52 + 100×0.12 + 30×0.012 + 80×0.04) / 0.692 = 63.815 %.
    expect(data.aggregated.values.recycled_content_pct).toBeCloseTo(63.815, 2);
    expect(data.aggregated.incomplete).toBe(false);
  });
});
