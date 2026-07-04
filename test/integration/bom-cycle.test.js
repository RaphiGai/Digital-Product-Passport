'use strict';

// BOM integrity (US4.11): self-references and transitive cycles are rejected
// with messages that NAME the products and the existing chain of links, so the
// user can see which link to remove (seed: Classic T-Shirt → Organic Cotton
// Fabric via bom-tshirt-cotton).

const cds = require('@sap/cds');

const { POST } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } };

async function postExpectError(url, body) {
  try {
    await POST(url, body, alice);
    throw new Error('expected the request to be rejected');
  } catch (e) {
    if (!e.response) throw e;
    return e.response;
  }
}

describe('BOM cycle protection — specific user-facing messages', () => {
  test('adding a product to its own BOM is rejected naming the product', async () => {
    const res = await postExpectError('/odata/v4/dpp/ProductBOMs', {
      ID: 'test-cycle-self',
      parent_ID: 'var-tshirt-blue-l',        // variant of prod-tshirt-classic
      component_ID: 'prod-tshirt-classic',   // = the variant's own product
      quantity: 1,
      unit: 'pcs',
      status: 'active'
    });
    expect(res.status).toBe(400);
    const msg = res.data.error.message;
    expect(msg).toMatch(/cannot contain itself/i);
    expect(msg).toContain('"Classic T-Shirt"');
  });

  test('a transitive cycle is rejected naming the chain of existing links', async () => {
    // Classic T-Shirt already contains Organic Cotton Fabric, so adding the
    // T-shirt as a component OF the fabric would close the loop.
    const res = await postExpectError('/odata/v4/dpp/ProductBOMs', {
      ID: 'test-cycle-transitive',
      parent_ID: 'var-cotton-default',       // variant of prod-mat-cotton
      component_ID: 'prod-tshirt-classic',
      quantity: 1,
      unit: 'pcs',
      status: 'active'
    });
    expect(res.status).toBe(409);
    const msg = res.data.error.message;
    expect(msg).toContain('"Classic T-Shirt"');
    expect(msg).toContain('"Organic Cotton Fabric"');
    expect(msg).toContain('→');                 // the chain is spelled out
    expect(msg).toMatch(/create a loop/i);
    expect(msg).toMatch(/remove one of the existing links|choose a different component/i);
  });
});
