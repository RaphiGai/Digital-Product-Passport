'use strict';

const cds = require('@sap/cds');
const { requireOwningOrg } = require('./auth-helpers');
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
  if (!row) req.reject(404, 'This document could not be found. It may have been deleted in the meantime. Please refresh the page and try again.');
  if (row.product_ID) await requireOwningOrg(req, 'Products', row.product_ID);
  else if (row.batch_ID) await requireOwningOrg(req, 'Batches', row.batch_ID, BATCH_OWNER_PATH);
}

/** Verify any product/batch target named in req.data is owned by the caller. */
async function guardTargetOwner(req) {
  if (req.data.product_ID) await requireOwningOrg(req, 'Products', req.data.product_ID);
  if (req.data.batch_ID) await requireOwningOrg(req, 'Batches', req.data.batch_ID, BATCH_OWNER_PATH);
}

module.exports = (srv) => {
  const { Documents } = srv.entities;

  // CREATE: exactly one anchor (product XOR batch), owned by the caller, with defaults.
  srv.before('CREATE', Documents, async (req) => {
    const { product_ID, batch_ID } = req.data;
    if (!!product_ID === !!batch_ID) {
      req.reject(400, 'A document must be linked to exactly one product or one batch. Please select either a product or a batch, not both.');
    }
    await guardTargetOwner(req);
    if (!req.data.doc_type) req.data.doc_type = 'certificate';
    if (req.data.visibility === undefined) req.data.visibility = 'internal';
  });

  // UPDATE: covers metadata PATCH AND the media-stream PUT (which CAP routes here as
  // an UPDATE on Documents(ID)). Guard the existing owner, plus any new target if the
  // document is being re-pointed to a different product/batch.
  srv.before('UPDATE', Documents, async (req) => {
    const id = keyFromReq(req);
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
      req.reject(415, 'This file type is not supported. Please upload a PDF, PNG, or JPEG file instead.');
    }

    const tooLarge = (bytes) =>
      `The file is ${(bytes / (1024 * 1024)).toFixed(1)} MB, but documents can be at most 20 MB. Please choose a smaller file or compress it, then try again.`;
    const declared = Number(req.data.file_size);
    if (declared && declared > MAX_BYTES) {
      req.reject(413, tooLarge(declared));
    }
    const len = Number((req.headers && req.headers['content-length']) || (httpReq && httpReq.headers['content-length']));
    if (len && len > MAX_BYTES) {
      req.reject(413, tooLarge(len));
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
};
