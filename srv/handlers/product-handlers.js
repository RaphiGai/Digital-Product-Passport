'use strict';

const cds = require('@sap/cds');
const { getUserOrg, requireOwningOrg } = require('./auth-helpers');
const { assertHttpUrls } = require('../lib/url-validate');
const { loadCatalogue } = require('../lib/catalogue');
const { validateAttributes } = require('../lib/attribute-validate');
const dppHandlers = require('./dpp-handlers'); // for reevaluateDrift (one-way require)

function rejectCrossOrgWrite(req, fieldValue, callerOrgId) {
  if (fieldValue !== undefined && fieldValue !== callerOrgId) {
    req.reject(403, 'Cannot assign records to a different organization.');
  }
}

const keyOf = (req) => {
  const last = req.params && req.params[req.params.length - 1];
  return last && typeof last === 'object' ? last.ID : last;
};

// Resolve the DPPs affected by an edit to shared master data (DB-level reads bypass the
// READ tenant filter; the affected DPPs belong to the editing user's org anyway).
async function dppIdsForProduct(productId) {
  const { DPPs } = cds.entities('dpp');
  return (await SELECT.from(DPPs).columns('ID').where({ product_ID: productId })).map((r) => r.ID);
}
async function dppIdsForBatch(batchId) {
  const { DPPs } = cds.entities('dpp');
  return (await SELECT.from(DPPs).columns('ID').where({ batch_ID: batchId })).map((r) => r.ID);
}
async function dppIdsForVariant(variantId) {
  const { DPPs, Batches } = cds.entities('dpp');
  const ids = new Set();
  (await SELECT.from(DPPs).columns('ID').where({ variant_ID: variantId })).forEach((r) => ids.add(r.ID));
  const batches = await SELECT.from(Batches).columns('ID').where({ variant_ID: variantId });
  if (batches.length) {
    (await SELECT.from(DPPs).columns('ID').where({ batch_ID: { in: batches.map((b) => b.ID) } }))
      .forEach((r) => ids.add(r.ID));
  }
  return [...ids];
}

/**
 * Walk the BOM graph downward from `startProductId` and return the product-ID
 * path to `targetProductId` (`[start, …, target]`), or `null` when the target
 * is not reachable as a descendant component. BOMs are anchored at variant
 * level, so each expansion step resolves all variants of the current product
 * and follows their outgoing edges. Used to reject edges that would create a
 * cycle (US4.11) — the path lets the error message name the existing links
 * that would close the loop.
 */
async function findBOMPath(startProductId, targetProductId, { ProductVariants, ProductBOMs }) {
  const cameFrom = new Map(); // productId → predecessor on the discovered walk
  const visited = new Set();
  const stack = [startProductId];
  while (stack.length) {
    const cur = stack.pop();
    if (visited.has(cur)) continue;
    visited.add(cur);
    if (cur === targetProductId) {
      const path = [cur];
      while (path[0] !== startProductId) path.unshift(cameFrom.get(path[0]));
      return path;
    }
    const variants = await SELECT.from(ProductVariants)
      .columns(['ID'])
      .where({ product_ID: cur });
    if (!variants.length) continue;
    const edges = await SELECT.from(ProductBOMs)
      .columns(['component_ID'])
      .where({ parent_ID: { in: variants.map((v) => v.ID) } });
    for (const e of edges) {
      if (e.component_ID == null || visited.has(e.component_ID)) continue; // external lines have no product
      if (!cameFrom.has(e.component_ID)) cameFrom.set(e.component_ID, cur);
      stack.push(e.component_ID);
    }
  }
  return null;
}

async function descendantsReach(startProductId, targetProductId, entities) {
  return (await findBOMPath(startProductId, targetProductId, entities)) !== null;
}

module.exports = (srv) => {
  const {
    Products, ProductVariants,
    ProductBOMs, BusinessPartners, Batches, BatchComponents
  } = srv.entities;

  // ----- Tenant defaulting on CREATE + tenant guard on UPDATE -----

  srv.before('CREATE', Products, async (req) => {
    const org = await getUserOrg(req);
    rejectCrossOrgWrite(req, req.data.owning_organization_ID, org.ID);
    if (!req.data.owning_organization_ID) req.data.owning_organization_ID = org.ID;
    if (!req.data.product_type) req.data.product_type = 'finished';
    if (!req.data.status) req.data.status = 'draft';
  });

  srv.before('UPDATE', Products, async (req) => {
    rejectCrossOrgWrite(req, req.data.owning_organization_ID, req.user._appOrgId);
  });

  // ESPR durability / repairability scores are on a 0–10 scale. (Category URL
  // fields moved into the attributes bag — their http(s)-only XSS guard now runs
  // in the bag validation below, srv/lib/attribute-validate.js.)
  srv.before(['CREATE', 'UPDATE'], Products, (req) => {
    for (const [field, label] of [['durability_score', 'durability'], ['repairability_score', 'repairability']]) {
      const v = req.data[field];
      if (v != null && (v < 0 || v > 10)) {
        req.reject(400, `The ${label} score must be between 0 and 10 (0 = lowest, 10 = highest). Please enter a value within this range.`);
      }
    }
  });

  // ----- Attribute-bag validation against the category catalogue (Epic 12) -----
  // The `attributes` JSON bag carries category-specific field values; every write is
  // validated against the AttributeDefinitions of the (target) category and stored
  // normalized (sorted keys, empties dropped) so the drift hash stays stable.
  // Changing a product's category re-validates the STORED bag against the new
  // category — a leftover attribute of the old category blocks the switch cleanly.
  srv.before(['CREATE', 'UPDATE'], Products, async (req) => {
    const changingCategory = req.event === 'UPDATE' && req.data.category_code !== undefined;
    if (req.data.attributes === undefined && !changingCategory) return;

    const db = cds.entities('dpp');
    let targetCode = req.data.category_code;
    if (targetCode === undefined) {
      const id = keyOf(req);
      const row = id ? await SELECT.one.from(db.Products).columns('category_code').where({ ID: id }) : null;
      targetCode = row ? row.category_code : null;
    }
    const catalogue = await loadCatalogue(targetCode);

    if (req.data.attributes === undefined) {
      // Category change without a bag in the payload: the stored bag must fit the new category.
      const id = keyOf(req);
      const row = id ? await SELECT.one.from(db.Products).columns('attributes').where({ ID: id }) : null;
      if (row && row.attributes) {
        validateAttributes(row.attributes, catalogue, 'product', (msg) =>
          req.reject(400, `The product's saved attributes do not fit the selected category. ${msg}`));
      }
      return;
    }
    const normalized = validateAttributes(req.data.attributes, catalogue, 'product', (msg) => req.reject(400, msg));
    if (normalized !== undefined) req.data.attributes = normalized;
  });

  srv.before(['CREATE', 'UPDATE'], ProductVariants, async (req) => {
    if (req.data.attributes === undefined) return;
    const db = cds.entities('dpp');
    let productId = req.data.product_ID;
    if (!productId) {
      const id = keyOf(req);
      const row = id ? await SELECT.one.from(db.ProductVariants).columns('product_ID').where({ ID: id }) : null;
      productId = row && row.product_ID;
    }
    const prod = productId
      ? await SELECT.one.from(db.Products).columns('category_code').where({ ID: productId })
      : null;
    const catalogue = await loadCatalogue(prod ? prod.category_code : null);
    const normalized = validateAttributes(req.data.attributes, catalogue, 'variant', (msg) => req.reject(400, msg));
    if (normalized !== undefined) req.data.attributes = normalized;
  });

  srv.before(['CREATE', 'UPDATE'], Batches, async (req) => {
    if (req.data.attributes === undefined) return;
    const db = cds.entities('dpp');
    let variantId = req.data.variant_ID;
    if (!variantId) {
      const id = keyOf(req);
      const row = id ? await SELECT.one.from(db.Batches).columns('variant_ID').where({ ID: id }) : null;
      variantId = row && row.variant_ID;
    }
    const variant = variantId
      ? await SELECT.one.from(db.ProductVariants).columns('product_ID').where({ ID: variantId })
      : null;
    const prod = variant && variant.product_ID
      ? await SELECT.one.from(db.Products).columns('category_code').where({ ID: variant.product_ID })
      : null;
    const catalogue = await loadCatalogue(prod ? prod.category_code : null);
    const normalized = validateAttributes(req.data.attributes, catalogue, 'batch', (msg) => req.reject(400, msg));
    if (normalized !== undefined) req.data.attributes = normalized;
  });

  srv.before('CREATE', BusinessPartners, async (req) => {
    const org = await getUserOrg(req);
    rejectCrossOrgWrite(req, req.data.owning_organization_ID, org.ID);
    if (!req.data.owning_organization_ID) req.data.owning_organization_ID = org.ID;
  });

  srv.before('UPDATE', BusinessPartners, async (req) => {
    rejectCrossOrgWrite(req, req.data.owning_organization_ID, req.user._appOrgId);
  });

  // ----- Status defaults + field validation for hierarchy entities -----

  srv.before(['CREATE', 'UPDATE'], ProductVariants, (req) => {
    if (req.event === 'CREATE' && !req.data.status) req.data.status = 'draft';
    const { weight_g } = req.data;
    if (weight_g != null && weight_g <= 0) {
      req.reject(400, 'Weight must be a positive number (in grams).');
    }
  });

  srv.before(['CREATE', 'UPDATE'], Batches, (req) => {
    const { co2_footprint_kg, recycled_content_pct } = req.data;
    if (co2_footprint_kg != null && co2_footprint_kg < 0) {
      req.reject(400, 'CO₂ footprint cannot be negative.');
    }
    if (recycled_content_pct != null && (recycled_content_pct < 0 || recycled_content_pct > 100)) {
      req.reject(400, 'Recycled content must be between 0 and 100 %.');
    }
  });

  // ----- BOM integrity: self-loop, quantity bounds, acyclic graph (US4.11) -----

  srv.before(['CREATE', 'UPDATE'], ProductBOMs, async (req) => {
    const { parent_ID, component_ID, component_name, quantity, unit,
            ext_co2_footprint, ext_recycled_content_pct } = req.data;

    // A line identifies its component either by an internal product (internal source)
    // or by a free-text name (external supplier component without an internal record).
    if (req.event === 'CREATE' && !component_ID && !component_name) {
      req.reject(400, 'A BOM line needs a component product or an external component name.');
    }

    let parentVariant = null;
    if (parent_ID) {
      const dbEntities = cds.entities('dpp');
      parentVariant = await SELECT.one.from(dbEntities.ProductVariants)
        .columns(['ID', 'product_ID'])
        .where({ ID: parent_ID });
      if (!parentVariant) {
        req.reject(400, 'The variant this component should be added to no longer exists. It may have been deleted in the meantime. Please refresh the page and try again.');
      }
      await requireOwningOrg(req, 'Products', parentVariant.product_ID);
    }

    if (parentVariant && component_ID && parentVariant.product_ID === component_ID) {
      const own = await SELECT.one.from(cds.entities('dpp').Products)
        .columns(['name']).where({ ID: component_ID });
      const ownName = own && own.name ? `"${own.name}"` : 'This product';
      req.reject(400, `A product cannot contain itself: ${ownName} is the product this variant belongs to, so it cannot be added to its own bill of materials. Please choose a different component product, or enter it as an external component by name.`);
    }
    if (unit === '%' && quantity != null && (quantity <= 0 || quantity > 100)) {
      req.reject(400, 'A percentage share must be greater than 0 and at most 100. Please enter the component\'s share within this range, or choose a different unit.');
    }
    if (quantity != null && quantity < 0) {
      req.reject(400, 'The component quantity cannot be negative. Please enter 0 or a positive number.');
    }
    if (ext_co2_footprint != null && ext_co2_footprint < 0) {
      req.reject(400, 'CO₂ footprint cannot be negative.');
    }
    if (ext_recycled_content_pct != null && (ext_recycled_content_pct < 0 || ext_recycled_content_pct > 100)) {
      req.reject(400, 'Recycled content must be between 0 and 100 %.');
    }
    // external_dpp_url is rendered as <a href> in the public materials tree — must be http(s).
    assertHttpUrls(req, req.data, ['external_dpp_url']);
    if (parentVariant && component_ID) {
      const dbEntities = cds.entities('dpp');
      const cyclePath = await findBOMPath(
        component_ID, parentVariant.product_ID, dbEntities
      );
      if (cyclePath) {
        // Name the products along the existing chain so the user can see WHICH
        // links close the loop. Only own-org products are named (the IDs come
        // from client input / the BOM walk) — anything else gets a neutral label.
        const rows = await SELECT.from(dbEntities.Products)
          .columns(['ID', 'name'])
          .where({ ID: { in: cyclePath }, owning_organization_ID: req.user._appOrgId });
        const nameOf = new Map(rows.map((r) => [r.ID, r.name]));
        const label = (id) => (nameOf.get(id) ? `"${nameOf.get(id)}"` : 'an unnamed product');
        const componentName = label(component_ID);
        const parentName = label(parentVariant.product_ID);
        const chain = [parentName, ...cyclePath.map(label)].join(' → ');
        req.reject(409,
          `${componentName} cannot be added to the bill of materials of ${parentName}, because ${componentName} already contains ${parentName} as a component (${chain}). ` +
          'This would create a loop in which a product contains itself. Please remove one of the existing links in this chain first, or choose a different component.'
        );
      }
    }
  });

  // ----- Archive action -----

  srv.on('archiveProduct', Products, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    await requireOwningOrg(req, 'Products', id);

    await UPDATE(Products)
      .set({ status: 'archived' })
      .where({ ID: id });

    return SELECT.one.from(Products).where({ ID: id });
  });

  // ----- Drift: editing shared master data reverts dependent approved/published DPPs
  // to draft (re-approve + re-publish needed). See dpp-handlers#reevaluateDrift. The
  // lifecycle `status` of these rows is excluded from the drift hash (snapshot-hash.js),
  // so archiving/publishing a product does NOT revert its DPPs. -----
  srv.after('UPDATE', Products, async (_d, req) => {
    const id = keyOf(req);
    if (id) await dppHandlers.reevaluateDrift(await dppIdsForProduct(id));
  });
  srv.after('UPDATE', ProductVariants, async (_d, req) => {
    const id = keyOf(req);
    if (id) await dppHandlers.reevaluateDrift(await dppIdsForVariant(id));
  });
  srv.after('UPDATE', Batches, async (_d, req) => {
    const id = keyOf(req);
    if (id) await dppHandlers.reevaluateDrift(await dppIdsForBatch(id));
  });

  // BOM / per-batch sourcing: CREATE/UPDATE/DELETE all change the rolled-up snapshot.
  // Capture the affected parent variant / batch in `before` (the row still exists on
  // DELETE), then re-evaluate in `after`.
  srv.before(['CREATE', 'UPDATE', 'DELETE'], ProductBOMs, async (req) => {
    let parentId = req.data && req.data.parent_ID;
    if (!parentId) {
      const id = keyOf(req);
      if (id) {
        const row = await SELECT.one.from(cds.entities('dpp').ProductBOMs).columns('parent_ID').where({ ID: id });
        parentId = row && row.parent_ID;
      }
    }
    req._driftVariantId = parentId || null;
  });
  srv.after(['CREATE', 'UPDATE', 'DELETE'], ProductBOMs, async (_d, req) => {
    if (req._driftVariantId) await dppHandlers.reevaluateDrift(await dppIdsForVariant(req._driftVariantId));
  });

  srv.before(['CREATE', 'UPDATE', 'DELETE'], BatchComponents, async (req) => {
    let batchId = req.data && req.data.batch_ID;
    if (!batchId) {
      const id = keyOf(req);
      if (id) {
        const row = await SELECT.one.from(cds.entities('dpp').BatchComponents).columns('batch_ID').where({ ID: id });
        batchId = row && row.batch_ID;
      }
    }
    req._driftBatchId = batchId || null;
  });
  srv.after(['CREATE', 'UPDATE', 'DELETE'], BatchComponents, async (_d, req) => {
    if (req._driftBatchId) await dppHandlers.reevaluateDrift(await dppIdsForBatch(req._driftBatchId));
  });
};

module.exports.descendantsReach = descendantsReach;
module.exports.findBOMPath = findBOMPath;
