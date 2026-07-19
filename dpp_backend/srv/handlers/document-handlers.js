'use strict';

const cds = require('@sap/cds');
const {
  requireOwningOrg, requireActiveUser, requireRole,
  isBusinessPartner, requirePartnerLink
} = require('./auth-helpers');
const dppHandlers = require('./dpp-handlers'); // for reevaluateDrift (one-way require)

/** DPPs whose snapshot embeds these documents (product- or batch-anchored). */
async function dppIdsForDoc(productId, batchId) {
  const { DPPs } = cds.entities('dpp');
  const ids = new Set();
  if (productId) (await SELECT.from(DPPs).columns('ID').where({ product_ID: productId })).forEach((r) => ids.add(r.ID));
  if (batchId) (await SELECT.from(DPPs).columns('ID').where({ batch_ID: batchId })).forEach((r) => ids.add(r.ID));
  return [...ids];
}

// Mirrors the frontend allowlist + limit (DocumentManager). Fixed per the
// approved plan: PDF, PNG, JPEG, max 20 MB.
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_BYTES = 20 * 1024 * 1024;

// Mirrors db/product.cds Documents.title / .issuer (String(200)).
const MAX_TEXT_LEN = 200;

// Batch tenant anchor — same path the central read filter / product-item handler use.
const BATCH_OWNER_PATH = 'variant.product.owning_organization_ID';

/** Pull the instance key from a CAP request's params (last segment), object or scalar. */
function keyFromReq(req) {
  const last = req.params && req.params[req.params.length - 1];
  if (last == null) return null;
  return typeof last === 'object' ? last.ID : last;
}

/** Verify the document referenced by `id` belongs to the caller's organization. */
async function guardExistingOwner(req, id) {
  const { Documents } = cds.entities('dpp');
  const row = await SELECT.one.from(Documents).columns('product_ID', 'batch_ID').where({ ID: id });
  if (!row) req.reject(404, 'Document not found.');
  if (row.product_ID) await requireOwningOrg(req, 'Products', row.product_ID);
  else if (row.batch_ID) await requireOwningOrg(req, 'Batches', row.batch_ID, BATCH_OWNER_PATH);
}

/** Verify any product/batch/partner target named in req.data is owned by the caller. */
async function guardTargetOwner(req) {
  if (req.data.product_ID) await requireOwningOrg(req, 'Products', req.data.product_ID);
  if (req.data.batch_ID) await requireOwningOrg(req, 'Batches', req.data.batch_ID, BATCH_OWNER_PATH);
  if (req.data.assigned_partner_ID) await requireOwningOrg(req, 'BusinessPartners', req.data.assigned_partner_ID);
}

// Fields a business_partner login may write on its assigned documents: the file
// itself plus issuer/validity of the renewed certificate. Everything identifying
// the document (title, type, anchor, visibility, assignment) stays with the
// company. ID + the server-stamped audit fields (dpp-service.js) pass through.
const PARTNER_EDITABLE = new Set([
  'content', 'mime_type', 'file_name', 'file_size',
  'issuer', 'issue_date', 'valid_until',
  'ID', 'lastChange', 'changedBy_ID'
]);

/**
 * business_partner UPDATE guard: the target document must be assigned to the
 * caller's linked partner, and only PARTNER_EDITABLE fields may change.
 * Covers both the metadata PATCH and the media-stream PUT.
 */
async function guardPartnerUpdate(req, id) {
  const partnerId = requirePartnerLink(req);
  if (!id) req.reject(400, 'A record key is required for this operation.');
  const { Documents } = cds.entities('dpp');
  const row = await SELECT.one.from(Documents).columns('assigned_partner_ID').where({ ID: id });
  if (!row) req.reject(404, 'Document not found.');
  if (row.assigned_partner_ID !== partnerId) {
    req.reject(403, "You don't have permission to access this item.");
  }
  const illegal = Object.keys(req.data).filter((k) => !PARTNER_EDITABLE.has(k));
  if (illegal.length) {
    req.reject(403, 'You can only update the file, issuer and validity dates of your assigned documents.');
  }
}

module.exports = (srv) => {
  const { Documents } = srv.entities;

  // CREATE: exactly one anchor (product XOR batch), owned by the caller, with defaults.
  srv.before('CREATE', Documents, async (req) => {
    const { product_ID, batch_ID } = req.data;
    if (!!product_ID === !!batch_ID) {
      req.reject(400, 'A document must reference exactly one product OR one batch.');
    }
    await guardTargetOwner(req);
    if (!req.data.doc_type) req.data.doc_type = 'certificate';
    if (req.data.visibility === undefined) req.data.visibility = 'internal';
  });

  // UPDATE: covers metadata PATCH AND the media-stream PUT (which CAP routes here as
  // an UPDATE on Documents(ID)). Guard the existing owner, plus any new target if the
  // document is being re-pointed to a different product/batch. business_partner
  // logins get the narrower assigned-document + field-allowlist guard instead.
  // Resolve the caller FIRST: entity-specific before handlers can run ahead of the
  // central before('*') gate (see dpp-service.js), so the role may not be set yet —
  // branching on an unresolved role would skip the partner allowlist.
  srv.before('UPDATE', Documents, async (req) => {
    await requireActiveUser(req);
    const id = keyFromReq(req);
    if (isBusinessPartner(req)) {
      await guardPartnerUpdate(req, id);
      return;
    }
    if (id) await guardExistingOwner(req, id);
    await guardTargetOwner(req);
  });

  // MIME + size validation. On a metadata write the MIME comes from req.data.mime_type;
  // on the media-stream PUT (which CAP does NOT surface in req.data) it comes from the
  // request Content-Type. Content-Length additionally caps the raw upload bytes.
  srv.before(['CREATE', 'UPDATE'], Documents, (req) => {
    const httpReq = (req.http && req.http.req) || (req._ && req._.req) || null;
    const url = httpReq ? (httpReq.originalUrl || httpReq.url || '') : '';
    const isMediaPut = httpReq && httpReq.method === 'PUT' && /\/content(\/\$value)?(\?.*)?$/i.test(url);

    const rawMime = isMediaPut
      ? (httpReq.headers['content-type'] || '')
      : (req.data.mime_type || '');
    const mime = String(rawMime).split(';')[0].trim().toLowerCase();
    if (mime && !ALLOWED_MIME.has(mime)) {
      req.reject(415, 'Unsupported file type. Allowed: PDF, PNG, JPEG.');
    }

    const declared = Number(req.data.file_size);
    if (declared && declared > MAX_BYTES) {
      req.reject(413, 'File too large (max 20 MB).');
    }
    const len = Number((req.headers && req.headers['content-length']) || (httpReq && httpReq.headers['content-length']));
    if (len && len > MAX_BYTES) {
      req.reject(413, 'File too large (max 20 MB).');
    }
  });

  // Metadata constraints: bounded Title/Issuer length and a strict issue_date <
  // valid_until ordering. Skips the media-stream PUT (no metadata in req.data). On a
  // partial PATCH the dates are merged with the stored row so the rule holds either way.
  srv.before(['CREATE', 'UPDATE'], Documents, async (req) => {
    const d = req.data;
    const touchesMeta = ['title', 'issuer', 'issue_date', 'valid_until'].some((k) => d[k] !== undefined);
    if (!touchesMeta) return;

    if (typeof d.title === 'string' && d.title.length > MAX_TEXT_LEN) {
      req.reject(400, `Title must be at most ${MAX_TEXT_LEN} characters.`);
    }
    if (typeof d.issuer === 'string' && d.issuer.length > MAX_TEXT_LEN) {
      req.reject(400, `Issuer must be at most ${MAX_TEXT_LEN} characters.`);
    }

    let issue = d.issue_date;
    let valid = d.valid_until;
    if (req.event === 'UPDATE' && (issue === undefined || valid === undefined)) {
      const id = keyFromReq(req);
      const existing = id
        ? await SELECT.one.from(Documents).columns('issue_date', 'valid_until').where({ ID: id })
        : null;
      if (existing) {
        if (issue === undefined) issue = existing.issue_date;
        if (valid === undefined) valid = existing.valid_until;
      }
    }
    if (issue && valid && String(valid) <= String(issue)) {
      req.reject(400, 'The issue date must be before the valid-until date.');
    }
  });

  // NOTE: the "a file-less document must have an assigned partner" placeholder rule is
  // enforced in the frontend (DocumentManager / PartnerDocuments), NOT here. The data
  // model deliberately allows a bare metadata row whose binary is uploaded later via a
  // separate media PUT (which does not set file_name), so a server-side "no file ⇒
  // partner required" guard would reject that legitimate two-step flow. A file-less row
  // is already handled safely everywhere it matters: filtered off the consumer passport
  // (public-handler.js), surfaced as "upload pending" in the partner portal, and — since
  // the compliance evidence rollup now skips file-less rows — no longer miscounted.

  // DELETE: the central read OR-filter does not apply to DELETE, so guard explicitly.
  // Removing the row drops the BLOB with it.
  srv.before('DELETE', Documents, async (req) => {
    const id = keyFromReq(req);
    if (id) await guardExistingOwner(req, id);
  });

  // Drift: a document add/edit/remove changes the DPP snapshot's document list →
  // re-evaluate dependent approved/published DPPs (see dpp-handlers#reevaluateDrift).
  // Capture the doc's product/batch anchor in `before` (the row still exists on DELETE).
  srv.before(['CREATE', 'UPDATE', 'DELETE'], Documents, async (req) => {
    let productId = req.data && req.data.product_ID;
    let batchId = req.data && req.data.batch_ID;
    if (!productId && !batchId) {
      const id = keyFromReq(req);
      if (id) {
        const row = await SELECT.one.from(Documents).columns('product_ID', 'batch_ID').where({ ID: id });
        productId = row && row.product_ID;
        batchId = row && row.batch_ID;
      }
    }
    req._driftDoc = { productId: productId || null, batchId: batchId || null };
  });
  srv.after(['CREATE', 'UPDATE', 'DELETE'], Documents, async (_d, req) => {
    const d = req._driftDoc;
    if (d && (d.productId || d.batchId)) {
      await dppHandlers.reevaluateDrift(await dppIdsForDoc(d.productId, d.batchId));
    }
  });

  // ----- Partner portal feed (business_partner role) -----
  // One call returns everything the partner page needs: the documents assigned
  // to the caller's linked partner PLUS the product/batch context they belong
  // to — so partner accounts never need read access to Products/Batches/
  // ProductVariants themselves (those entities stay blocked by the central
  // business_partner scope gate). JSON string, same contract style as
  // validationOverview.
  srv.on('myAssignedDocuments', async (req) => {
    await requireActiveUser(req);
    requireRole(req, 'business_partner');
    const partnerId = requirePartnerLink(req);

    const db = cds.entities('dpp');
    const docs = await SELECT.from(db.Documents)
      .columns('ID', 'title', 'doc_type', 'issuer', 'issue_date', 'valid_until',
               'file_name', 'mime_type', 'file_size', 'product_ID', 'batch_ID', 'lastChange')
      .where({ assigned_partner_ID: partnerId })
      .orderBy('valid_until', 'title');

    // Resolve product context: directly for product docs, via variant for batch docs.
    const batchIds = [...new Set(docs.map((d) => d.batch_ID).filter(Boolean))];
    const batches = batchIds.length
      ? await SELECT.from(db.Batches)
          .columns('ID', 'batch_number', 'production_date', 'variant_ID')
          .where({ ID: batchIds })
      : [];
    const batchById = new Map(batches.map((b) => [b.ID, b]));

    const variantIds = [...new Set(batches.map((b) => b.variant_ID).filter(Boolean))];
    const variants = variantIds.length
      ? await SELECT.from(db.ProductVariants)
          .columns('ID', 'color', 'size', 'sku', 'product_ID')
          .where({ ID: variantIds })
      : [];
    const variantById = new Map(variants.map((v) => [v.ID, v]));

    const productIds = [...new Set([
      ...docs.map((d) => d.product_ID),
      ...variants.map((v) => v.product_ID)
    ].filter(Boolean))];
    const products = productIds.length
      ? await SELECT.from(db.Products)
          .columns('ID', 'name', 'brand', 'model', 'product_type', 'description')
          .where({ ID: productIds })
      : [];
    const productById = new Map(products.map((p) => [p.ID, p]));

    const today = new Date().toISOString().slice(0, 10);
    const rows = docs.map((d) => {
      const batch = (d.batch_ID && batchById.get(d.batch_ID)) || null;
      const variant = (batch && batch.variant_ID && variantById.get(batch.variant_ID)) || null;
      const productId = d.product_ID || (variant && variant.product_ID) || null;
      const product = (productId && productById.get(productId)) || null;
      return {
        ID: d.ID,
        title: d.title,
        doc_type: d.doc_type,
        issuer: d.issuer,
        issue_date: d.issue_date,
        valid_until: d.valid_until,
        file_name: d.file_name,
        mime_type: d.mime_type,
        file_size: d.file_size,
        lastChange: d.lastChange,
        has_file: !!d.file_name,
        expired: !!(d.valid_until && String(d.valid_until) < today),
        level: d.batch_ID ? 'batch' : 'product',
        product: product ? {
          ID: product.ID,
          name: product.name,
          brand: product.brand,
          model: product.model,
          product_type: product.product_type,
          description: product.description
        } : null,
        batch: batch ? {
          ID: batch.ID,
          batch_number: batch.batch_number,
          production_date: batch.production_date,
          variant: variant ? { color: variant.color, size: variant.size, sku: variant.sku } : null
        } : null
      };
    });

    return JSON.stringify({ generated_at: new Date().toISOString(), documents: rows });
  });
};
