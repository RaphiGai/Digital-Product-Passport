import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The backend (CAP) runs locally on http://localhost:4004 with `npm run watch`.
// In production an Approuter serves the SPA AND proxies these same paths, so the
// app always uses relative paths (/odata, /public, /healthz) — identical in both worlds.
const BACKEND = 'http://localhost:4004';

export default defineConfig(() => {
  // The app uses the backend's own username/password login (cookie `dpp_session`).
  // We forward /auth (login/logout/change-password) and /odata to the backend and
  // let the Set-Cookie flow back to the browser; /login is a SPA route (NOT proxied).
  const toBackend = { target: BACKEND, changeOrigin: true, cookieDomainRewrite: '' };

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') }
    },
    server: {
      port: 5173,
      proxy: {
        '/odata': toBackend,
        '/auth': toBackend,
        // The QR code points here (/public/dpp/:token). A browser navigating to the
        // consumer PAGE (Accept: text/html) should get the rendered SPA; the page's own
        // JSON fetch, the qr.png image, and per-token sub-resources (e.g. document
        // downloads at /public/dpp/:token/documents/:id) must fall through to the backend.
        '/public': {
          target: BACKEND,
          changeOrigin: true,
          bypass: (req) => {
            // Only the bare consumer page path is the SPA shell — NOT its sub-resources.
            const isConsumerPage = /^\/public\/dpp\/[^/?#]+\/?(?:[?#].*)?$/.test(req.url || '');
            if (req.method === 'GET' && isConsumerPage && (req.headers.accept || '').includes('text/html')) {
              return '/consumer.html';
            }
          }
        },
        '/healthz': { target: BACKEND, changeOrigin: true }
      }
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          // Entry 1: authenticated company app (behind xsuaa in prod)
          main: path.resolve(__dirname, 'index.html'),
          // Entry 2: public consumer view (no auth) — opened from a QR scan
          consumer: path.resolve(__dirname, 'consumer.html'),
          // Entry 3: public token-entry page (no auth) — paste a QR token → consumer view
          lookup: path.resolve(__dirname, 'lookup.html')
        }
      }
    }
  };
});
