'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('dpp/auth');

const APP_ROLES = ['company_advanced', 'company_user', 'business_partner'];

// Everything a business_partner login may do. External partner accounts are
// locked to their portal page: the assigned-documents feed, updating those
// documents (file + validity), and their own session/profile actions. Any
// other entity or action is rejected in enforceBusinessPartnerScope below.
const PARTNER_ALLOWED_EVENTS = new Set(['me', 'myAssignedDocuments', 'changePassword', 'updateProfile']);

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
    LOG.warn('no organization found for org', { orgId });
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
    // DSGVO: never log the principal (username/email). The request correlation_id ties
    // this warning to the offending request in Kibana.
    LOG.warn('no active user row for the request principal');
    return;
  }

  const org = userRow.organization_ID
    ? await SELECT.one.from(Organizations).where({ ID: userRow.organization_ID })
    : null;
  if (!org) {
    LOG.warn('active user has no organization', { userId: userRow.ID });
    return;
  }

  // A business_partner login is only as active as the partner it acts for:
  // archiving the BusinessPartner (or an account whose link went missing) must
  // revoke portal access on the next request, mirroring createUser's refusal to
  // onboard against an archived partner.
  if (userRow.role === 'business_partner') {
    if (!userRow.business_partner_ID) {
      req.user._appInactive = true;
      LOG.warn('business_partner account without partner link');
      return;
    }
    const { BusinessPartners } = cds.entities('dpp');
    const partner = await SELECT.one.from(BusinessPartners)
      .columns('ID', 'archived').where({ ID: userRow.business_partner_ID });
    if (!partner || partner.archived) {
      req.user._appInactive = true;
      LOG.warn('business_partner account linked to a missing or archived partner');
      return;
    }
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
  req.user._appPartnerId = userRow.business_partner_ID || null; // linked BusinessPartners row (business_partner role)
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
    LOG.warn('insufficient role for action', { role, required: roles });
    req.reject(403, "You don't have permission to perform this action.");
  }
}

function isWriteEvent(req) {
  return WRITE_EVENTS.has(req.event);
}

function isBusinessPartner(req) {
  return getAppRole(req) === 'business_partner';
}

/**
 * Fail-closed allowlist for business_partner logins, called from the central
 * `srv.before('*')` gate for every request of such an account. Permits ONLY:
 *  - the unbound events in PARTNER_ALLOWED_EVENTS (portal feed + own session),
 *  - READ/UPDATE on Documents — further narrowed to the documents assigned to
 *    the linked partner by the READ filter in srv/dpp-service.js and the
 *    field-allowlist UPDATE guard in srv/handlers/document-handlers.js.
 * Everything else (all other entities, navigations, actions) is rejected.
 */
function enforceBusinessPartnerScope(req) {
  if (PARTNER_ALLOWED_EVENTS.has(req.event)) return;
  const targetName = req.target && req.target.name;
  const entityName = targetName ? String(targetName).split('.').pop() : null;
  if (entityName === 'Documents' && (req.event === 'READ' || req.event === 'UPDATE')) return;
  LOG.warn('business_partner scope violation blocked', { event: req.event, target: targetName || null });
  req.reject(403, "You don't have permission to perform this action.");
}

/**
 * The BusinessPartners row a business_partner login acts for. Fail-closed:
 * rejects when the account has no partner link (misconfigured account).
 */
function requirePartnerLink(req) {
  const partnerId = req.user && req.user._appPartnerId;
  if (!partnerId) {
    LOG.warn('business_partner account without partner link');
    req.reject(403, 'Your account is not linked to a business partner. Please contact your administrator.');
  }
  return partnerId;
}

/** True if an OData column ref navigates an association (ref path longer than 1). */
function refCrossesAssociation(col) {
  if (!col) return false;
  if (col.expand) return true;
  const ref = col.ref;
  return Array.isArray(ref) && ref.length > 1;
}

/** True if an xpr/where token references an association path (ref length > 1). */
function whereCrossesAssociation(tokens) {
  if (!Array.isArray(tokens)) return false;
  return tokens.some((t) => {
    if (!t || typeof t !== 'object') return false;
    if (Array.isArray(t.ref) && t.ref.length > 1) return true;
    if (Array.isArray(t.xpr) && whereCrossesAssociation(t.xpr)) return true;
    if (t.args && whereCrossesAssociation(Array.isArray(t.args) ? t.args : [t.args])) return true;
    return false;
  });
}

/**
 * Fail-closed guard for a business_partner Documents READ: reject any query that
 * traverses an association (via $expand, $select, $filter or $orderby) — those
 * are resolved inside the Documents READ event and would otherwise expose
 * internal product/batch fields (directly, or as a value oracle through $filter).
 * Partner logins may read only Documents' own scalar columns.
 */
function rejectDocumentAssociationAccess(req) {
  const sel = req.query && req.query.SELECT;
  if (!sel) return;
  const cols = sel.columns;
  if (Array.isArray(cols) && cols.some(refCrossesAssociation)) {
    LOG.warn('business_partner association access blocked', { via: 'select/expand' });
    req.reject(403, "You don't have permission to perform this action.");
  }
  if (whereCrossesAssociation(sel.where)) {
    LOG.warn('business_partner association access blocked', { via: 'filter' });
    req.reject(403, "You don't have permission to perform this action.");
  }
  if (Array.isArray(sel.orderBy) && sel.orderBy.some(refCrossesAssociation)) {
    LOG.warn('business_partner association access blocked', { via: 'orderby' });
    req.reject(403, "You don't have permission to perform this action.");
  }
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
async function requireOwningOrg(req, entityName, id, ownerPath = 'owning_organization_ID') {
  const callerOrgId = await requireActiveUser(req);
  const entity = cds.entities('dpp')[entityName];
  if (!entity) {
    LOG.error('requireOwningOrg called with unknown entity', { entityName });
    req.reject(500, 'An internal error occurred.');
  }
  const row = await SELECT.one
    .from(entity)
    .columns(`${ownerPath} as ownerOrgId`)
    .where({ ID: id });
  if (!row) req.reject(404, 'The requested item could not be found.');
  if (row.ownerOrgId !== callerOrgId) {
    LOG.warn('cross-organization access blocked', { entity: entityName, id });
    req.reject(403, "You don't have permission to access this item.");
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
  isBusinessPartner,
  enforceBusinessPartnerScope,
  requirePartnerLink,
  rejectDocumentAssociationAccess,
  requireOwningOrg
};
