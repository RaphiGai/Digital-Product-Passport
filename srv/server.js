'use strict';

const cds = require('@sap/cds');
const publicHandler = require('./handlers/public-handler');

// Swagger UI is loaded lazily so test environments without the dev-only
// dependency installed can still boot.
let swaggerUi = null;
try {
  swaggerUi = require('cds-swagger-ui-express');
} catch {
  // optional — warned on bootstrap if missing
}

/**
 * Inject an HTTP Basic securityScheme into the OpenAPI spec so Swagger UI
 * renders an "Authorize" button. The cds-swagger-ui-express plugin caches
 * the doc per service, so mutating once persists; the check is idempotent.
 */
function injectBasicAuthScheme(req, res, next) {
  if (!req.path.includes('/$api-docs') || !req.path.endsWith('/openapi.json')) {
    return next();
  }
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && body.openapi) {
      body.components = body.components || {};
      body.components.securitySchemes = body.components.securitySchemes || {};
      body.components.securitySchemes.basicAuth = { type: 'http', scheme: 'basic' };
      body.security = [{ basicAuth: [] }];
    }
    return origJson(body);
  };
  next();
}

// Express mounts that must live outside of CAP's auth middleware (e.g. the
// public consumer endpoint) are wired here on the `bootstrap` event.
cds.on('bootstrap', (app) => {
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'dpp-capgemini' }));

  // Public consumer endpoints. No authentication; visibility-filtered DTO.
  app.get('/public/dpp/:token', publicHandler.resolveDPPByToken);
  app.get('/public/dpp/:token/qr.png', publicHandler.getQRImage);

  // OpenAPI / Swagger UI at /swagger (per-service docs available too).
  if (swaggerUi) {
    app.use(injectBasicAuthScheme);
    app.use(swaggerUi());
  } else if (process.env.NODE_ENV !== 'test') {
    console.warn('cds-swagger-ui-express not installed — /swagger is disabled');
  }
});

module.exports = cds.server;
