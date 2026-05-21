'use strict';

const { getUserOrg } = require('./auth-helpers');
const tokens = require('../lib/token');

/**
 * Register handlers on DPPService.
 *   - tenant defaulting on CREATE for Products and DPPs
 *   - status transitions (publishDPP / archiveDPP)
 *   - QR code generation (returns token + base64 PNG)
 *   - SHA-256 hashing of Document binary content on the way in
 */
module.exports = (srv) => {
  const { DPPs, Products, Documents } = srv.entities;

  // ----- Defaults on CREATE -----

  srv.before('CREATE', Products, async (req) => {
    if (!req.data.owning_organization_ID) {
      const org = await getUserOrg(req);
      req.data.owning_organization_ID = org.ID;
    }
  });

  srv.before('CREATE', DPPs, async (req) => {
    if (!req.data.issuing_organization_ID) {
      const org = await getUserOrg(req);
      req.data.issuing_organization_ID = org.ID;
    }
    if (!req.data.status) req.data.status = 'draft';
    if (!req.data.visibility) req.data.visibility = 'internal';
    if (!req.data.granularity_level) req.data.granularity_level = 'model';
  });

  // ----- Document upload: compute SHA-256 + size on the way in -----

  srv.before(['CREATE', 'UPDATE'], Documents, async (req) => {
    if (req.data.content instanceof Buffer) {
      const { createHash } = require('crypto');
      req.data.sha256 = createHash('sha256').update(req.data.content).digest('hex');
      req.data.size_bytes = req.data.content.length;
    }
  });

  // ----- Action: publishDPP -----

  srv.on('publishDPP', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, `DPP '${id}' not found.`);

    if (dpp.status === 'archived') {
      req.reject(400, `DPP '${id}' is archived and cannot be published.`);
    }
    if (dpp.status === 'published') {
      // Idempotent — return current state without rewriting timestamps.
      return dpp;
    }

    const now = new Date().toISOString();
    const qrToken = tokens.generate();

    await UPDATE(DPPs).set({
      status: 'published',
      published_at: now,
      qr_token: qrToken,
      qr_payload_url: `${process.env.PUBLIC_BASE_URL || ''}/public/dpp/${qrToken}`
    }).where({ ID: id });

    return SELECT.one.from(DPPs).where({ ID: id });
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

  // ----- Function: generateQRCode -----

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
};
