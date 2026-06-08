/**
 * Standalone approuter for DPP Studio (Variante B — HTML5 Application Repository).
 *
 * The SPA itself (index.html, consumer.html, /assets/*) lives in the HTML5
 * Application Repository; xs-app.json forwards every non-API path to it via
 * `service: html5-apps-repo-rt` with the `/dppstudio/...` app prefix.
 *
 * This thin extension rewrites two classes of request BEFORE routing — it never
 * serves files itself (unlike the cf-push variant), it only adjusts req.url so
 * the normal HTML5-repo routes pick up the right resource:
 *
 *  1. QR-scan navigation. The printed QR points at /public/dpp/:token. A browser
 *     opening it (Accept: text/html) must get the rendered consumer SPA, while
 *     the page's own JSON fetch and the qr.png image (non-HTML Accept) fall
 *     through to the backend untouched. We rewrite only the HTML navigation to
 *     /consumer.html; the browser address bar keeps /public/dpp/:token, so
 *     ConsumerApp still reads the token from the path.
 *
 *  2. SPA deep links. React Router uses BrowserRouter (history API), so a direct
 *     hit or reload of e.g. /products/123 would otherwise 404 against the repo.
 *     Any HTML navigation that is not an API path and not a static file is
 *     rewritten to /index.html so the SPA boots and resolves the route client-side.
 */
const approuter = require('@sap/approuter');

const ar = approuter();

// Paths handled by the backend (xs-app.json → srv-api destination). Never rewrite these.
const BACKEND = /^\/(odata|public|healthz)(\/|$)/;
// QR target: /public/dpp/<token> but NOT /public/dpp/<token>/qr.png
const CONSUMER_NAV = /^\/public\/dpp\/[^/]+\/?$/;

ar.first.use((req, res, next) => {
  if (req.method !== 'GET') return next();

  const path = (req.url || '').split('?')[0];
  const wantsHtml = (req.headers.accept || '').includes('text/html');

  // 1) QR-scan opened in a browser → consumer SPA (served from the HTML5 repo).
  if (wantsHtml && CONSUMER_NAV.test(path)) {
    req.url = '/consumer.html';
    return next();
  }

  // 2) Leave backend API/asset calls (incl. the JSON fetch + qr.png) untouched.
  if (BACKEND.test(path)) return next();

  // 3) SPA deep-link fallback: HTML navigation to a non-file path → index.html.
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  const isStaticFile = lastSegment.includes('.');
  if (wantsHtml && !isStaticFile) {
    req.url = '/index.html';
  }

  return next();
});

ar.start();
