'use strict';

/**
 * One-off data migration for the Epic 12 attribute-bag rework, for PERSISTENT
 * databases (deployed HANA / file-based sqlite). Dev/test environments need
 * nothing — their databases deploy from the already-migrated seed CSVs.
 *
 * RUN THIS BEFORE deploying the schema version that drops the old columns
 * (the values are unreadable afterwards):
 *
 *   node scripts/migrate-attributes.js
 *
 * What it does, idempotently:
 *  1. Products: copies the former textile columns (fibre_composition, the four
 *     care/repair/reuse/disposal instruction blocks and their video/shop links)
 *     into the `attributes` JSON bag (existing bag keys win).
 *  2. ProductVariants: copies color/size into the bag.
 *  3. ProductBOMs: copies component_fibre_composition → component_composition.
 *  4. Resets DPPs.baseline_content_hash to NULL for approved/published DPPs —
 *     the snapshot shape changes with the migration, and the server re-anchors
 *     missing baselines on startup (dpp-handlers.js#anchorUnbaselinedDPPs), so
 *     passports keep their status instead of mass-reverting to draft.
 */

const cds = require('@sap/cds');

const PRODUCT_KEYS = [
  'fibre_composition',
  'care_instructions', 'care_video_url', 'care_products_url',
  'repair_instructions', 'repair_video_url', 'repair_products_url',
  'reuse_instructions', 'reuse_video_url', 'reuse_products_url',
  'disposal_instructions', 'disposal_video_url', 'disposal_products_url',
];
const VARIANT_KEYS = ['color', 'size'];

const parseBag = (json) => {
  if (!json) return {};
  try { const o = JSON.parse(json); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
};

async function moveColumns(db, table, keys) {
  let rows;
  try {
    rows = await db.run(`SELECT * FROM ${table}`);
  } catch (e) {
    console.error(`Cannot read ${table} — run this script BEFORE deploying the column drop. (${e.message})`);
    process.exitCode = 1;
    return 0;
  }
  let changed = 0;
  for (const row of rows) {
    const bag = parseBag(row.attributes ?? row.ATTRIBUTES);
    let touched = false;
    for (const key of keys) {
      const v = row[key] ?? row[key.toUpperCase()];
      if (v != null && String(v).trim() !== '' && bag[key] === undefined) {
        bag[key] = v;
        touched = true;
      }
    }
    if (!touched) continue;
    const sorted = Object.fromEntries(Object.keys(bag).sort().map((k) => [k, bag[k]]));
    await db.run(
      `UPDATE ${table} SET attributes = ? WHERE ID = ?`,
      [JSON.stringify(sorted), row.ID ?? row.id]
    );
    changed++;
  }
  console.log(`${table}: moved column values into the attributes bag for ${changed} row(s).`);
  return changed;
}

(async () => {
  const db = await cds.connect.to('db');

  await moveColumns(db, 'dpp_Products', PRODUCT_KEYS);
  await moveColumns(db, 'dpp_ProductVariants', VARIANT_KEYS);

  try {
    await db.run(
      `UPDATE dpp_ProductBOMs SET component_composition = component_fibre_composition
       WHERE component_fibre_composition IS NOT NULL AND component_composition IS NULL`
    );
    console.log('dpp_ProductBOMs: copied component_fibre_composition → component_composition.');
  } catch (e) {
    console.log(`dpp_ProductBOMs: rename copy skipped (${e.message}).`);
  }

  // Re-baseline: NULL the drift anchors; anchorUnbaselinedDPPs() re-computes them
  // from the migrated snapshot shape on the next server start.
  const res = await db.run(
    `UPDATE dpp_DPPs SET baseline_content_hash = NULL WHERE status IN ('approved', 'published')`
  );
  console.log(`dpp_DPPs: cleared baseline_content_hash for re-anchoring (${res ?? 'ok'}).`);

  await cds.disconnect?.();
  console.log('Done. Deploy the new schema now; baselines re-anchor on server start.');
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
