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

// Express mounts that must live outside of CAP's auth middleware (e.g. the
// public consumer endpoint) are wired here on the `bootstrap` event.
cds.on('bootstrap', (app) => {
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'dpp-capgemini' }));

  // Public consumer endpoints. No authentication; visibility-filtered DTO.
  app.get('/public/dpp/:token', publicHandler.resolveDPPByToken);
  app.get('/public/dpp/:token/qr.png', publicHandler.getQRImage);

  // OpenAPI / Swagger UI at /swagger (per-service docs available too).
  if (swaggerUi) {
    app.use(swaggerUi());
  } else if (process.env.NODE_ENV !== 'test') {
    console.warn('cds-swagger-ui-express not installed — /swagger is disabled');
  }
});

module.exports = cds.server;
