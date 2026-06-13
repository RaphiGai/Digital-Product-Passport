'use strict';

const cds = require('@sap/cds');
const session = require('../lib/session');

/**
 * Custom CAP authentication (cds.requires.auth = { kind:'custom', impl }) that
 * replaces XSUAA. It authenticates requests from the signed `dpp_session`
 * cookie issued by srv/handlers/auth-routes.js.
 *
 * Contract honoured (verified against @sap/cds@9): the exported value is a
 * FACTORY (arity < 3), so CAP calls it once with options and uses the returned
 * (req,res,next) middleware. On a valid full session we set `req.user` /
 * `cds.context.user` to a real cds.User — that makes `requires:'authenticated-user'`
 * pass and lets the existing resolveAppUserInline() derive role + tenant from the
 * Users table (the role/tenant we put on the token are only advisory). On no /
 * invalid / pwreset-scoped cookie we leave the Anonymous user, so the service
 * gate returns 401.
 *
 * Public bootstrap routes (/login, /auth/*, /public/*, /healthz) are mounted
 * outside the per-service auth chain and never reach this middleware.
 */

const COOKIE_NAME = 'dpp_session';

// Test-only: the cds.test() suite authenticates via HTTP Basic Auth
// ({ auth: { username, password } }). When DPP_TEST_AUTH is set (only by
// test/helpers/setup.js) we accept the Basic-Auth username as the principal
// (no password check) so the existing suite keeps working without a signed
// cookie. NEVER set in dev/prod. (We can't key this on NODE_ENV because
// cds.test() resets NODE_ENV to 'development'.) Evaluated per-request.
function isTestMode() {
  return process.env.DPP_TEST_AUTH === 'basic';
}

function basicAuthUsername(req) {
  const h = (req.headers && req.headers.authorization) || '';
  if (!h.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(h.slice(6), 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    return i < 0 ? decoded : decoded.slice(0, i);
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

module.exports = function sessionAuthFactory(/* options */) {
  return function session_auth(req, _res, next) {
    const token = readCookie(req, COOKIE_NAME);
    let payload = null;
    if (token) {
      try {
        payload = session.verify(token);
      } catch {
        payload = null;
      }
    }

    if (payload) {
      // A password-reset token must NOT grant app access — keep anonymous so the
      // service gate blocks everything until the password is changed.
      if (payload.scope === 'pwreset') return next();

      const user = new cds.User({
        id: payload.sub,
        roles: payload.role ? [payload.role] : [],
        attr: payload.tenant ? { tenant: payload.tenant } : {},
      });
      if (payload.email) user.email = payload.email;
      req.user = user;
      if (cds.context) cds.context.user = user;
      return next();
    }

    // Test-only Basic-Auth fallback (see isTestMode note above). Role + tenant are
    // still resolved from the Users table by resolveAppUserInline downstream.
    if (isTestMode()) {
      const username = basicAuthUsername(req);
      if (username) {
        const user = new cds.User({ id: username });
        req.user = user;
        if (cds.context) cds.context.user = user;
      }
    }
    return next();
  };
};
