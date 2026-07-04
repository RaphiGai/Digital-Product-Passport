'use strict';

const cds = require('@sap/cds');

const APP_ROLES = ['company_advanced', 'company_user'];

const WRITE_EVENTS = new Set([
  'CREATE', 'UPDATE', 'DELETE', 'UPSERT',
  'approveDPP', 'publishDPP', 'archiveDPP', 'unarchiveDPP', 'regenerateQRToken',
  'archiveProduct',
  'importProducts', 'importVariants', 'importBatches', 'importBOM', 'importBusinessPartners',
  // User management — company_advanced only. NOTE: 'changePassword' is
  // intentionally NOT listed: every active user (incl. read-only company_user)
  // must be able to change their own password (forced first-login flow).
  'createUser', 'resetUserPassword', 'deactivateUser', 'reactivateUser'
]);

/**
 * Pull the tenant attribute that XSUAA placed into the user token.
 * For mocked users in dev this maps to `users[*].attr.tenant` in .cdsrc.json.
 * Returns `null` when no tenant claim is present on the token.
 */
function getTenant(req) {
  const attr = req.user?.attr?.tenant;
  if (!attr) return null;
  return Array.isArray(attr) ? attr[0] : attr;
}

function requireTenant(req) {
  const tenantId = getTenant(req);
  if (!tenantId) {
    req.reject(403, 'Your session is invalid. Please sign in again.');
  }
  return tenantId;
}

/**
 * Resolve the caller's app role from the patched req.user._roles. The role is
 * projected by srv/server.js → rbacMiddleware after a DB lookup against the
 * Users table; if the user has no active Users row, no role is set.
 */
function getAppRole(req) {
  const user = req.user;
  if (!user) return null;
  if (typeof user.is === 'function') {
    for (const r of APP_ROLES) {
      if (user.is(r)) return r;
    }
  }
  const roles = user._roles;
  if (roles) {
    for (const r of APP_ROLES) {
      if (roles[r]) return r;
    }
  }
  return null;
}

/**
 * Resolve the caller's owning organization (cached per request via the cds tx).
 */
async function getUserOrg(req) {
  // Resolve + enforce an active DB user first (fail-closed), then load its org row.
  // requireActiveUser returns the org id derived from the active Users row — so this no
  // longer trusts the cookie tenant claim alone.
  const orgId = await requireActiveUser(req);
  const { Organizations } = cds.entities('dpp');
  const org = await SELECT.one.from(Organizations).where({ ID: orgId });
  if (!org) {
    console.warn(`[auth] no organization found for org id '${orgId}'`);
    req.reject(403, 'Your account is not assigned to an organization. Please contact your administrator.');
  }
  return org;
}

/**
 * Resolve the calling identity against the `Users` table and inject the
 * matching role + tenant into req.user. Inline in this gate because the
 * Express middleware we registered in srv/server.js does not reliably fire
 * on every OData request under CAP 9. Idempotent — caches via _appOrgId.
 */
async function resolveAppUserInline(req) {
  if (req.user._appOrgId) return; // already resolved on this request
  const candidates = [req.user?.id, req.user?.email].filter(Boolean);
  if (!candidates.length) return;

  const { Users, Organizations } = cds.entities('dpp');
  let userRow = null;
  for (const c of candidates) {
    userRow = await SELECT.one.from(Users).where({ external_user_id: c });
    if (userRow) break;
    userRow = await SELECT.one.from(Users).where({ username: c });
    if (userRow) break;
    userRow = await SELECT.one.from(Users).where({ email: c });
    if (userRow) break;
  }
  if (!userRow || userRow.active === false) {
    // Deactivated or deleted: mark inactive so requireActiveUser fails closed. The
    // session cookie's role/tenant claims must NOT by themselves keep access alive.
    req.user._appInactive = true;
    console.warn(`[auth] no active Users row for ${JSON.stringify(candidates)}`);
    return;
  }

  const org = userRow.organization_ID
    ? await SELECT.one.from(Organizations).where({ ID: userRow.organization_ID })
    : null;
  if (!org) {
    console.warn(`[auth] user '${userRow.email}' has no org`);
    return;
  }

  req.user._roles = { [userRow.role]: 1 };
  req.user.roles = [userRow.role];
  const originalIs = typeof req.user.is === 'function' ? req.user.is.bind(req.user) : () => false;
  req.user.is = (r) => r === userRow.role || originalIs(r);
  req.user.has = req.user.is;
  req.user.attr = req.user.attr || {};
  req.user.attr.tenant = org.tenant_id;
  req.user._appOrgId = org.ID;
  req.user._appUserId = userRow.ID;   // acting Users row — used to stamp audit fields
}

/**
 * Hard-fail gate used at the start of every OData request. First tries the
 * inline DB lookup (above), then enforces that a role + tenant ended up on
 * req.user. Caches `req.user._appOrgId` for later use in per-entity read
 * filters and CREATE/UPDATE guards.
 */
async function requireActiveUser(req) {
  await resolveAppUserInline(req);

  // Fail closed: an ACTIVE Users row must have been resolved this request. The session
  // cookie carries role/tenant claims, but they must not by themselves grant access —
  // a deactivated/deleted user (_appInactive, or no _appUserId/_appOrgId resolved) is
  // rejected on the very next request instead of surviving until the cookie expires.
  if (req.user._appInactive || !req.user._appUserId || !req.user._appOrgId) {
    req.reject(403, 'Your account is not active. Please contact your administrator.');
  }
  return req.user._appOrgId;
}

function requireRole(req, ...roles) {
  const role = getAppRole(req);
  if (!roles.includes(role)) {
    console.warn(`[auth] insufficient role '${role}' — requires one of: ${roles.join(', ')}`);
    req.reject(403, "You don't have permission to perform this action. Please contact an administrator in your organization if you need this access.");
  }
}

function isWriteEvent(req) {
  return WRITE_EVENTS.has(req.event);
}

/**
 * Verify the entity instance referenced by `id` belongs to the caller's
 * organization, with optional association-path lookup (e.g. for DPPs the
 * tenant anchor is `product.owning_organization_ID`). Used by bound actions.
 *
 * @param {object} req       — the CAP request
 * @param {string} entityName  — short name as registered on cds.entities('dpp')
 * @param {string} id        — instance ID (string PK)
 * @param {string} ownerPath — dot-path to the owning_organization_ID, default 'owning_organization_ID'
 */
// UI vocabulary for entity names in error messages (technical names must not leak).
const ENTITY_LABELS = {
  Products: 'product', ProductVariants: 'variant', Batches: 'batch',
  ProductItems: 'item', ProductBOMs: 'bill of materials entry',
  BatchComponents: 'batch component', DPPs: 'DPP', QRCodes: 'QR code',
  Documents: 'document', BusinessPartners: 'business partner',
  BusinessPartnerRoles: 'partner role', DPPMarketingLinks: 'marketing link',
  DPPVersions: 'version', Users: 'user', Organizations: 'organization'
};

async function requireOwningOrg(req, entityName, id, ownerPath = 'owning_organization_ID') {
  const callerOrgId = await requireActiveUser(req);
  const entity = cds.entities('dpp')[entityName];
  if (!entity) {
    console.error(`[auth] requireOwningOrg called with unknown entity '${entityName}'`);
    req.reject(500, 'Something went wrong on the server. Please try again later.');
  }
  const label = ENTITY_LABELS[entityName] || 'record';
  const row = await SELECT.one
    .from(entity)
    .columns(`${ownerPath} as ownerOrgId`)
    .where({ ID: id });
  if (!row) req.reject(404, `The requested ${label} could not be found. It may have been deleted in the meantime. Please refresh the page and try again.`);
  if (row.ownerOrgId !== callerOrgId) {
    console.warn(`[auth] ${entityName} '${id}' belongs to a different organization`);
    // Same wording as the not-found case on purpose: the response must not
    // confirm that a record outside the caller's organization exists.
    req.reject(403, `The requested ${label} could not be found. It may have been deleted in the meantime. Please refresh the page and try again.`);
  }
}

module.exports = {
  APP_ROLES,
  getTenant,
  requireTenant,
  getAppRole,
  getUserOrg,
  requireActiveUser,
  requireRole,
  isWriteEvent,
  requireOwningOrg
};
