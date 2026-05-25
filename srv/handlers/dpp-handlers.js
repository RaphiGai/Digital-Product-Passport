'use strict';

const cds = require('@sap/cds');
const { createHash, randomUUID } = require('crypto');
const tokens = require('../lib/token');

const productHandlers = require('./product-handlers');
const validationHandlers = require('./validation-handlers');

/**
 * Build a JSON snapshot of the full aggregated DPP — Product + Variant + Batch +
 * Item + BOM + sustainability/compliance — for `DPPVersions.snapshot`.
 */
async function buildSnapshot(dpp) {
  const {
    Products, ProductVariants, Batches, ProductItems, ProductBOMs,
    Certifications, SubstancesOfConcern, SustainabilityIndicators
  } = cds.entities('dpp');

  const [product, item, certifications, substances, sustainability, bom] = await Promise.all([
    SELECT.one.from(Products).where({ ID: dpp.product_ID }),
    dpp.item_ID ? SELECT.one.from(ProductItems).where({ ID: dpp.item_ID }) : null,
    SELECT.from(Certifications).where({ product_ID: dpp.product_ID }),
    SELECT.from(SubstancesOfConcern).where({ product_ID: dpp.product_ID }),
    SELECT.one.from(SustainabilityIndicators).where({ product_ID: dpp.product_ID }),
    SELECT.from(ProductBOMs).where({ parent_ID: dpp.product_ID })
  ]);

  let variant = null;
  let batch = null;
  if (item) {
    batch = await SELECT.one.from(Batches).where({ ID: item.batch_ID });
    if (batch) variant = await SELECT.one.from(ProductVariants).where({ ID: batch.variant_ID });
  }

  return {
    captured_at: new Date().toISOString(),
    dpp: {
      id: dpp.ID,
      granularity: dpp.granularity,
      dpp_type: dpp.dpp_type,
      visibility: dpp.visibility,
      version: dpp.current_version
    },
    product,
    variant,
    batch,
    item,
    bom,
    sustainability,
    certifications,
    substances
  };
}

/**
 * Mark every currently-active QRCodes row for this DPP as replaced, then insert
 * a new active row pointing at `qrValue`. Keeps the most-recent QR uniquely
 * `active`; older ones remain queryable as audit trail.
 */
async function rotateActiveQRCode(dppId, qrValue, qrImageUrl) {
  const { QRCodes } = cds.entities('dpp');
  const now = new Date().toISOString();
  await UPDATE(QRCodes)
    .set({ status: 'replaced', replaced_at: now })
    .where({ dpp_ID: dppId, status: 'active' });
  await INSERT.into(QRCodes).entries({
    ID: randomUUID(),
    dpp_ID: dppId,
    qr_value: qrValue,
    qr_image_url: qrImageUrl,
    status: 'active',
    created_at: now
  });
}

module.exports = (srv) => {
  const { DPPs, DPPVersions, Documents } = srv.entities;

  // ----- Defaults on CREATE -----

  srv.before('CREATE', DPPs, (req) => {
    if (!req.data.status) req.data.status = 'draft';
    if (!req.data.visibility) req.data.visibility = 'internal';
    if (!req.data.granularity) req.data.granularity = req.data.item_ID ? 'item' : 'model';
    if (!req.data.dpp_type) req.data.dpp_type = 'product';
    if (!req.data.current_version) req.data.current_version = 1;
    req.data.last_updated = new Date().toISOString();
  });

  srv.before('UPDATE', DPPs, (req) => {
    req.data.last_updated = new Date().toISOString();
  });

  // ----- Link Item ↔ DPP after CREATE -----

  srv.after('CREATE', DPPs, async (dpp) => {
    if (dpp.item_ID) {
      await UPDATE(cds.entities('dpp').ProductItems)
        .set({ dpp_ID: dpp.ID })
        .where({ ID: dpp.item_ID });
    }
  });

  // ----- Document upload: compute SHA-256 + size on the way in -----

  srv.before(['CREATE', 'UPDATE'], Documents, (req) => {
    if (req.data.content instanceof Buffer) {
      req.data.sha256 = createHash('sha256').update(req.data.content).digest('hex');
      req.data.size_bytes = req.data.content.length;
    }
  });

  // ----- Action: approveDPP (draft → approved) -----

  srv.on('approveDPP', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, `DPP '${id}' not found.`);

    if (dpp.status === 'archived') {
      req.reject(400, `DPP '${id}' is archived.`);
    }
    if (dpp.status !== 'draft') {
      return dpp;  // idempotent — already approved/published
    }

    const blockingErrors = await validationHandlers.validateDPP(dpp);
    if (blockingErrors.length) {
      req.reject(400, `DPP cannot be approved — ${blockingErrors.length} blocking issue(s). See ValidationWarnings.`);
    }

    await UPDATE(DPPs)
      .set({ status: 'approved', approved_at: new Date().toISOString() })
      .where({ ID: id });

    return SELECT.one.from(DPPs).where({ ID: id });
  });

  // ----- Action: publishDPP (approved → published, snapshot + QR) -----

  srv.on('publishDPP', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, `DPP '${id}' not found.`);

    if (dpp.status === 'archived') {
      req.reject(400, `DPP '${id}' is archived and cannot be published.`);
    }

    // Validate again at publish time — caller might have approved earlier and edited since.
    const blockingErrors = await validationHandlers.validateDPP(dpp);
    if (blockingErrors.length) {
      req.reject(400, `DPP cannot be published — ${blockingErrors.length} blocking issue(s). See ValidationWarnings.`);
    }

    const now = new Date().toISOString();
    const previouslyPublished = dpp.status === 'published';
    const nextVersion = previouslyPublished ? dpp.current_version + 1 : dpp.current_version;
    const qrToken = dpp.qr_token || tokens.generate();
    const payloadUrl = `${process.env.PUBLIC_BASE_URL || ''}/public/dpp/${qrToken}`;
    const publicUrl = `${process.env.PUBLIC_BASE_URL || ''}/dpp/${id}`;

    await UPDATE(DPPs).set({
      status: 'published',
      published_at: now,
      qr_token: qrToken,
      qr_payload_url: payloadUrl,
      public_url: publicUrl,
      current_version: nextVersion,
      last_updated: now
    }).where({ ID: id });

    const updated = await SELECT.one.from(DPPs).where({ ID: id });
    const snapshot = await buildSnapshot(updated);
    const snapshotJson = JSON.stringify(snapshot);

    await UPDATE(DPPs)
      .set({ aggregated_snapshot: snapshotJson })
      .where({ ID: id });

    await INSERT.into(DPPVersions).entries({
      ID: randomUUID(),
      dpp_ID: id,
      version_no: nextVersion,
      snapshot: snapshotJson,
      status: 'published',
      published_at: now,
      published_by: req.user?.id || 'system',
      change_reason: req.data?.change_reason || null
    });

    // Mint or rotate the active QR Code row (Sheet 5: DPP → QR Code 1:1).
    const qrImageUrl = `${process.env.PUBLIC_BASE_URL || ''}/public/dpp/${qrToken}/qr.png`;
    await rotateActiveQRCode(id, payloadUrl, qrImageUrl);

    return updated;
  });

  // ----- Action: archiveDPP -----

  srv.on('archiveDPP', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, `DPP '${id}' not found.`);

    await UPDATE(DPPs)
      .set({ status: 'archived', archived_at: new Date().toISOString() })
      .where({ ID: id });

    return SELECT.one.from(DPPs).where({ ID: id });
  });

  // ----- Action: regenerateQRToken (US6.14) -----

  srv.on('regenerateQRToken', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, `DPP '${id}' not found.`);

    const qrToken = tokens.generate();
    const payloadUrl = `${process.env.PUBLIC_BASE_URL || ''}/public/dpp/${qrToken}`;
    const qrImageUrl = `${process.env.PUBLIC_BASE_URL || ''}/public/dpp/${qrToken}/qr.png`;
    await UPDATE(DPPs)
      .set({ qr_token: qrToken, qr_payload_url: payloadUrl })
      .where({ ID: id });

    await rotateActiveQRCode(id, payloadUrl, qrImageUrl);

    return SELECT.one.from(DPPs).where({ ID: id });
  });

  // ----- Function: generateQRCode (returns base64 PNG) -----

  srv.on('generateQRCode', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, `DPP '${id}' not found.`);
    if (!dpp.qr_token) req.reject(409, `DPP '${id}' has no QR token. Publish it first.`);

    const payload = dpp.qr_payload_url ||
      `${process.env.PUBLIC_BASE_URL || ''}/public/dpp/${dpp.qr_token}`;

    const QRCode = require('qrcode');
    const pngBuffer = await QRCode.toBuffer(payload, { type: 'png', margin: 1, scale: 6 });
    return { png: pngBuffer.toString('base64'), payload };
  });

  // ----- Function: getValidationReport -----

  srv.on('getValidationReport', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    const { ValidationWarnings } = cds.entities('dpp');
    const rows = await SELECT.from(ValidationWarnings)
      .columns(['warning_code', 'severity', 'field_name', 'message'])
      .where({ entity_type: 'DPP', entity_id: id, resolved: false });
    return rows;
  });
};

module.exports.buildSnapshot = buildSnapshot;
