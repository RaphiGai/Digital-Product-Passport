'use strict';

const cds = require('@sap/cds');
const { getUserOrg, requireOwningOrg } = require('./auth-helpers');
const { assertHttpUrls } = require('../lib/url-validate');
const dppHandlers = require('./dpp-handlers'); // for reevaluateDrift (one-way require)

// Product URL fields rendered as <a href> on the public consumer page — must be http(s).
const PRODUCT_URL_FIELDS = [
  'care_video_url', 'repair_video_url', 'disposal_video_url', 'reuse_video_url',
  'care_products_url', 'repair_products_url', 'reuse_products_url', 'disposal_products_url'
];

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
 * Walk the BOM graph downward from `startProductId`: is `targetProductId`
 * reachable as a descendant component? BOMs are anchored at variant level, so
 * each expansion step resolves all variants of the current product and follows
 * their outgoing edges. Used to reject edges that would create a cycle
 * (US4.11).
 */
async function descendantsReach(startProductId, targetProductId, { ProductVariants, ProductBOMs }) {
  const visited = new Set();
  const stack = [startProductId];
  while (stack.length) {
    const cur = stack.pop();
    if (visited.has(cur)) continue;
    visited.add(cur);
    if (cur === targetProductId) return true;
    const variants = await SELECT.from(ProductVariants)
      .columns(['ID'])
      .where({ product_ID: cur });
    if (!variants.length) continue;
    const edges = await SELECT.from(ProductBOMs)
      .columns(['component_ID'])
      .where({ parent_ID: { in: variants.map((v) => v.ID) } });
    for (const e of edges) stack.push(e.component_ID);
  }
  return false;
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

  // ESPR durability / repairability scores are on a 0–10 scale.
  srv.before(['CREATE', 'UPDATE'], Products, (req) => {
    for (const field of ['durability_score', 'repairability_score']) {
      const v = req.data[field];
      if (v != null && (v < 0 || v > 10)) {
        req.reject(400, 'Durability and repairability scores must be between 0 and 10.');
      }
    }
    // Consumer-facing URLs must be http(s) — block stored javascript:/data: XSS.
    assertHttpUrls(req, req.data, PRODUCT_URL_FIELDS);
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
        req.reject(400, 'The selected parent variant does not exist.');
      }
      await requireOwningOrg(req, 'Products', parentVariant.product_ID);
    }

    if (parentVariant && component_ID && parentVariant.product_ID === component_ID) {
      req.reject(400, 'A product cannot reference its own variant as a component.');
    }
    if (unit === '%' && quantity != null && (quantity <= 0 || quantity > 100)) {
      req.reject(400, 'Percentage share must be within (0, 100].');
    }
    if (quantity != null && quantity < 0) {
      req.reject(400, 'BOM quantity must not be negative.');
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
      const wouldCycle = await descendantsReach(
        component_ID, parentVariant.product_ID, dbEntities
      );
      if (wouldCycle) {
        req.reject(409, 'Adding this component would introduce a cycle in the BOM.');
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
