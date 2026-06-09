# DPP Studio — Frontend

React frontend for the Digital Product Passport (DPP) CAP backend (`dpp_capgemini`).
Built as a separate repository and deployed to SAP BTP: a standalone **Approuter serves the
SPA from its own container** and forwards API calls to the backend, so the browser sees a
single origin — no CORS, no OAuth flow in JavaScript.

## Stack

- React 18 + **JavaScript (JSX)** + Vite (two entries: authenticated app + public consumer view)
- **Pure Tailwind CSS** (own small components — no shadcn/component library)
- lucide-react (icons), React Router, TanStack Query
- Hand-written OData fetch layer over the backend at `/odata/v4/dpp`
- JSDoc typedefs (`src/api/types.js`) for editor autocomplete instead of TypeScript

## Project layout

```
app/                    # Vite + React + JS project (the HTML5 module)
  index.html            # Entry 1: authenticated company app  → src/main.jsx
  consumer.html         # Entry 2: public consumer view       → src/consumer/main.jsx
  src/
    app/                # router, layout (Sidebar/Topbar), pages
    api/                # fetch client, OData helpers, JSDoc typedefs
    auth/               # useMe() hook, RequireRole
    ui/                 # Button, Card, Badge, Table (pure Tailwind)
    consumer/           # public QR-scan view
router/                 # standalone Approuter (xs-app.json + approuter.js) — serves the SPA, prod entry
mta.yaml                # Multi-Target Application descriptor (Variante A — localDir)
```

## Local development

The backend and frontend run on **separate ports**; Vite proxies API calls to the backend,
so app code always uses relative paths (`/odata`, `/public`) and behaves the same as in prod.

```bash
# Terminal 1 — backend (in ../dpp_capgemini)
npm run watch                 # CAP server on http://localhost:4004 (mocked Basic Auth)

# Terminal 2 — frontend (here, in app/)
cd app
npm install
npm run dev                   # Vite on http://localhost:5173
```

Open <http://localhost:5173>. The Vite proxy injects Basic Auth for the CAP mocked-auth
provider so you are signed in as a mock user. Choose the user via `VITE_DEV_USER`
(password is always `x`):

| `VITE_DEV_USER`   | Role             | Tenant |
| ----------------- | ---------------- | ------ |
| `alice.advanced`  | company_advanced | ORG-A  |
| `carol.user`      | company_user     | ORG-A  |
| `dan.advanced.b`  | company_advanced | ORG-B  |

```bash
VITE_DEV_USER=carol.user npm run dev    # see the read-only (company_user) experience
```

The public consumer view is the second entry — locally:
`http://localhost:5173/consumer.html?token=<qr_token>` (use a seed token like
`seed-token-tshirt-12345`).

## Scripts (in `app/`)

- `npm run dev` — Vite dev server with backend proxy
- `npm run build` — production build (both entries) into `dist/`
- `npm run lint` — ESLint

## Deploy to BTP (Variante A — approuter serves the SPA from its container)

`mbt build` runs the Vite build and copies `dist/` into the approuter's `resources/` folder;
the standalone Approuter (`router/`) serves it via `xs-app.json` `localDir` and forwards
`/odata` + `/public` to the backend. **No HTML5 Application Repository is involved.**

How the pieces fit together:

- **Two modules.** `dpp-ui` (`html5`, Vite build → `dist`) and `dpp-frontend-approuter`
  (`approuter.nodejs`). The MTA copies `dist` into the approuter at build time
  (`build-parameters` → `target-path: resources/`).
- **Routing.** `router/xs-app.json` serves `/`, `/assets/*` and `/consumer.html` from
  `localDir: resources`; `/odata`, `/public` and `/healthz` are forwarded to the backend
  via the inline `srv-api` destination (an env var on the approuter).
- **Approuter extension.** `router/approuter.js` handles two GET cases before routing:
  a browser opening the QR target `/public/dpp/:token` (Accept: text/html) gets
  `consumer.html`; other HTML deep links fall back to `index.html`. The OAuth paths
  `/login` and `/logout` are explicitly excluded from that fallback — rewriting
  `/login/callback` would break the auth handshake (endless login loop).
- **Shared XSUAA.** `mta.yaml` binds the existing `dpp-uaa` via `existing-service`, so the
  forwarded JWT is accepted by the backend (same `xsappname`).

Prerequisites:

1. **Backend first.** Deploy `dpp_capgemini`; the `srv-api` destination in `mta.yaml` points at
   its `dpp-srv` route. Update that URL if the backend host changes.
2. **`PUBLIC_BASE_URL`.** Set the backend's `PUBLIC_BASE_URL` to **this frontend Approuter's**
   host, so printed QR codes resolve to the consumer view served here.

```bash
mbt build
cf deploy mta_archives/dpp-frontend_0.1.0.mtar
```

Target: org `CF_ProCode_BAS`, space `dev`, region `eu10-004`.

> Earlier the SPA was served from the SAP HTML5 Application Repository (Variante B:
> `dpp-ui-deployer` + `dpp-html5-host`/`dpp-html5-runtime`). That path was dropped — the repo
> could not resolve the app in the XSUAA-protected route (`Service Tag index is unknown`).
> localDir is the current, working approach.

## Architecture notes

- **Auth.** XSUAA only gates "authenticated user". The app **role**
  (`company_advanced` / `company_user`) and **tenant** are resolved by the backend from its
  `Users` table and returned by `me()`. The UI calls `me()` first and gates write/lifecycle
  controls with `<RequireRole role="company_advanced">` — this is UX only; the backend
  enforces all writes and tenant scoping.
- **No CSRF handling.** OData routes have `csrfProtection: false`; POST/PATCH/DELETE work
  without CSRF tokens.
- **Relative paths everywhere.** Dev (Vite proxy) and prod (Approuter) both resolve
  `/odata` and `/public` to the backend.
