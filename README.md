# DPP Studio — Frontend

React frontend for the Digital Product Passport (DPP) CAP backend (`dpp_capgemini`).
Built as a separate repository and deployed to SAP BTP via the **HTML5 Application
Repository** (an Approuter serves the SPA and forwards API calls to the backend, so the
browser sees a single origin — no CORS, no OAuth flow in JavaScript).

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
router/                 # standalone Approuter (xs-app.json) — prod entry point
mta.yaml                # Multi-Target Application descriptor (Variante B)
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

## Deploy to BTP (Variante B) — prerequisites

> Status: **skeleton**. The MTA structure is in place; finalize the items below before the
> first `cf deploy`.

1. **Backend first.** Deploy `dpp_capgemini`, then note the `dpp-srv` route
   (e.g. `https://dpp-srv-dev.cfapps.eu10-004.hana.ondemand.com`).
2. **Set the backend URL** in `mta.yaml` → `dpp-approuter` → `srv-api` destination:
   replace `BACKEND_SRV_URL`.
3. **Shared XSUAA.** `mta.yaml` binds the existing `dpp-uaa` instance via
   `existing-service` (must already exist in the target space). No new XSUAA is created,
   so the forwarded JWT is accepted by the backend.
4. **HTML5 content packaging.** Deploying a plain Vite app to the HTML5 Application
   Repository needs a `manifest.json` (app id / `sap.cloud.service`) alongside `dist/`.
   This is the remaining deploy-time step (tracked for Phase 2 / pre-deploy).

```bash
mbt build
cf deploy mta_archives/dpp-frontend_0.1.0.mtar
```

Target: org `CF_ProCode_BAS`, space `dev`, region `eu10-004`.

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
