'use strict';

const { randomBytes } = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Password helpers for the app-managed (own) authentication.
 *
 * Hashing uses bcryptjs (pure JS) on purpose: the CF nodejs buildpack on the
 * locked-down UCC tenant has no reliable C++ toolchain for native bcrypt/argon2.
 * Cost factor 12 (~150–250ms/hash on a 512M instance) is fine for the low-QPS
 * login/onboarding workload; tests drop it via BCRYPT_COST=4.
 *
 * Plaintext passwords are never persisted or logged. Temp passwords are returned
 * to the calling company_advanced exactly once.
 */

const MIN_LENGTH = 10;

function cost() {
  const n = parseInt(process.env.BCRYPT_COST || '', 10);
  return Number.isInteger(n) && n >= 4 && n <= 15 ? n : 12;
}

async function hash(plain) {
  return bcrypt.hash(String(plain), cost());
}

/** Returns false (never throws) when the stored hash is missing/empty. */
async function verify(plain, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash) return false;
  if (typeof plain !== 'string' || !plain) return false;
  try {
    return await bcrypt.compare(plain, storedHash);
  } catch {
    return false;
  }
}

/**
 * Policy: at least MIN_LENGTH chars, with at least one letter and one digit.
 * Returns { ok: true } or { ok: false, reason }.
 */
function validateStrength(plain) {
  if (typeof plain !== 'string' || plain.length < MIN_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_LENGTH} characters long.` };
  }
  if (!/[A-Za-z]/.test(plain) || !/[0-9]/.test(plain)) {
    return { ok: false, reason: 'Password must contain at least one letter and one digit.' };
  }
  return { ok: true };
}

/**
 * Generate a random temporary password that satisfies validateStrength().
 * ~14 chars from an unambiguous alphabet (no 0/O/1/l/I) plus a guaranteed digit.
 */
function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(14);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  // Guarantee policy compliance regardless of random draw.
  return `${out}9`;
}

module.exports = { hash, verify, validateStrength, generateTempPassword, MIN_LENGTH };
