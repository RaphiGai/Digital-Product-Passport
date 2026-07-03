'use strict';

// Epic 12 — the scalability proof: 'electronics' exists ONLY as seed data
// (ProductCategories + AttributeDefinitions/Sections + CategoryRequirements
// rows — no code, no new tables), yet a full passport lifecycle works end to
// end: category-specific form catalogue, mandatory gate on energy_class,
// approve → publish, and a consumer passport with electronics sections and
// zero textile fields.

const cds = require('@sap/cds');

const { GET, POST, PATCH, axios } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } };

const fetchCatalogue = async (code) => {
  const r = await GET(`/odata/v4/dpp/fieldCatalogue(category='${code}')`, alice);
  return JSON.parse(r.data.value ?? r.data);
};

const action = (path, payload = {}) => POST(path, payload, alice);
const getPublic = (token) => axios.get(`/public/dpp/${token}`, { validateStatus: () => true });

describe('electronics — a category that exists only as master data', () => {
  test('fieldCatalogue serves the electronics field set; no textile fields', async () => {
    const cat = await fetchCatalogue('electronics');
    expect(cat.category).toBe('electronics');
    const keys = cat.fields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['energy_class', 'spare_parts_available_until', 'name', 'brand']));
    expect(keys).not.toContain('fibre_composition');
    expect(keys).not.toContain('care_instructions');

    const energy = cat.fields.find((f) => f.key === 'energy_class');
    expect(energy.mandatory).toBe(true);
    expect(energy.locked).toBe(true);
    expect(energy.options.map((o) => o.value)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

    const sections = cat.sections.map((s) => s.key);
    expect(sections).toEqual(expect.arrayContaining(['energy', 'service']));
    expect(sections).not.toContain('materials');
  });

  test('bag validation enforces the electronics definitions (enum + date)', async () => {
    const bad = await POST('/odata/v4/dpp/Products', {
      ID: 'elec-bad', name: 'Bad Speaker', brand: 'Volt', category_code: 'electronics',
      product_type: 'finished',
      attributes: JSON.stringify({ energy_class: 'Z' })
    }, alice).catch((e) => e.response);
    expect(bad.status).toBe(400);
    expect(bad.data.error.message).toMatch(/Energy efficiency class must be one of/);

    const badDate = await POST('/odata/v4/dpp/Products', {
      ID: 'elec-bad2', name: 'Bad Speaker 2', brand: 'Volt', category_code: 'electronics',
      product_type: 'finished',
      attributes: JSON.stringify({ spare_parts_available_until: 'next year' })
    }, alice).catch((e) => e.response);
    expect(badDate.status).toBe(400);
  });

  test('full lifecycle: create → gate demands energy_class → approve → publish → consumer sections', async () => {
    // Product WITHOUT the mandatory electronics fields (drafts may have gaps).
    const p = await action('/odata/v4/dpp/Products', {
      ID: 'elec-speaker', name: 'Smart Speaker X', brand: 'Volt',
      category_code: 'electronics', product_type: 'finished',
      country_of_origin: 'DE', substances_of_concern: 'None',
      espr_compliance: 'compliant',
      attributes: JSON.stringify({ battery_removable: true })
    });
    expect(p.status).toBe(201);

    const v = await action('/odata/v4/dpp/ProductVariants', {
      ID: 'elec-speaker-std', product_ID: 'elec-speaker', sku: 'SPK-X-STD', weight_g: 800, status: 'active'
    });
    expect(v.status).toBe(201);

    await action('/odata/v4/dpp/ProductBOMs', {
      ID: 'elec-speaker-bom-1', parent_ID: 'elec-speaker-std',
      component_name: 'Speaker driver', component_composition: 'NdFeB magnet, paper cone',
      quantity: 2, unit: 'pcs', status: 'active'
    });

    const b = await action('/odata/v4/dpp/Batches', {
      ID: 'elec-batch-1', variant_ID: 'elec-speaker-std', batch_number: 'EL-2026-01',
      production_date: '2026-06-01', country_of_origin: 'DE'
    });
    expect(b.status).toBe(201);
    await PATCH("/odata/v4/dpp/Batches('elec-batch-1')", { status: 'approved' }, alice);

    const d = await action('/odata/v4/dpp/DPPs', {
      ID: 'dpp-elec-speaker', product_ID: 'elec-speaker', batch_ID: 'elec-batch-1', variant_ID: 'elec-speaker-std'
    });
    expect(d.status).toBe(201);

    // Approve gate: the CATEGORY's mandatory fields block — with electronics
    // wording, not textile wording.
    const rejected = await POST("/odata/v4/dpp/DPPs('dpp-elec-speaker')/DPPService.approveDPP", {}, alice)
      .catch((e) => e.response);
    expect(rejected.status).toBe(400);
    expect(rejected.data.error.message).toMatch(/Energy efficiency class/);
    expect(rejected.data.error.message).toMatch(/Spare parts available until is required/);
    expect(rejected.data.error.message).not.toMatch(/Fibre composition/);

    // Fill the electronics fields → approve + publish succeed.
    await PATCH("/odata/v4/dpp/Products('elec-speaker')", {
      attributes: JSON.stringify({
        energy_class: 'B',
        battery_removable: true,
        spare_parts_available_until: '2033-06-01',
        software_update_until: '2031-06-01',
        repair_manual_url: 'https://volt.example/manuals/spk-x'
      })
    }, alice);
    const approved = await POST("/odata/v4/dpp/DPPs('dpp-elec-speaker')/DPPService.approveDPP", {}, alice);
    expect(approved.data.status).toBe('approved');
    const published = await POST("/odata/v4/dpp/DPPs('dpp-elec-speaker')/DPPService.publishDPP",
      { change_reason: 'First electronics passport' }, alice);
    expect(published.data.status).toBe('published');
    expect(published.data.qr_token).toBeTruthy();

    // Make it consumer-visible and fetch the frozen snapshot.
    const { DPPs } = cds.entities('dpp');
    await UPDATE(DPPs).set({ visibility: 'public' }).where({ ID: 'dpp-elec-speaker' });
    const pub = await getPublic(published.data.qr_token);
    expect(pub.status).toBe(200);
    const dto = pub.data;

    const sectionKeys = (dto.attribute_sections || []).map((s) => s.key);
    expect(sectionKeys).toEqual(expect.arrayContaining(['energy', 'service']));
    expect(sectionKeys).not.toContain('care');
    expect(sectionKeys).not.toContain('materials');

    const energy = dto.attribute_sections.find((s) => s.key === 'energy')
      .fields.find((f) => f.key === 'energy_class');
    expect(energy.value).toBe('B');
    expect(energy.label).toBe('Energy efficiency class');

    // No textile keys anywhere in the consumer payload's product block.
    expect(dto.product).not.toHaveProperty('fibre_composition');
    expect(dto.product.name).toBe('Smart Speaker X');
    // BOM tree carries the generic composition field.
    expect(dto.materials[0].composition).toBe('NdFeB magnet, paper cone');
  });

  test('compliance expects the electronics evidence set (certificate, DoC, manual)', async () => {
    const r = await POST('/odata/v4/dpp/complianceAnalytics', {}, alice);
    const payload = JSON.parse(r.data.value ?? r.data);
    const row = payload.by_product.find((x) => x.product_id === 'elec-speaker');
    expect(row).toBeDefined();
    // no documents uploaded → all three EXPECTED electronics types are missing
    expect(row.missing_types.sort()).toEqual(['certificate', 'declaration_of_conformity', 'manual']);
  });
});
