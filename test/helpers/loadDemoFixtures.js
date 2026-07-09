'use strict';

/**
 * Test-only demo fixtures loader.
 *
 * The shipped seed in db/data was reduced to a single curated product (the Classic T-Shirt
 * plus its material components) for one organization (Greenline). The rows that used to live
 * in db/data — the jacket/hoodie/yarn chains and the second tenant (Fashionista + user dan +
 * its partner) — moved to test/fixtures/data so the integration suite keeps seeing the full
 * historical dataset. Call this in a `beforeAll` of any integration test that needs those
 * removed rows (a second organization/user, or the jacket graph, or org-wide counts).
 *
 * Rows are inserted at DB level via cds.ql (bypassing service handlers, exactly like CAP's own
 * CSV seed) in FK-safe order, with values coerced to the CDS element types. The curated rows
 * already loaded by cds.test() from db/data are NOT touched.
 */

const fs = require('fs');
const path = require('path');
const cds = require('@sap/cds');

const DATA_DIR = path.join(__dirname, '..', 'fixtures', 'data');

// Parent-before-child so runtime referential integrity holds. DPPs precede ProductBOMs /
// BatchComponents / QRCodes / DPPMarketingLinks because those carry FKs into DPPs (sub_dpp / dpp).
const ORDER = [
  'Organizations', 'Users', 'BusinessPartners', 'BusinessPartnerRoles',
  'Products', 'ProductVariants', 'Batches', 'ProductItems',
  'DPPs', 'QRCodes', 'ProductBOMs', 'BatchComponents', 'DPPMarketingLinks'
];

/** Parse a `;`-delimited, `"`-quoted CSV (doubled `""` escapes; quotes may span delimiters). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ';') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  // Drop trailing blank lines.
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Coerce a raw CSV string to the JS value for the given CDS element (empty ⇒ null). */
function coerce(value, element) {
  if (value === undefined || value === '') return null;
  const type = element && element.type;
  if (type === 'cds.Boolean') return value === 'true';
  if (type === 'cds.Integer' || type === 'cds.Integer64') return parseInt(value, 10);
  if (type === 'cds.Decimal' || type === 'cds.Double' || type === 'cds.DecimalFloat') return Number(value);
  return value; // strings, dates and timestamps are accepted as ISO strings
}

async function loadDemoFixtures() {
  const model = cds.entities('dpp');
  for (const name of ORDER) {
    const file = path.join(DATA_DIR, `dpp-${name}.csv`);
    if (!fs.existsSync(file)) continue;
    const entity = model[name];
    if (!entity) continue;
    const rows = parseCsv(fs.readFileSync(file, 'utf8'));
    if (rows.length < 2) continue;
    const header = rows[0];
    const entries = rows.slice(1).map((cells) => {
      const o = {};
      header.forEach((col, idx) => { o[col] = coerce(cells[idx], entity.elements[col]); });
      return o;
    });
    if (entries.length) await INSERT.into(entity).entries(entries);
  }
}

module.exports = loadDemoFixtures;
module.exports.loadDemoFixtures = loadDemoFixtures;
