'use strict';

const cds = require('@sap/cds');
const passwords = require('./passwords');

/**
 * Credential operations shared by the OData user-management actions
 * (srv/handlers/user-handlers.js) and the login endpoints
 * (srv/handlers/auth-routes.js). All Users credential writes go through here so
 * hashing/lockout policy lives in one place. Plaintext is never logged.
 *
 * Functions throw an Error decorated with `.status` (HTTP code) on failure so
 * callers can map to req.reject (OData) or res.status (Express).
 */

const LOCK_THRESHOLD = 10;       // failed attempts before lockout
const LOCK_MINUTES = 15;

function fail(status, message) {
  return Object.assign(new Error(message), { status, expose: true });
}

function entities() {
  return cds.entities('dpp');
}

async function findById(userId) {
  const { Users } = entities();
  return SELECT.one.from(Users).where({ ID: userId });
}

async function findByUsername(username) {
  const { Users } = entities();
  return SELECT.one.from(Users).where({ username });
}

async function tenantOf(organizationId) {
  if (!organizationId) return null;
  const { Organizations } = entities();
  const org = await SELECT.one.from(Organizations).columns('tenant_id').where({ ID: organizationId });
  return org ? org.tenant_id : null;
}

/** The trimmed user shape used to build a session token (incl. resolved tenant). */
async function toSessionUser(row) {
  if (!row) return null;
  return {
    ID: row.ID,
    username: row.username,
    email: row.email,
    role: row.role,
    external_user_id: row.external_user_id,
    organization_ID: row.organization_ID,
    tenant: await tenantOf(row.organization_ID),
    mustReset: !!row.must_reset_password,
  };
}

/** Load a user by ID and return the session-user shape (or null). */
async function sessionUser(userId) {
  return toSessionUser(await findById(userId));
}

/**
 * Verify username + password. Returns { ok:true, user } on success (with role,
 * tenant, mustReset), or { ok:false } otherwise. Maintains failed_login_count /
 * locked_until. Callers must surface only a generic error to avoid user enumeration.
 */
async function verifyLogin(username, password) {
  const { Users } = entities();
  const user = await findByUsername(username);
  if (!user) return { ok: false };
  if (user.active === false) return { ok: false };

  const nowMs = Date.now();
  if (user.locked_until && new Date(user.locked_until).getTime() > nowMs) {
    return { ok: false, locked: true };
  }

  const match = await passwords.verify(password, user.password_hash);
  if (!match) {
    const count = (user.failed_login_count || 0) + 1;
    const patch = { failed_login_count: count };
    if (count >= LOCK_THRESHOLD) {
      patch.locked_until = new Date(nowMs + LOCK_MINUTES * 60 * 1000).toISOString();
    }
    await UPDATE(Users).set(patch).where({ ID: user.ID });
    return { ok: false };
  }

  if (user.failed_login_count || user.locked_until) {
    await UPDATE(Users).set({ failed_login_count: 0, locked_until: null }).where({ ID: user.ID });
  }

  return { ok: true, user: await toSessionUser(user) };
}

/**
 * Change a user's password (used by forced first-login reset AND voluntary
 * change). Verifies the current password, enforces the strength policy, stores
 * the new hash and clears the must-reset flag + lockout.
 */
async function changePassword(userId, currentPassword, newPassword) {
  const { Users } = entities();
  const user = await findById(userId);
  if (!user) throw fail(404, 'User not found.');

  const currentOk = await passwords.verify(currentPassword, user.password_hash);
  if (!currentOk) throw fail(400, 'Current password is incorrect.');

  const strength = passwords.validateStrength(newPassword);
  if (!strength.ok) throw fail(400, strength.reason);

  if (newPassword === currentPassword) {
    throw fail(400, 'New password must differ from the current password.');
  }

  const hash = await passwords.hash(newPassword);
  await UPDATE(Users)
    .set({
      password_hash: hash,
      must_reset_password: false,
      password_updated_at: new Date().toISOString(),
      failed_login_count: 0,
      locked_until: null,
    })
    .where({ ID: userId });
  return true;
}

/**
 * Issue a new system-generated temporary password (admin-mediated reset). The
 * user is forced to change it on next login. Returns the plaintext temp ONCE —
 * never persisted in plaintext, never logged.
 */
async function setTemporaryPassword(userId) {
  const { Users } = entities();
  const temp = passwords.generateTempPassword();
  const hash = await passwords.hash(temp);
  await UPDATE(Users)
    .set({
      password_hash: hash,
      must_reset_password: true,
      password_updated_at: null,
      failed_login_count: 0,
      locked_until: null,
    })
    .where({ ID: userId });
  return temp;
}

module.exports = {
  findById,
  findByUsername,
  sessionUser,
  verifyLogin,
  changePassword,
  setTemporaryPassword,
  LOCK_THRESHOLD,
  LOCK_MINUTES,
};
