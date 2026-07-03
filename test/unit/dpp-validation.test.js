'use strict';

// Unified DPP validation catalogue (srv/lib/dpp-validation.js): the single
// evaluation behind the approve/publish gate, validationStatus and
// validationOverview. These tests pin the gate semantics:
//  - espr_compliance must be 'compliant' (strict, not presence-only)
//  - QR token / visibility never block (publish provides them itself)
//  - item checks gate only item passports; BOM checks gate only finished products
//  - field checks keep the `<label> is required.` message format

const { evaluateDppChecks } = require('../../srv/lib/dpp-validation');
const { MANDATORY } = require('../../srv/lib/mandatory-fields');
const { catalogueFixture } = require('../helpers/catalogue-fixture');

// Field-presence checks are catalogue-driven since Epic 12 — evaluate against the
// REAL textiles seed definitions (pinned to the legacy lists by catalogue-parity).
const catalogue = catalogueFixture();

const fullContext = () => ({
  catalogue,
  dpp: {
    ID: 'd1', dpp_type: 'item', status: 'draft', visibility: 'internal',
    product_ID: 'p1', batch_ID: 'b1', item_ID: 'i1', qr_token: null, public_url: null
  },
  product: {
    ID: 'p1', product_type: 'finished', name: 'Tee', brand: 'Greenline',
    category_code: 'textiles', country_of_origin: 'PT',
    substances_of_concern: 'None', espr_compliance: 'compliant',
    // category-specific fields live in the attributes bag (Epic 12 migration)
    attributes: {
      fibre_composition: '100% Cotton', care_instructions: 'Wash 30',
      repair_instructions: 'Sew', disposal_instructions: 'Recycle'
    }
  },
  variant: { ID: 'v1', status: 'active', sku: 'SKU-1', gtin: null, attributes: { size: 'M', color: 'Blue' } },
  batch: {
    ID: 'b1', status: 'approved', batch_number: 'B-1', production_date: '2026-05-01',
    country_of_origin: 'PT', factory_ID: 'f1', supplier_ID: null,
    co2_footprint_kg: 2.4, recycled_content_pct: null
  },
  item: { ID: 'i1', status: 'active' },
  bom: [{ ID: 'e1', quantity: 5, unit: 'g' }],
  batchComponents: []
});

const byKey = (result, key) => result.checks.find((c) => c.key === key);

describe('dpp-validation — gate semantics', () => {
  test('a complete item passport is approvable', () => {
    const v = evaluateDppChecks(fullContext());
    expect(v.gate_errors).toEqual([]);
    expect(v.can_approve).toBe(true);
    expect(v.score).toBe(`${v.passed}/${v.total}`);
  });

  test('missing QR token and internal visibility never block (publish provides them)', () => {
    const v = evaluateDppChecks(fullContext()); // no qr_token, visibility 'internal'
    expect(v.can_approve).toBe(true);
    expect(byKey(v, 'qr_available').passed).toBe(false);
    expect(byKey(v, 'qr_available').gate).toBe(false);
    expect(byKey(v, 'visibility_ready').gate).toBe(false);
  });

  test('espr_compliance below "compliant" blocks approval (strict check)', () => {
    const ctx = fullContext();
    ctx.product.espr_compliance = 'draft';
    const v = evaluateDppChecks(ctx);
    expect(v.can_approve).toBe(false);
    expect(v.gate_errors).toContain('ESPR compliance status must be Compliant.');
  });

  test('field checks keep the "<label> is required." message format', () => {
    const ctx = fullContext();
    ctx.product.attributes.care_instructions = '';
    ctx.product.attributes.repair_instructions = null;
    const v = evaluateDppChecks(ctx);
    expect(v.gate_errors).toContain('Care instructions is required.');
    expect(v.gate_errors).toContain('Repair instructions is required.');
  });

  test('an unapproved batch blocks approval', () => {
    const ctx = fullContext();
    ctx.batch.status = 'draft';
    const v = evaluateDppChecks(ctx);
    expect(v.gate_errors).toContain('Batch must be approved.');
  });

  test('a missing batch blocks approval', () => {
    const ctx = fullContext();
    ctx.batch = null;
    ctx.dpp.batch_ID = null;
    const v = evaluateDppChecks(ctx);
    expect(v.gate_errors).toContain('The DPP must reference a production batch.');
  });

  test('item checks gate item passports only', () => {
    // Product-level passport without an item → no item checks at all.
    const productDpp = fullContext();
    productDpp.dpp.dpp_type = 'product';
    productDpp.dpp.item_ID = null;
    productDpp.item = null;
    const v1 = evaluateDppChecks(productDpp);
    expect(byKey(v1, 'item_exists')).toBeUndefined();
    expect(v1.can_approve).toBe(true);

    // Item passport without an item → gate error.
    const itemDpp = fullContext();
    itemDpp.item = null;
    const v2 = evaluateDppChecks(itemDpp);
    expect(v2.gate_errors).toContain('The DPP must reference an item.');

    // Sold item → gate error.
    const soldItem = fullContext();
    soldItem.item.status = 'sold';
    const v3 = evaluateDppChecks(soldItem);
    expect(v3.gate_errors).toContain('Item must be active.');
  });

  test('BOM checks gate finished products only', () => {
    // Material without a BOM → informational only, still approvable.
    const material = fullContext();
    material.dpp.dpp_type = 'product';
    material.dpp.item_ID = null;
    material.item = null;
    material.product.product_type = 'material';
    material.bom = [];
    const v1 = evaluateDppChecks(material);
    expect(v1.can_approve).toBe(true);
    expect(byKey(v1, 'bom_exists').passed).toBe(false);
    expect(byKey(v1, 'bom_exists').gate).toBe(false);

    // Finished product without a BOM → gate error.
    const finished = fullContext();
    finished.bom = [];
    const v2 = evaluateDppChecks(finished);
    expect(v2.gate_errors).toContain('Bill of materials is missing.');

    // Incomplete BOM lines → gate errors.
    const incomplete = fullContext();
    incomplete.bom = [{ ID: 'e1', quantity: null, unit: '' }];
    const v3 = evaluateDppChecks(incomplete);
    expect(v3.gate_errors).toContain('Every BOM component needs a quantity.');
    expect(v3.gate_errors).toContain('Every BOM component needs a unit.');
  });

  test('every field in the MANDATORY catalogue surfaces as a gate check (lists cannot drift)', () => {
    const ctx = fullContext();
    ctx.product = { ID: 'p1', product_type: '' }; // everything missing
    ctx.batch = { ID: 'b1', status: 'approved' };
    const v = evaluateDppChecks(ctx);
    const failedGateKeys = v.missing_mandatory.map((m) => m.key);
    for (const f of MANDATORY.product) {
      const key = f.key === 'product_type' ? 'product_type'
        : f.key === 'espr_compliance' ? 'espr_compliance'
          : `product_${f.key}`;
      expect(failedGateKeys).toContain(key);
    }
    for (const f of MANDATORY.batch) {
      const key = f.key === 'batch_number' ? 'batch_number' : `batch_${f.key}`;
      expect(failedGateKeys).toContain(key);
    }
  });

  test('summary counters are consistent', () => {
    const ctx = fullContext();
    ctx.product.espr_compliance = 'in_review';
    const v = evaluateDppChecks(ctx);
    expect(v.checks.filter((c) => c.passed).length).toBe(v.passed);
    expect(v.total).toBe(v.checks.length);
    expect(v.mandatory_failed).toBeGreaterThanOrEqual(v.missing_mandatory.length);
    expect(v.percent).toBe(Math.round((v.passed / v.total) * 100));
    // every gate check is also mandatory (gate ⊆ mandatory)
    for (const c of v.checks) if (c.gate) expect(c.mandatory).toBe(true);
  });
});
