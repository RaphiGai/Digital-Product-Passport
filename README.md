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

## Deploy to BTP (Variante B — HTML5 Application Repository)

The build uploads the Vite output into the **HTML5 Application Repository**; the standalone
Approuter (`router/`) serves it from there and forwards `/odata` + `/public` to the backend.

How the pieces fit together:

- **App identity.** `app/public/manifest.json` (→ `dist/manifest.json`) declares
  `sap.app.id: dppstudio`. The HTML5 content deployer stores the app under that name.
- **Routing.** `router/xs-app.json` forwards every non-API path to the repo via
  `service: html5-apps-repo-rt` with the `target: /dppstudio/$1` prefix — so the SPA's
  absolute `/assets/...` paths resolve without a Vite `base` change. The `dppstudio` prefix
  in the routes must match `sap.app.id`.
- **Approuter extension.** `router/approuter.js` rewrites two request classes before routing:
  a browser opening the QR target `/public/dpp/:token` (Accept: text/html) gets `consumer.html`;
  any other HTML navigation to a non-file path (React Router deep links) falls back to
  `index.html`. The JSON fetch and `qr.png` pass through to the backend untouched.
- **Shared XSUAA.** `mta.yaml` binds the existing `dpp-uaa` instance via `existing-service`
  (must already exist in the target space), so the forwarded JWT is accepted by the backend.

Prerequisites:

1. **Backend first.** Deploy `dpp_capgemini`; the `srv-api` destination in `mta.yaml` points at
   its `dpp-srv` route. Update that URL if the backend host changes.
2. **`PUBLIC_BASE_URL`.** Set the backend's `dpp-secrets` `PUBLIC_BASE_URL` to **this frontend
   Approuter's** host, so printed QR codes resolve to the consumer view served here.

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
