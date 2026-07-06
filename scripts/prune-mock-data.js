'use strict';

/**
 * Blank the PRODUCTION seed data after `cds build --production`.
 *
 * Local development and the jest suite keep the full demo data in db/data —
 * this script only rewrites the packaged copies under gen/db/src/gen/data, so
 * the deployed HDI container starts empty except for the bootstrap minimum:
 *
 *   - dpp-Users.csv          → only `usr-alice` (alice.advanced, company_advanced)
 *   - dpp-Organizations.csv  → only `org-greenline` (alice's tenant anchor)
 *   - dpp-ProductCategories.csv → kept in full (category master data, not mock)
 *
 * Every other CSV is truncated to its header. The per-file .hdbtabledata
 * artifacts use `include_filter: []` (full-table imports), so an empty CSV
 * actively CLEARS the corresponding table on (re)deployment — stale demo rows
 * cannot survive a redeploy.
 *
 * Wired into `npm run build` (see package.json), which the MTA build runs.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'gen', 'db', 'src', 'gen', 'data');

// filename → predicate deciding which data rows to keep (header always kept).
// Files without an entry are truncated to header-only.
const KEEP_ROWS = {
  'dpp-Users.csv': (id) => id === 'usr-alice',
  'dpp-Organizations.csv': (id) => id === 'org-greenline',
  'dpp-ProductCategories.csv': () => true,
};

if (!fs.existsSync(DATA_DIR)) {
  console.error(`prune-mock-data: ${DATA_DIR} not found — run \`cds build --production\` first.`);
  process.exit(1);
}

let bootstrap = 0;
let emptied = 0;
for (const file of fs.readdirSync(DATA_DIR)) {
  if (!file.endsWith('.csv')) continue;
  const p = path.join(DATA_DIR, file);
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
  const keep = KEEP_ROWS[file] || (() => false);
  // The row ID is the first `;`-separated cell — safe even for rows with quoted
  // JSON payloads later in the line.
  const body = lines.slice(1).filter((l) => keep(l.split(';')[0]));
  fs.writeFileSync(p, [lines[0], ...body].join('\n') + '\n');
  if (body.length) bootstrap += 1;
  else emptied += 1;
  console.log(`prune-mock-data: ${file} → ${body.length} row(s)`);
}
console.log(`prune-mock-data: done — ${bootstrap} bootstrap file(s) kept, ${emptied} emptied.`);
