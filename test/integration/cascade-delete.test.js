'use strict';

// Cascade hard-delete across the product hierarchy (srv/handlers/cascade-delete.js).
// Deleting a parent removes its whole subtree bottom-up; references that point INTO the
// subtree from other products (component links, sub-DPP links) are detached rather than
// blocking the delete. Cross-tenant deletes stay blocked by the write guard.

const cds = require('@sap/cds');
const { GET, POST, DELETE, expect } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // ORG-A
const dan = { auth: { username: 'dan.advanced.b', password: 'x' } };    // ORG-B

const P = '/odata/v4/dpp';

/** Does a persistence-level row exist? (DB read bypasses the tenant READ filter.) */
async function exists(entityName, id) {
  const E = cds.entities('dpp')[entityName];
  const row = await SELECT.one.from(E).columns('ID').where({ ID: id });
  return !!row;
}

async function expectStatus(promise, status) {
  try {
    await promise;
    throw new Error(`Expected status ${status}, but the request succeeded.`);
  } catch (err) {
    expect(err.response?.status || err.status || err.code).toBe(status);
  }
}

describe('cascade delete: full product subtree', () => {
  const ID = {
    product: 'cd-prod-1',
    variant: 'cd-var-1',
    batch: 'cd-batch-1',
    item: 'cd-item-1',
    docP: 'cd-doc-product',
    docB: 'cd-doc-batch',
    bom: 'cd-bom-1',
    // A SECOND product that uses the first as a component (external reference into the subtree).
    product2: 'cd-prod-2',
    variant2: 'cd-var-2',
    bom2: 'cd-bom-2'
  };
  let itemDppId;

  beforeAll(async () => {
    const { Documents, ProductBOMs, DPPs } = cds.entities('dpp');

    await POST(`${P}/Products`, { ID: ID.product, name: 'Cascade Product', product_type: 'finished' }, alice);
    await POST(`${P}/ProductVariants`, { ID: ID.variant, product_ID: ID.product, sku: 'CD-SKU-1' }, alice);
    await POST(`${P}/Batches`, { ID: ID.batch, variant_ID: ID.variant, batch_number: 'CD-B-1' }, alice);
    // Creating an item auto-creates its item-level DPP + active QR (product-item-handlers.js).
    await POST(`${P}/ProductItems`, { ID: ID.item, batch_ID: ID.batch, serial_number: 'CD-S-1' }, alice);
    itemDppId = (await SELECT.one.from(DPPs).columns('ID').where({ item_ID: ID.item })).ID;

    // A product-level and a batch-level document (inserted at DB level to skip the file/partner
    // create rule — the cascade must delete whatever rows exist).
    await INSERT.into(Documents).entries(
      { ID: ID.docP, product_ID: ID.product, doc_type: 'certificate', title: 'Cert P' },
      { ID: ID.docB, batch_ID: ID.batch, doc_type: 'certificate', title: 'Cert B' }
    );
    // A BOM line under our own variant.
    await INSERT.into(ProductBOMs).entries({ ID: ID.bom, parent_ID: ID.variant, component_name: 'Thread', quantity: 1 });

    // Second product whose BOM line references product-1 as a component AND its item DPP as sub_dpp.
    await POST(`${P}/Products`, { ID: ID.product2, name: 'Consumer Product', product_type: 'finished' }, alice);
    await POST(`${P}/ProductVariants`, { ID: ID.variant2, product_ID: ID.product2, sku: 'CD-SKU-2' }, alice);
    await INSERT.into(ProductBOMs).entries({
      ID: ID.bom2, parent_ID: ID.variant2, component_ID: ID.product, sub_dpp_ID: itemDppId, quantity: 1
    });
  });

  test('a foreign org cannot delete the product (guard runs before cascade)', async () => {
    await expectStatus(DELETE(`${P}/Products('${ID.product}')`, dan), 403);
    expect(await exists('Products', ID.product)).toBe(true);
  });

  test('the owner deletes the product and the whole subtree is gone', async () => {
    const r = await DELETE(`${P}/Products('${ID.product}')`, alice);
    expect(r.status).toBe(204);

    expect(await exists('Products', ID.product)).toBe(false);
    expect(await exists('ProductVariants', ID.variant)).toBe(false);
    expect(await exists('Batches', ID.batch)).toBe(false);
    expect(await exists('ProductItems', ID.item)).toBe(false);
    expect(await exists('DPPs', itemDppId)).toBe(false);
    expect(await exists('Documents', ID.docP)).toBe(false);
    expect(await exists('Documents', ID.docB)).toBe(false);
    expect(await exists('ProductBOMs', ID.bom)).toBe(false);

    // The item's QR code (composition child of its DPP) is gone too.
    const qr = await SELECT.from(cds.entities('dpp').QRCodes).where({ dpp_ID: itemDppId });
    expect(qr.length).toBe(0);
  });

  test('external references into the deleted subtree are detached, not deleted', async () => {
    expect(await exists('Products', ID.product2)).toBe(true);
    expect(await exists('ProductBOMs', ID.bom2)).toBe(true);
    const bom2 = await SELECT.one.from(cds.entities('dpp').ProductBOMs)
      .columns('component_ID', 'sub_dpp_ID').where({ ID: ID.bom2 });
    expect(bom2.component_ID).toBeNull();
    expect(bom2.sub_dpp_ID).toBeNull();
  });
});

describe('cascade delete: standalone DPP', () => {
  const ID = { product: 'cd-prod-3', variant: 'cd-var-3', batch: 'cd-batch-3', item: 'cd-item-3' };
  let dppId;

  beforeAll(async () => {
    await POST(`${P}/Products`, { ID: ID.product, name: 'DPP Delete Product', product_type: 'finished' }, alice);
    await POST(`${P}/ProductVariants`, { ID: ID.variant, product_ID: ID.product, sku: 'CD-SKU-3' }, alice);
    await POST(`${P}/Batches`, { ID: ID.batch, variant_ID: ID.variant, batch_number: 'CD-B-3' }, alice);
    await POST(`${P}/ProductItems`, { ID: ID.item, batch_ID: ID.batch, serial_number: 'CD-S-3' }, alice);
    dppId = (await SELECT.one.from(cds.entities('dpp').DPPs).columns('ID').where({ item_ID: ID.item })).ID;
  });

  test('deleting a DPP removes its QR codes but leaves the item and product', async () => {
    const r = await DELETE(`${P}/DPPs('${dppId}')`, alice);
    expect(r.status).toBe(204);

    expect(await exists('DPPs', dppId)).toBe(false);
    const qr = await SELECT.from(cds.entities('dpp').QRCodes).where({ dpp_ID: dppId });
    expect(qr.length).toBe(0);

    // The underlying item/product survive a passport delete.
    expect(await exists('ProductItems', ID.item)).toBe(true);
    expect(await exists('Products', ID.product)).toBe(true);
  });
});
