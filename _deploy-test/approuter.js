/**
 * Standalone approuter with a small extension that reproduces the dev-server behaviour:
 * a browser navigating to the QR target  /public/dpp/:token  (Accept: text/html) gets the
 * rendered consumer SPA, while the page's JSON fetch and the /qr.png image fall through to
 * the backend (routed by xs-app.json). Everything else (admin SPA, /odata) is unchanged.
 */
const fs = require('fs');
const path = require('path');
const approuter = require('@sap/approuter');

const ar = approuter();
const CONSUMER_HTML = path.join(__dirname, 'resources', 'consumer.html');

// Matches /public/dpp/<token> (the QR target) but NOT /public/dpp/<token>/qr.png
const CONSUMER_NAV = /^\/public\/dpp\/[^/]+\/?$/;

ar.first.use((req, res, next) => {
  const url = (req.url || '').split('?')[0];
  const accept = req.headers.accept || '';
  if (req.method === 'GET' && CONSUMER_NAV.test(url) && accept.includes('text/html')) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    fs.createReadStream(CONSUMER_HTML).pipe(res);
    return;
  }
  next();
});

ar.start();
