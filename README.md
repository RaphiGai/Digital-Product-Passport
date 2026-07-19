# Digital Product Passport

Monorepo for the Digital Product Passport (DPP) platform — an SAP BTP application for creating, managing and publishing ESPR-aligned digital product passports with QR-code-based consumer access.

## Structure

| Folder | Content |
|---|---|
| [`dpp_backend/`](dpp_backend/) | SAP CAP backend (Node.js, CDS, OData V4) — data model, business logic, authentication, QR/passport services. Deployed as its own MTA. |
| [`dpp_frontend/`](dpp_frontend/) | DPP Studio — React SPA (Vite, Tailwind, TanStack Query) plus standalone approuter. Deployed as its own MTA. |

Both halves are independent deployables with their own `mta.yaml`; see the README in each folder for setup, development and deployment instructions.

## Demo access

A hosted demo runs on SAP BTP:

- **DPP Studio (company app):** https://cf-procode-bas-dev-dpp-frontend-approuter.cfapps.eu10-004.hana.ondemand.com
- **Demo login:** username `alice.advanced`, password `DPP` (demo tenant, `company_advanced` role)

The public consumer view requires no login — open any published passport via its QR code or share link from within the studio.

## Quick start

```bash
# Backend (http://localhost:4004)
cd dpp_backend
npm install
npm run watch

# Frontend dev server (http://localhost:5173)
cd dpp_frontend/app
npm install
npm run dev
```

## CI

GitHub Actions runs separate workflows per folder (path-filtered): backend lint/build/test and frontend lint/build.
