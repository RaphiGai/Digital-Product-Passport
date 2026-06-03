import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The backend (CAP) runs locally on http://localhost:4004 with `npm run watch`.
// In production an Approuter serves the SPA AND proxies these same paths, so the
// app always uses relative paths (/odata, /public, /healthz) — identical in both worlds.
const BACKEND = 'http://localhost:4004';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Local-only: inject Basic Auth for the CAP mocked-auth provider so app code stays
  // auth-agnostic. Pick a mock user via VITE_DEV_USER (default alice.advanced), password `x`.
  // In production the Approuter terminates auth — no header is injected there.
  const devUser = env.VITE_DEV_USER || 'alice.advanced';
  const basicAuth = 'Basic ' + Buffer.from(`${devUser}:x`).toString('base64');

  const withAuth = (target) => ({
    target,
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        if (!proxyReq.getHeader('authorization')) {
          proxyReq.setHeader('authorization', basicAuth);
        }
      });
    }
  });

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') }
    },
    server: {
      port: 5173,
      proxy: {
        '/odata': withAuth(BACKEND),
        // The QR code points here (/public/dpp/:token). A browser navigating to it
        // (Accept: text/html) should get the rendered consumer page; the page's own
        // JSON fetch and the qr.png image fall through to the backend.
        '/public': {
          target: BACKEND,
          changeOrigin: true,
          bypass: (req) => {
            if (req.method === 'GET' && (req.headers.accept || '').includes('text/html')) {
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
          consumer: path.resolve(__dirname, 'consumer.html')
        }
      }
    }
  };
});
