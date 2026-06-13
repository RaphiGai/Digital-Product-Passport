/**
 * Standalone approuter for DPP Studio (Variante A — serves the SPA from this
 * container's resources/ folder via xs-app.json localDir; no HTML5 repo).
 *
 * This thin extension handles two GET cases before normal routing:
 *
 *  1. QR-scan navigation. The printed QR points at /public/dpp/:token. A browser
 *     opening it (Accept: text/html) must get the rendered consumer SPA shell,
 *     while the page's own JSON fetch and the /qr.png image (non-HTML Accept)
 *     fall through to the backend untouched. The browser address bar keeps
 *     /public/dpp/:token, so ConsumerApp still reads the token from the path.
 *
 *  2. SPA deep links. React Router uses the history API, so a direct hit or
 *     reload of e.g. /products/123 would 404 against localDir (which does not
 *     fall back to index.html). We rewrite such HTML navigations to /index.html;
 *     the catch-all xsuaa route then still gates them behind login.
 */
const fs = require('fs');
const path = require('path');
const approuter = require('@sap/approuter');

const ar = approuter();
const CONSUMER_HTML = path.join(__dirname, 'resources', 'consumer.html');

// Backend paths (forwarded to srv-api) — never serve locally / never fall back.
// /auth/* is the app-managed login API (login/logout/change-password). /login is
// NOT listed here: it is a client-side SPA route, served via the index.html
// fallback below (auth is app-managed now, so there is no XSUAA OAuth handshake).
const BACKEND = /^\/(odata|public|healthz|auth)(\/|$)/;
// QR target: /public/dpp/<token> but NOT /public/dpp/<token>/qr.png
const CONSUMER_NAV = /^\/public\/dpp\/[^/]+\/?$/;

ar.first.use((req, res, next) => {
  if (req.method !== 'GET') return next();

  const url = (req.url || '').split('?')[0];
  const wantsHtml = (req.headers.accept || '').includes('text/html');

  // 1) QR-scan opened in a browser → serve the consumer SPA shell.
  if (wantsHtml && CONSUMER_NAV.test(url)) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    fs.createReadStream(CONSUMER_HTML).pipe(res);
    return;
  }

  // 2) Leave backend API calls untouched — never apply the SPA fallback to them.
  if (BACKEND.test(url)) return next();

  // 3) SPA deep-link fallback: HTML navigation to a non-file path → index.html.
  const lastSegment = url.slice(url.lastIndexOf('/') + 1);
  const isStaticFile = lastSegment.includes('.');
  if (wantsHtml && !isStaticFile && url !== '/') {
    req.url = '/index.html';
  }

  return next();
});

ar.start();
