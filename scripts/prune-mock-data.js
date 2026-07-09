'use strict';

/**
 * OPTIONAL blank-deploy helper — NOT wired into `npm run build` anymore.
 *
 * db/data now ships a single curated demo product (the Classic T-Shirt + its material
 * components, Greenline org, users alice/carol, the Greenline business partners), so the
 * default production build (`cds build --production`) deploys exactly that curated seed.
 * The removed mock data (jacket/hoodie chains, second tenant) lives under test/fixtures/data
 * and is loaded only by the jest suite (see test/helpers/loadDemoFixtures.js).
 *
 * Run this MANUALLY after `cds build --production` only if you want a BLANK deployment
 * (bootstrap minimum below); it rewrites the packaged copies under gen/db/src/gen/data:
 *
 *   - dpp-Users.csv          → only `usr-alice` (alice.advanced, company_advanced)
 *   - dpp-Organizations.csv  → only `org-greenline` (alice's tenant anchor)
 *   - dpp-ProductCategories.csv → kept in full (category master data, not mock)
 *
 * Every other CSV is truncated to its header. The per-file .hdbtabledata artifacts use
 * `include_filter: []` (full-table imports), so an empty CSV actively CLEARS the
 * corresponding table on (re)deployment — stale demo rows cannot survive a redeploy.
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
