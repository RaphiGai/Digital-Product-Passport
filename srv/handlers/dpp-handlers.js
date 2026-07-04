'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('dpp/dpp');
const { randomUUID } = require('crypto');
const tokens = require('../lib/token');
const { requireOwningOrg, requireActiveUser } = require('./auth-helpers');
const { aggregate } = require('../lib/aggregator');
const { evaluateDppChecks, loadDppValidationContext } = require('../lib/dpp-validation');
const { contentHash, diffNormalized } = require('../lib/snapshot-hash');

const DPP_OWNER_PATH = 'product.owning_organization_ID';

/**
 * Readiness gate used by approveDPP/publishDPP. Returns an array of
 * human-readable error strings — empty means OK to proceed. Evaluates the
 * unified check catalogue (srv/lib/dpp-validation.js), so the gate result is
 * always identical to what the Validation page and the DPP-detail readiness
 * panel display. Errors are reported inline via req.reject.
 */
async function checkDPPReady(dpp) {
  if (!dpp.product_ID) return ['The DPP must reference a product.'];
  const ctx = await loadDppValidationContext(dpp);
  if (!ctx.product) return ['The referenced product does not exist.'];
  if (dpp.batch_ID && !ctx.batch) return ['The referenced batch does not exist.'];
  return evaluateDppChecks(ctx).gate_errors;
}

/**
 * All marketing links shown for a DPP at snapshot time: those attached to the
 * DPP plus org-wide ones (dpp_ID null), within the owning org. Unlike the public
 * consumer view, this keeps inactive/out-of-window links too (with is_active +
 * validity preserved) so the read-only version view can reproduce the full state.
 */
async function snapshotMarketingLinks(owningOrgId, dppId) {
  if (!owningOrgId) return [];
  const { DPPMarketingLinks } = cds.entities('dpp');
  const links = await SELECT.from(DPPMarketingLinks).where({ owning_organization_ID: owningOrgId });
  return links
    .filter((l) => l.dpp_ID == null || l.dpp_ID === dppId)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((l) => ({
      link_type: l.link_type,
      title: l.title,
      url: l.url,
      is_active: l.is_active,
      display_order: l.display_order,
      valid_from: l.valid_from,
      valid_to: l.valid_to,
      dpp_ID: l.dpp_ID,
    }));
}

/**
 * Document metadata (never binary content) for the DPP's product and batch —
 * all visibilities, since this snapshot reproduces the internal company view.
 */
async function snapshotDocuments(dpp) {
  const { Documents } = cds.entities('dpp');
  const cols = ['ID', 'doc_type', 'title', 'issuer', 'issue_date', 'valid_until', 'file_name', 'mime_type', 'file_size', 'visibility'];
  let rows = await SELECT.from(Documents).columns(cols).where({ product_ID: dpp.product_ID });
  if (dpp.batch_ID) {
    const batchRows = await SELECT.from(Documents).columns(cols).where({ batch_ID: dpp.batch_ID });
    rows = rows.concat(batchRows);
  }
  return rows.map((d) => ({
    id: d.ID,
    doc_type: d.doc_type,
    title: d.title,
    issuer: d.issuer,
    issue_date: d.issue_date,
    valid_until: d.valid_until,
    file_name: d.file_name,
    mime_type: d.mime_type,
    file_size: d.file_size,
    visibility: d.visibility,
  }));
}

/**
 * Footprint values rolled up across the BOM tree at snapshot time, with the
 * component breakdown and internal component names resolved (mirrors the
 * aggregatedFootprint action). Frozen into the snapshot so the read-only version
 * view shows the figures as they were, not a later live recomputation.
 */
async function snapshotAggregated(dppId) {
  const result = await aggregate(dppId);
  const bd = result.breakdown || { own_co2_kg: null, components: [] };
  const { Products } = cds.entities('dpp');
  const ids = [...new Set(bd.components.map((c) => c.component_ID).filter(Boolean))];
  const prods = ids.length
    ? await SELECT.from(Products).columns('ID', 'name').where({ ID: { in: ids } })
    : [];
  const nameById = Object.fromEntries(prods.map((p) => [p.ID, p.name]));
  const components = bd.components.map((c) => ({
    name: c.component_ID ? (nameById[c.component_ID] ?? c.component_ID) : (c.component_name ?? '—'),
    source: c.source,
    unit: c.unit,
    quantity: c.quantity,
    co2_kg: c.co2_kg,
    recycled_pct: c.recycled_pct,
    mass_kg: c.mass_kg,
  }));
  return {
    co2_footprint_kg: result.values?.co2_footprint_kg ?? null,
    recycled_content_pct: result.values?.recycled_content_pct ?? null,
    incomplete: result.incomplete ?? false,
    missing: result.missing ?? [],
    breakdown: { own_co2_kg: bd.own_co2_kg, components },
  };
}

/**
 * Build a comprehensive JSON snapshot of the DPP — Product + Variant (via batch) +
 * Batch + Item + BOM edges PLUS storytelling, marketing links, document metadata
 * and the rolled-up footprint — frozen at this point in time. Used for the
 * `aggregated_snapshot` cache, the PDF renderer, and DPPVersions rows (publish and
 * manual versions). The read-only version view in the UI is reconstructed from this.
 */
async function buildSnapshot(dpp) {
  const { Products, ProductVariants, Batches, ProductItems, ProductBOMs, ProductCategories } = cds.entities('dpp');

  const [product, batch, item] = await Promise.all([
    SELECT.one.from(Products).where({ ID: dpp.product_ID }),
    dpp.batch_ID ? SELECT.one.from(Batches).where({ ID: dpp.batch_ID }) : null,
    dpp.item_ID ? SELECT.one.from(ProductItems).where({ ID: dpp.item_ID }) : null
  ]);

  // Flatten the category association to its display name so the read-only version view
  // and PDF render "Textiles" (not a raw code), and the drift diff reads cleanly. The
  // raw `category_code` FK is dropped to keep a single, stable category field in the hash.
  if (product) {
    if (product.category_code) {
      const cat = await SELECT.one.from(ProductCategories).columns('name').where({ code: product.category_code });
      product.category = cat?.name ?? product.category_code;
    } else {
      product.category = null;
    }
    delete product.category_code;
  }

  // Variant precedence: explicit dpp.variant link → via batch → none.
  let variant = null;
  if (dpp.variant_ID) {
    variant = await SELECT.one.from(ProductVariants).where({ ID: dpp.variant_ID });
  } else if (batch) {
    variant = await SELECT.one.from(ProductVariants).where({ ID: batch.variant_ID });
  }

  let boms = [];
  if (variant) {
    boms = await SELECT.from(ProductBOMs).where({ parent_ID: variant.ID });
  } else {
    const variants = await SELECT.from(ProductVariants)
      .columns(['ID']).where({ product_ID: dpp.product_ID });
    if (variants.length) {
      boms = await SELECT.from(ProductBOMs)
        .where({ parent_ID: { in: variants.map((v) => v.ID) } });
    }
  }

  // Resolve factory/supplier names so the read-only version view renders the batch
  // identically to the live view (which $expands these associations).
  if (batch) {
    const { BusinessPartners } = cds.entities('dpp');
    const [factory, supplier] = await Promise.all([
      batch.factory_ID ? SELECT.one.from(BusinessPartners).columns('ID', 'name').where({ ID: batch.factory_ID }) : null,
      batch.supplier_ID ? SELECT.one.from(BusinessPartners).columns('ID', 'name').where({ ID: batch.supplier_ID }) : null
    ]);
    batch.factory = factory;
    batch.supplier = supplier;
  }

  const owningOrgId = product?.owning_organization_ID;
  const [marketing_links, documents, aggregated] = await Promise.all([
    snapshotMarketingLinks(owningOrgId, dpp.ID),
    snapshotDocuments(dpp),
    snapshotAggregated(dpp.ID)
  ]);

  return {
    captured_at: new Date().toISOString(),
    dpp: {
      id: dpp.ID,
      dpp_type: dpp.dpp_type,
      status: dpp.status,
      visibility: dpp.visibility,
      version: dpp.current_version,
      valid_from: dpp.valid_from
    },
    product,
    variant,
    batch,
    item,
    bom: boms,
    storytelling: dpp.storytelling ?? null,
    marketing_links,
    documents,
    aggregated
  };
}

/**
 * Mark every currently-active QRCodes row for this DPP as replaced, then insert
 * a new active row. Keeps the most-recent QR uniquely `active`.
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

/**
 * Load the readable business codes for a DPP (product GTIN, variant SKU, batch number,
 * item serial/UPI, creation date) used to build a structured QR token (see srv/lib/token.js).
 */
async function tokenContextFor(dpp) {
  const { Products, ProductVariants, Batches, ProductItems } = cds.entities('dpp');
  const [product, batch, item] = await Promise.all([
    dpp.product_ID ? SELECT.one.from(Products).columns('gtin').where({ ID: dpp.product_ID }) : null,
    dpp.batch_ID ? SELECT.one.from(Batches).columns('batch_number', 'variant_ID').where({ ID: dpp.batch_ID }) : null,
    dpp.item_ID ? SELECT.one.from(ProductItems).columns('serial_number', 'upi').where({ ID: dpp.item_ID }) : null
  ]);
  const variantId = dpp.variant_ID || (batch && batch.variant_ID);
  const variant = variantId
    ? await SELECT.one.from(ProductVariants).columns('sku').where({ ID: variantId })
    : null;
  return {
    gtin: product && product.gtin,
    sku: variant && variant.sku,
    batch_number: batch && batch.batch_number,
    serial: item ? item.serial_number || item.upi : null,
    date: dpp.createdAt || new Date().toISOString()
  };
}

/**
 * Next version number for a DPP = highest existing DPPVersions.version_number + 1.
 * Versions are created only on publish, so this is a clean, monotonic per-DPP
 * sequence (first publish → 1).
 */
async function nextVersionNumber(dppId) {
  const { DPPVersions } = cds.entities('dpp');
  const rows = await SELECT.from(DPPVersions).columns('version_number').where({ dpp_ID: dppId });
  return rows.reduce((m, r) => Math.max(m, r.version_number || 0), 0) + 1;
}

/**
 * Drift detection: for each given DPP that is `approved` or `published`, rebuild its
 * snapshot, hash it, and compare to the stored baseline (the hash captured at the last
 * approve/publish). If they differ, the underlying data changed → revert status to
 * `draft` so it must be re-approved and re-published. Writes via the DB-level entity:
 * this bypasses the archived-edit gate, the audit stamping, AND the service after-hooks
 * (no re-entrancy), and never touches current_version / published_at (the live consumer
 * version stays put until re-publish). Reads via the DB-level entity too, so the READ
 * tenant filter does not prune the cross-DPP set.
 */
async function reevaluateDrift(dppIds) {
  const ids = [...new Set((dppIds || []).filter(Boolean))];
  if (!ids.length) return;
  const DPPdb = cds.entities('dpp').DPPs;
  const rows = await SELECT.from(DPPdb).where({ ID: { in: ids }, status: { in: ['approved', 'published'] } });
  for (const dpp of rows) {
    if (!dpp.baseline_content_hash) continue;
    const hash = contentHash(await buildSnapshot(dpp));
    if (hash !== dpp.baseline_content_hash) {
      await UPDATE(DPPdb).set({ status: 'draft', last_updated: new Date().toISOString() }).where({ ID: dpp.ID });
    }
  }
}

/**
 * Restore the drift-baseline invariant for legacy/seed DPPs. A DPP that is `approved` or
 * `published` but was NOT taken through approveDPP/publishDPP (e.g. CSV-seeded directly as
 * 'published') has no `baseline_content_hash` and no `aggregated_snapshot`. Without the
 * hash, reevaluateDrift() skips the DPP (edits never revert it to draft); without the
 * snapshot, the internal view cannot mark unapproved changes after an edit. Anchor both
 * from the current content ONCE. Idempotent (only fills NULLs).
 */
async function anchorUnbaselinedDPPs() {
  const DPPdb = cds.entities('dpp').DPPs;
  const rows = await SELECT.from(DPPdb).where({ status: { in: ['approved', 'published'] } });
  let anchored = 0;
  for (const dpp of rows) {
    if (dpp.baseline_content_hash && dpp.aggregated_snapshot) continue;
    const snap = await buildSnapshot(dpp);
    await UPDATE(DPPdb)
      .set({
        baseline_content_hash: dpp.baseline_content_hash || contentHash(snap),
        aggregated_snapshot: dpp.aggregated_snapshot || JSON.stringify(snap)
      })
      .where({ ID: dpp.ID });
    anchored += 1;
  }
  if (anchored) LOG.info('anchored drift baseline for legacy/seed DPPs', { count: anchored });
}

/**
 * Freeze a consumer_snapshot for every publicly-visible DPP that has none yet — i.e.
 * seed/legacy DPPs marked 'published' in the DB that never went through publishDPP.
 * Without a frozen snapshot, public-handler.js#loadDPPByToken falls back to LIVE
 * rendering, so an edit / re-approve would leak to the external view before the next
 * publish. Freezing the current (seeded = published) state as a DPPVersions publish row
 * makes the public view serve that frozen state until the next real publish. Idempotent
 * (skips DPPs that already carry a consumer_snapshot version).
 */
async function freezeLegacyConsumerSnapshots() {
  const DPPdb = cds.entities('dpp').DPPs;
  const { DPPVersions } = cds.entities('dpp');
  const { buildConsumerSnapshot } = require('./public-handler'); // lazy: avoid load cycle
  const rows = await SELECT.from(DPPdb).where({ visibility: 'public' });
  let frozen = 0;
  for (const dpp of rows) {
    // Mirror public-handler.js#isPubliclyVisible: served once published (published_at) or
    // seeded as published/archived.
    const publiclyVisible =
      dpp.published_at != null || dpp.status === 'published' || dpp.status === 'archived';
    if (!publiclyVisible) continue;

    const existing = await SELECT.from(DPPVersions).columns('ID', 'consumer_snapshot').where({ dpp_ID: dpp.ID });
    if (existing.some((v) => v.consumer_snapshot)) continue; // already has a frozen publish

    const snap = await buildSnapshot(dpp);
    const consumerJson = JSON.stringify(await buildConsumerSnapshot(dpp));
    await INSERT.into(DPPVersions).entries({
      ID: randomUUID(),
      dpp_ID: dpp.ID,
      version_number: dpp.current_version || 1,
      snapshot_date: dpp.published_at || new Date().toISOString(),
      change_reason: null,
      changed_by_ID: null,
      source: 'publish',
      snapshot_data: JSON.stringify(snap),
      consumer_snapshot: consumerJson,
      content_hash: contentHash(snap)
    });
    frozen += 1;
  }
  if (frozen) LOG.info('froze consumer snapshot for legacy/seed DPPs', { count: frozen });
}

module.exports = (srv) => {
  const { DPPs } = srv.entities;

  // Once the runtime is up, anchor a drift baseline for any legacy/seed DPP that is
  // 'published'/'approved' without one — otherwise source-data edits never revert it to
  // draft and it can never be re-approved/re-published (see anchorUnbaselinedDPPs).
  cds.once('served', () =>
    anchorUnbaselinedDPPs().catch((e) => LOG.error('baseline anchoring failed', e))
  );

  // Freeze consumer snapshots for legacy/seed published DPPs so the external view is never
  // served live — edits / re-approvals stay invisible until the next publish. Skipped in
  // the jest suite (DPP_TEST_AUTH): several integration tests intentionally exercise the
  // live-render path for seed DPPs; the function is covered directly by
  // test/integration/consumer-snapshot-freeze.test.js.
  if (process.env.DPP_TEST_AUTH !== 'basic') {
    cds.once('served', () =>
      freezeLegacyConsumerSnapshots().catch((e) => LOG.error('consumer snapshot freeze failed', e))
    );
  }

  // ----- DPPVersions: immutable audit trail (US5.9) -----
  // Reject every OData write; rows are inserted server-side on publish (see publishDPP),
  // which targets the DB entity and therefore bypasses this gate.
  srv.before(['CREATE', 'UPDATE', 'DELETE'], 'DPPVersions', (req) => {
    req.reject(403, 'DPP versions are immutable and cannot be modified.');
  });

  // ----- Defaults on CREATE -----

  srv.before('CREATE', DPPs, async (req) => {
    if (req.data.product_ID) {
      await requireOwningOrg(req, 'Products', req.data.product_ID);
    }
    if (!req.data.status) req.data.status = 'draft';
    if (!req.data.visibility) req.data.visibility = 'internal';
    if (!req.data.dpp_type) req.data.dpp_type = 'product';
    if (!req.data.current_version) req.data.current_version = 1;
    req.data.last_updated = new Date().toISOString();
  });

  srv.before('UPDATE', DPPs, async (req) => {
    req.data.last_updated = new Date().toISOString();

    // An archived DPP is frozen: it stays consumer-visible but cannot be edited.
    // Lifecycle actions (archive/unarchive) write via the DB-level entity and so
    // bypass this OData gate; only direct client PATCHes are checked here. The key
    // arrives as a bound param on PATCH — programmatic .where() updates carry none.
    const key = req.params && req.params[req.params.length - 1];
    const id = key && typeof key === 'object' ? key.ID : key;
    if (id) {
      const current = await SELECT.one.from(DPPs).columns('status').where({ ID: id });
      if (current && current.status === 'archived') {
        req.reject(400, 'This DPP is archived and cannot be modified. Unarchive it first.');
      }
      // Approved/published are outcomes of the approve/publish workflow (mandatory-field
      // gate, drift baseline, version snapshot, QR token) — a direct PATCH would skip all
      // of it. The lifecycle actions write programmatically (no bound key params) or via
      // the DB-level entity, so only client PATCHes are rejected here.
      const target = req.data.status;
      if ((target === 'approved' || target === 'published') && current && current.status !== target) {
        req.reject(400, 'This status can only be set through the approval or publishing workflow.');
      }
    }
  });

  // ----- Action: approveDPP (draft → approved) -----

  srv.on('approveDPP', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    await requireOwningOrg(req, 'DPPs', id, DPP_OWNER_PATH);
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, 'DPP not found.');

    if (dpp.status === 'archived') req.reject(400, 'This DPP is archived.');
    if (dpp.status !== 'draft' && dpp.status !== 'in_review') return dpp;

    const errors = await checkDPPReady(dpp);
    if (errors.length) req.reject(400, `DPP cannot be approved: ${errors.join(' | ')}`);

    const now = new Date().toISOString();

    // Preserve the superseded (previously approved/published) state as an immutable
    // approve-version so the old data stays retrievable in the history. No
    // consumer_snapshot: the public view keeps serving the latest PUBLISH version.
    // A first-time approval has no prior approved state (no aggregated_snapshot) —
    // nothing to preserve then. Inserted on the DB entity to bypass the read-only gate.
    if (dpp.aggregated_snapshot) {
      const { DPPVersions } = cds.entities('dpp');
      let oldHash = dpp.baseline_content_hash || null;
      try { oldHash = contentHash(JSON.parse(dpp.aggregated_snapshot)); } catch { /* keep baseline hash */ }
      await INSERT.into(DPPVersions).entries({
        ID: randomUUID(),
        dpp_ID: id,
        version_number: await nextVersionNumber(id),
        snapshot_date: now,
        change_reason: null,
        changed_by_ID: req.user._appUserId || null,
        source: 'approve',
        snapshot_data: dpp.aggregated_snapshot,
        consumer_snapshot: null,
        content_hash: oldHash
      });
    }

    // Anchor the drift baseline AND the approved-state snapshot to the newly approved
    // content — the "unapproved changes" markers on the internal view clear with this.
    const snap = await buildSnapshot(dpp);
    await UPDATE(DPPs)
      .set({
        status: 'approved',
        approved_at: now,
        baseline_content_hash: contentHash(snap),
        aggregated_snapshot: JSON.stringify(snap)
      })
      .where({ ID: id });

    return SELECT.one.from(DPPs).where({ ID: id });
  });

  // ----- Action: publishDPP (approved → published, snapshot + QR) -----

  srv.on('publishDPP', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    const changeReason = req.data.change_reason || null;
    await requireOwningOrg(req, 'DPPs', id, DPP_OWNER_PATH);
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, 'DPP not found.');
    if (dpp.status === 'archived') req.reject(400, 'This DPP is archived and cannot be published.');

    const errors = await checkDPPReady(dpp);
    if (errors.length) req.reject(400, `DPP cannot be published: ${errors.join(' | ')}`);

    const now = new Date().toISOString();
    // Draw from the shared per-DPP version sequence so publish and manual versions
    // never collide (see nextVersionNumber).
    const nextVersion = await nextVersionNumber(id);
    const qrToken = dpp.qr_token || tokens.generate(await tokenContextFor(dpp));
    const payloadUrl = `${process.env.PUBLIC_BASE_URL || ''}/public/dpp/${qrToken}`;
    // Shareable direct link (US6.10): token-based, identical to the QR target so a
    // browser opening it gets the consumer SPA shell (see router/approuter.js).
    const publicUrl = payloadUrl;

    await UPDATE(DPPs).set({
      status: 'published',
      published_at: now,
      qr_token: qrToken,
      qr_payload_url: payloadUrl,
      public_url: publicUrl,
      current_version: nextVersion,
      last_updated: now
    }).where({ ID: id });

    const draft = await SELECT.one.from(DPPs).where({ ID: id });
    const snap = await buildSnapshot(draft);
    const snapshotJson = JSON.stringify(snap);
    // Normalized hash (volatile/audit/surrogate fields excluded) — the drift baseline.
    const normalizedHash = contentHash(snap);
    // Freeze the consumer-facing payload so the public view keeps showing THIS version
    // until the next publish (see public-handler.js#loadDPPByToken). Lazy require avoids
    // any module load-order cycle.
    const { buildConsumerSnapshot } = require('./public-handler');
    const consumerJson = JSON.stringify(await buildConsumerSnapshot(draft));

    await UPDATE(DPPs)
      .set({ aggregated_snapshot: snapshotJson, baseline_content_hash: normalizedHash })
      .where({ ID: id });

    // US5.9 — append an immutable version record: the frozen internal snapshot, the
    // frozen consumer payload, the change reason and the normalized content hash.
    // Inserted on the DB entity so it bypasses the read-only OData gate below.
    const { DPPVersions } = cds.entities('dpp');
    await INSERT.into(DPPVersions).entries({
      ID: randomUUID(),
      dpp_ID: id,
      version_number: nextVersion,
      snapshot_date: now,
      change_reason: changeReason,
      changed_by_ID: req.user._appUserId || null,
      source: 'publish',
      snapshot_data: snapshotJson,
      consumer_snapshot: consumerJson,
      content_hash: normalizedHash
    });

    const qrImageUrl = `${process.env.PUBLIC_BASE_URL || ''}/public/dpp/${qrToken}/qr.png`;
    await rotateActiveQRCode(id, payloadUrl, qrImageUrl);

    return SELECT.one.from(DPPs).where({ ID: id });
  });

  // ----- Action: archiveDPP -----

  srv.on('archiveDPP', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    await requireOwningOrg(req, 'DPPs', id, DPP_OWNER_PATH);
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, 'DPP not found.');

    await UPDATE(DPPs)
      .set({ status: 'archived', archived_at: new Date().toISOString() })
      .where({ ID: id });

    return SELECT.one.from(DPPs).where({ ID: id });
  });

  // ----- Action: unarchiveDPP (company_advanced only) -----
  // Brings a frozen passport back into the active lifecycle. The restored status
  // is the furthest stage it had reached before archiving (published › approved ›
  // draft), inferred from the lifecycle timestamps — re-publishing is not required
  // for a previously-published DPP. Writes via the DB-level entity so it bypasses
  // the archived-edit gate in before('UPDATE', DPPs).
  srv.on('unarchiveDPP', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    await requireOwningOrg(req, 'DPPs', id, DPP_OWNER_PATH);
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, 'DPP not found.');
    if (dpp.status !== 'archived') return dpp; // idempotent: nothing to do

    const restoredStatus = dpp.published_at ? 'published' : (dpp.approved_at ? 'approved' : 'draft');
    await UPDATE(cds.entities('dpp').DPPs)
      .set({ status: restoredStatus, archived_at: null, last_updated: new Date().toISOString() })
      .where({ ID: id });

    return SELECT.one.from(DPPs).where({ ID: id });
  });

  // ----- Drift: revert approved/published DPPs to draft when their content changes -----
  // The DPP's own editable content is storytelling + valid_from; their PATCH can drift.
  // Lifecycle/meta updates (status, *_at, qr_*, visibility, current_version, hashes) do
  // NOT count as content and are skipped — this also prevents re-entrancy with the
  // approve/publish handlers, which only set those meta fields.
  srv.after('UPDATE', DPPs, async (_data, req) => {
    const touched = Object.keys(req.data || {});
    if (!touched.includes('storytelling') && !touched.includes('valid_from')) return;
    const key = req.params && req.params[req.params.length - 1];
    const id = key && typeof key === 'object' ? key.ID : key;
    if (id) await reevaluateDrift([id]);
  });

  // ----- Function: validationStatus (readiness + drift, for the DPP-detail panel) -----
  // Read-only (NOT a write event) → also readable by company_user. Returns a JSON string.
  srv.on('validationStatus', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    await requireOwningOrg(req, 'DPPs', id, DPP_OWNER_PATH);
    const { DPPVersions } = cds.entities('dpp');
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, 'DPP not found.');

    // Full unified check catalogue — same evaluation the approve/publish gate runs.
    const validation = evaluateDppChecks(await loadDppValidationContext(dpp));

    // Current internal state — baseline input for both diffs below (computed once).
    const cur = await buildSnapshot(dpp);

    // Latest PUBLISHED version = what the consumer currently sees. Approve-snapshot
    // rows carry no consumer_snapshot (they preserve superseded states) and must not
    // shift the consumer-facing live version or the publish-pending diff.
    const versions = await SELECT.from(DPPVersions)
      .columns('version_number', 'snapshot_data', 'consumer_snapshot')
      .where({ dpp_ID: id })
      .orderBy('version_number desc');
    const latestPublished = versions.find((v) => v.consumer_snapshot) || null;
    const liveVersion = latestPublished ? latestPublished.version_number : null;

    let changedFields = [];
    // Without a published version snapshot there is no baseline to diff against. For a DPP
    // still in pre-publication (draft / in_review) that legitimately means "everything is
    // pending". But for one already marked approved/published/archived that never went
    // through publishDPP (e.g. seed/imported data), claiming "pending changes / Publishing
    // will create v1" is misleading — it is already published and there is no Publish button.
    const prePublication = dpp.status === 'draft' || dpp.status === 'in_review';
    let pendingChanges = liveVersion == null ? prePublication : false;
    if (latestPublished) {
      let prev = null;
      try { prev = JSON.parse(latestPublished.snapshot_data); } catch { /* keep null */ }
      changedFields = diffNormalized(prev, cur);
      pendingChanges = changedFields.length > 0;
    }

    // Unapproved changes vs the last approved/published state (aggregated_snapshot) —
    // drives the amber field markers on the internal DPP view. Empty right after an
    // approve (the snapshot is re-anchored there); empty too for DPPs without a prior
    // approved state (nothing to compare against).
    let unapprovedChanges = [];
    if (dpp.aggregated_snapshot) {
      let approvedSnap = null;
      try { approvedSnap = JSON.parse(dpp.aggregated_snapshot); } catch { /* keep null */ }
      if (approvedSnap) unapprovedChanges = diffNormalized(approvedSnap, cur);
    }

    return JSON.stringify({
      status: dpp.status,
      live_version: liveVersion,
      next_version: await nextVersionNumber(id),
      can_approve: validation.can_approve,
      missing_mandatory: validation.missing_mandatory,
      checks: validation.checks,
      passed: validation.passed,
      total: validation.total,
      score: validation.score,
      percent: validation.percent,
      mandatory_failed: validation.mandatory_failed,
      pending_changes: pendingChanges,
      changed_fields: changedFields,
      unapproved_changes: unapprovedChanges,
      has_unapproved: unapprovedChanges.length > 0
    });
  });

  // ----- Function: validationOverview (unbound; org-wide readiness for the Validation page) -----
  // Read-only (NOT a write event) → also readable by company_user. Bulk-loads the caller
  // org's DPPs with their source records in a handful of IN-list queries (same pattern as
  // compliance-handlers.js) and evaluates the unified check catalogue per DPP. Returns a
  // JSON string: { generated_at, dpps: [{ dpp, product, variant, batch, item, validation }] }.
  srv.on('validationOverview', async (req) => {
    const orgId = await requireActiveUser(req);
    const { Products, ProductVariants, Batches, ProductItems, ProductBOMs, BatchComponents } = cds.entities('dpp');
    const DPPdb = cds.entities('dpp').DPPs;

    const empty = () => JSON.stringify({ generated_at: new Date().toISOString(), dpps: [] });

    const products = await SELECT.from(Products).where({ owning_organization_ID: orgId });
    if (!products.length) return empty();
    const productIds = products.map((p) => p.ID);
    const pById = Object.fromEntries(products.map((p) => [p.ID, p]));

    const dpps = await SELECT.from(DPPdb).where({ product_ID: { in: productIds } });
    if (!dpps.length) return empty();

    const variants = await SELECT.from(ProductVariants).where({ product_ID: { in: productIds } });
    const vById = Object.fromEntries(variants.map((v) => [v.ID, v]));
    const variantIds = variants.map((v) => v.ID);

    const batches = variantIds.length
      ? await SELECT.from(Batches).where({ variant_ID: { in: variantIds } })
      : [];
    const bById = Object.fromEntries(batches.map((b) => [b.ID, b]));
    const batchIds = batches.map((b) => b.ID);

    const itemIds = [...new Set(dpps.map((d) => d.item_ID).filter(Boolean))];
    const items = itemIds.length
      ? await SELECT.from(ProductItems).where({ ID: { in: itemIds } })
      : [];
    const iById = Object.fromEntries(items.map((i) => [i.ID, i]));

    const boms = variantIds.length
      ? await SELECT.from(ProductBOMs).where({ parent_ID: { in: variantIds } })
      : [];
    const bomsByVariant = new Map();
    for (const b of boms) {
      if (!bomsByVariant.has(b.parent_ID)) bomsByVariant.set(b.parent_ID, []);
      bomsByVariant.get(b.parent_ID).push(b);
    }

    const comps = batchIds.length
      ? await SELECT.from(BatchComponents).where({ batch_ID: { in: batchIds } })
      : [];
    const compsByBatch = new Map();
    for (const c of comps) {
      if (!compsByBatch.has(c.batch_ID)) compsByBatch.set(c.batch_ID, []);
      compsByBatch.get(c.batch_ID).push(c);
    }

    const entries = dpps
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .map((dpp) => {
        const product = pById[dpp.product_ID] || null;
        const batch = dpp.batch_ID ? bById[dpp.batch_ID] || null : null;
        const variantId = dpp.variant_ID || (batch && batch.variant_ID) || null;
        const variant = variantId ? vById[variantId] || null : null;
        const item = dpp.item_ID ? iById[dpp.item_ID] || null : null;
        const bom = variant ? bomsByVariant.get(variant.ID) || [] : [];
        const batchComponents = batch ? compsByBatch.get(batch.ID) || [] : [];

        const validation = evaluateDppChecks({ dpp, product, variant, batch, item, bom, batchComponents });

        return {
          dpp: {
            ID: dpp.ID,
            status: dpp.status,
            visibility: dpp.visibility,
            dpp_type: dpp.dpp_type,
            current_version: dpp.current_version,
            product_ID: dpp.product_ID,
            variant_ID: variantId,
            batch_ID: dpp.batch_ID,
            item_ID: dpp.item_ID,
            createdAt: dpp.createdAt
          },
          product: product ? { ID: product.ID, name: product.name } : null,
          variant: variant ? { ID: variant.ID, color: variant.color, size: variant.size, sku: variant.sku } : null,
          batch: batch ? { ID: batch.ID, batch_number: batch.batch_number } : null,
          item: item ? { ID: item.ID, serial_number: item.serial_number, upi: item.upi } : null,
          validation: {
            checks: validation.checks,
            can_approve: validation.can_approve,
            missing_mandatory: validation.missing_mandatory,
            mandatory_failed: validation.mandatory_failed,
            passed: validation.passed,
            total: validation.total,
            score: validation.score,
            percent: validation.percent
          }
        };
      });

    return JSON.stringify({ generated_at: new Date().toISOString(), dpps: entries });
  });

  // ----- Action: regenerateQRToken (US6.14) -----

  srv.on('regenerateQRToken', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    await requireOwningOrg(req, 'DPPs', id, DPP_OWNER_PATH);
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, 'DPP not found.');
    if (dpp.status === 'archived') req.reject(400, 'This DPP is archived and cannot be modified. Unarchive it first.');

    const qrToken = tokens.generate(await tokenContextFor(dpp));
    const payloadUrl = `${process.env.PUBLIC_BASE_URL || ''}/public/dpp/${qrToken}`;
    const qrImageUrl = `${process.env.PUBLIC_BASE_URL || ''}/public/dpp/${qrToken}/qr.png`;
    // Keep the shareable direct link in sync with the rotated token (US6.10/US6.14).
    await UPDATE(DPPs)
      .set({ qr_token: qrToken, qr_payload_url: payloadUrl, public_url: payloadUrl })
      .where({ ID: id });

    await rotateActiveQRCode(id, payloadUrl, qrImageUrl);

    return SELECT.one.from(DPPs).where({ ID: id });
  });

  // ----- Function: generateQRCode (returns base64 PNG) -----

  srv.on('generateQRCode', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    await requireOwningOrg(req, 'DPPs', id, DPP_OWNER_PATH);
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, 'DPP not found.');
    if (!dpp.qr_token) req.reject(409, 'This DPP has no QR code yet. Please publish it first.');

    // Always anchor the scan target to the current PUBLIC_BASE_URL + token. The
    // stored qr_payload_url is denormalized and can be host-less (seed data ships
    // a relative `/public/dpp/<token>`, which a phone scanner shows as raw text)
    // or stale across environments (dev :5173 vs prod domain). The token is the
    // canonical key; PUBLIC_BASE_URL is the per-environment source of truth.
    const base = process.env.PUBLIC_BASE_URL || '';
    const payload = `${base}/public/dpp/${dpp.qr_token}`;

    const QRCode = require('qrcode');
    const pngBuffer = await QRCode.toBuffer(payload, { type: 'png', margin: 1, scale: 6 });
    return { png: pngBuffer.toString('base64'), payload };
  });

  // ----- Function: aggregatedFootprint (live BOM rollup for pre-publish review) -----

  srv.on('aggregatedFootprint', DPPs, async (req) => {
    const id = req.params[req.params.length - 1].ID;
    await requireOwningOrg(req, 'DPPs', id, DPP_OWNER_PATH);
    const dpp = await SELECT.one.from(DPPs).where({ ID: id });
    if (!dpp) req.reject(404, 'DPP not found.');

    const result = await aggregate(id);
    const bd = result.breakdown || { own_co2_kg: null, components: [] };

    // Resolve internal component names for the breakdown display.
    const { Products } = cds.entities('dpp');
    const ids = [...new Set(bd.components.map((c) => c.component_ID).filter(Boolean))];
    const prods = ids.length
      ? await SELECT.from(Products).columns('ID', 'name').where({ ID: { in: ids } })
      : [];
    const nameById = Object.fromEntries(prods.map((p) => [p.ID, p.name]));
    const components = bd.components.map((c) => ({
      name: c.component_ID ? (nameById[c.component_ID] ?? c.component_ID) : (c.component_name ?? '—'),
      source: c.source,
      unit: c.unit,
      quantity: c.quantity,
      co2_kg: c.co2_kg,
      recycled_pct: c.recycled_pct,
      mass_kg: c.mass_kg,
    }));

    return {
      co2_footprint_kg:      result.values?.co2_footprint_kg ?? null,
      recycled_content_pct:  result.values?.recycled_content_pct ?? null,
      incomplete:            result.incomplete ?? false,
      missing:               JSON.stringify(result.missing ?? []),
      breakdown:             JSON.stringify({ own_co2_kg: bd.own_co2_kg, components })
    };
  });
};

module.exports.buildSnapshot = buildSnapshot;
module.exports.rotateActiveQRCode = rotateActiveQRCode;
module.exports.reevaluateDrift = reevaluateDrift;
module.exports.anchorUnbaselinedDPPs = anchorUnbaselinedDPPs;
module.exports.freezeLegacyConsumerSnapshots = freezeLegacyConsumerSnapshots;
