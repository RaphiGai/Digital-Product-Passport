'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('dpp/cascade');

/**
 * Cascade (hard) delete for the product-data hierarchy.
 *
 * Parent→child edges in the model are mostly `not null` Associations (NOT Compositions),
 * so CAP does not cascade them: deleting a Product/Variant/Batch/Item/DPP while descendants
 * exist would fail with a foreign-key violation (mapped to HTTP 409 in dpp-service.js). These
 * before('DELETE') hooks remove the whole subtree bottom-up so the generic DELETE of the root
 * row then succeeds.
 *
 * All reads/writes target the PERSISTENCE-level entities (cds.entities('dpp')) rather than the
 * service projections, so they bypass the service DELETE/UPDATE handlers. This is deliberate:
 *  (a) it prevents this before('DELETE') hook from re-entering itself, and
 *  (b) it lets us remove DPPVersions rows, whose service-level writes are rejected as immutable.
 * The cascade runs inside the request's transaction (cds.context), so a failure at any step
 * rolls the entire delete back. Tenant ownership of the ROOT row is already verified by the
 * central write guard in dpp-service.js before this hook runs; every descendant belongs to the
 * same organization by the data model.
 */

function db() { return cds.entities('dpp'); }

const keyOf = (req) => {
  const last = req.params && req.params[req.params.length - 1];
  return last && typeof last === 'object' ? last.ID : last;
};

/** SELECT a single column and return a plain array of its values (empty if none). */
async function col(entity, column, where) {
  const rows = await SELECT.from(entity).columns(column).where(where);
  return rows.map((r) => r[column]);
}

/** DELETE ... WHERE col IN (ids); skipped entirely when the id list is empty. */
async function delIn(entity, column, ids) {
  if (!ids || ids.length === 0) return;
  await DELETE.from(entity).where({ [column]: { in: ids } });
}

/** UPDATE ... SET col = null WHERE col IN (ids) — detach inbound references so the FK unblocks. */
async function detachIn(entity, column, ids) {
  if (!ids || ids.length === 0) return;
  await UPDATE(entity).set({ [column]: null }).where({ [column]: { in: ids } });
}

/** All DPP ids anchored anywhere in a subtree (product/variant/batch/item level). */
async function dppIdsFor({ productId = null, variantIds = [], batchIds = [], itemIds = [] }) {
  const { DPPs } = db();
  const set = new Set();
  const add = (arr) => arr.forEach((id) => set.add(id));
  if (productId) add(await col(DPPs, 'ID', { product_ID: productId }));
  if (variantIds.length) add(await col(DPPs, 'ID', { variant_ID: { in: variantIds } }));
  if (batchIds.length) add(await col(DPPs, 'ID', { batch_ID: { in: batchIds } }));
  if (itemIds.length) add(await col(DPPs, 'ID', { item_ID: { in: itemIds } }));
  return [...set];
}

/**
 * Delete a set of DPP rows and everything hanging off them: marketing links, immutable
 * version history and QR codes, after detaching any sub-DPP references that point at them
 * from other products' BOM lines / batch components. Used by the product/variant/batch/item
 * cascades (which own the DPPs). NOT used for a standalone DPP delete — see cascadeDPP.
 */
async function deleteDPPs(dppIds) {
  if (!dppIds.length) return;
  const { DPPs, QRCodes, DPPMarketingLinks, DPPVersions, ProductBOMs, BatchComponents } = db();
  await detachIn(ProductBOMs, 'sub_dpp_ID', dppIds);
  await detachIn(BatchComponents, 'sub_dpp_ID', dppIds);
  await delIn(DPPMarketingLinks, 'dpp_ID', dppIds);   // only dpp-bound links; org-wide links (dpp = null) untouched
  await delIn(DPPVersions, 'dpp_ID', dppIds);
  await delIn(QRCodes, 'dpp_ID', dppIds);
  await delIn(DPPs, 'ID', dppIds);
}

async function cascadeProduct(productId) {
  if (!productId) return;
  const { ProductVariants, Batches, ProductItems, ProductBOMs, BatchComponents, Documents } = db();

  const variantIds = await col(ProductVariants, 'ID', { product_ID: productId });
  const batchIds   = variantIds.length ? await col(Batches, 'ID', { variant_ID: { in: variantIds } }) : [];
  const itemIds    = batchIds.length   ? await col(ProductItems, 'ID', { batch_ID: { in: batchIds } }) : [];
  const bomIds     = variantIds.length ? await col(ProductBOMs, 'ID', { parent_ID: { in: variantIds } }) : [];
  const dppIds     = await dppIdsFor({ productId, variantIds, batchIds, itemIds });

  // Detach references that point INTO this subtree from OTHER products (keep those rows).
  await detachIn(ProductBOMs, 'component_ID', [productId]);        // this product used as a component elsewhere
  await detachIn(BatchComponents, 'component_batch_ID', batchIds); // our batches consumed by other batches

  await deleteDPPs(dppIds);
  await delIn(Documents, 'product_ID', [productId]);
  await delIn(Documents, 'batch_ID', batchIds);
  await delIn(BatchComponents, 'batch_ID', batchIds);
  await delIn(BatchComponents, 'bom_ID', bomIds);
  await delIn(ProductItems, 'ID', itemIds);
  await delIn(Batches, 'ID', batchIds);
  await delIn(ProductBOMs, 'ID', bomIds);
  await delIn(ProductVariants, 'ID', variantIds);
  // The Products row itself is removed by the generic DELETE after this hook returns.
  LOG.debug('cascadeProduct', { variants: variantIds.length, batches: batchIds.length, items: itemIds.length, dpps: dppIds.length });
}

async function cascadeVariant(variantId) {
  if (!variantId) return;
  const { Batches, ProductItems, ProductBOMs, BatchComponents, Documents } = db();

  const batchIds = await col(Batches, 'ID', { variant_ID: variantId });
  const itemIds  = batchIds.length ? await col(ProductItems, 'ID', { batch_ID: { in: batchIds } }) : [];
  const bomIds   = await col(ProductBOMs, 'ID', { parent_ID: variantId });
  const dppIds   = await dppIdsFor({ variantIds: [variantId], batchIds, itemIds });

  await detachIn(BatchComponents, 'component_batch_ID', batchIds);

  await deleteDPPs(dppIds);
  await delIn(Documents, 'batch_ID', batchIds);
  await delIn(BatchComponents, 'batch_ID', batchIds);
  await delIn(BatchComponents, 'bom_ID', bomIds);
  await delIn(ProductItems, 'ID', itemIds);
  await delIn(Batches, 'ID', batchIds);
  await delIn(ProductBOMs, 'ID', bomIds);
  // The ProductVariants row itself is removed by the generic DELETE.
  LOG.debug('cascadeVariant', { batches: batchIds.length, items: itemIds.length, dpps: dppIds.length });
}

async function cascadeBatch(batchId) {
  if (!batchId) return;
  const { ProductItems, BatchComponents, Documents } = db();

  const itemIds = await col(ProductItems, 'ID', { batch_ID: batchId });
  const dppIds  = await dppIdsFor({ batchIds: [batchId], itemIds });

  await detachIn(BatchComponents, 'component_batch_ID', [batchId]);

  await deleteDPPs(dppIds);
  await delIn(Documents, 'batch_ID', [batchId]);
  await delIn(BatchComponents, 'batch_ID', [batchId]);
  await delIn(ProductItems, 'ID', itemIds);
  // The Batches row itself is removed by the generic DELETE.
  LOG.debug('cascadeBatch', { items: itemIds.length, dpps: dppIds.length });
}

async function cascadeItem(itemId) {
  if (!itemId) return;
  const dppIds = await dppIdsFor({ itemIds: [itemId] });
  await deleteDPPs(dppIds);
  // The ProductItems row itself is removed by the generic DELETE.
}

/**
 * Standalone DPP delete (DPP Studio → DppDetail). Remove everything the DPP owns but NOT the
 * DPP row itself — that is the delete target and is removed by the generic DELETE after this
 * hook. (Deleting it here would leave the generic DELETE with 0 rows → a spurious 404.)
 */
async function cascadeDPP(dppId) {
  if (!dppId) return;
  const { QRCodes, DPPMarketingLinks, DPPVersions, ProductBOMs, BatchComponents } = db();
  await detachIn(ProductBOMs, 'sub_dpp_ID', [dppId]);
  await detachIn(BatchComponents, 'sub_dpp_ID', [dppId]);
  await delIn(DPPMarketingLinks, 'dpp_ID', [dppId]);
  await delIn(DPPVersions, 'dpp_ID', [dppId]);
  await delIn(QRCodes, 'dpp_ID', [dppId]);
}

/** BOM line delete: remove the per-batch sourcing rows that reference it, then let the generic
 *  DELETE remove the line. Drift re-evaluation stays in product-handlers.js. */
async function cascadeBOM(bomId) {
  if (!bomId) return;
  await delIn(db().BatchComponents, 'bom_ID', [bomId]);
}

module.exports = (srv) => {
  const { Products, ProductVariants, Batches, ProductItems, DPPs, ProductBOMs } = srv.entities;

  srv.before('DELETE', Products, async (req) => cascadeProduct(keyOf(req)));
  srv.before('DELETE', ProductVariants, async (req) => cascadeVariant(keyOf(req)));
  srv.before('DELETE', Batches, async (req) => cascadeBatch(keyOf(req)));
  srv.before('DELETE', ProductItems, async (req) => cascadeItem(keyOf(req)));
  srv.before('DELETE', DPPs, async (req) => cascadeDPP(keyOf(req)));
  srv.before('DELETE', ProductBOMs, async (req) => cascadeBOM(keyOf(req)));
};

// Exported for unit testing of the pure cascade logic.
module.exports.cascadeProduct = cascadeProduct;
module.exports.cascadeVariant = cascadeVariant;
module.exports.cascadeBatch = cascadeBatch;
module.exports.cascadeItem = cascadeItem;
module.exports.cascadeDPP = cascadeDPP;
module.exports.cascadeBOM = cascadeBOM;
