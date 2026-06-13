'use strict';

/**
 * One-off helper to produce a bcrypt hash for seeding db/data/dpp-Users.csv.
 *
 *   node scripts/hash-password.js "<plaintext>"
 *
 * Paste the printed hash into the `password_hash` column. Commit ONLY the hash —
 * never the plaintext. (bcrypt hashes contain `$` and `/` but never `;`, so they
 * are safe unquoted in the `;`-delimited CSV.)
 */
const bcrypt = require('bcryptjs');

const plain = process.argv[2];
if (!plain) {
  console.error('Usage: node scripts/hash-password.js "<plaintext>"');
  process.exit(1);
}

const cost = parseInt(process.env.BCRYPT_COST || '12', 10);
console.log(bcrypt.hashSync(plain, cost));
