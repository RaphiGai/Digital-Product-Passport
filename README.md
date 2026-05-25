# DPP Capgemini — Digital Product Passport Backend (Fashion)

Backend for an EU-ESPR–oriented Digital Product Passport (DPP) for the fashion industry, built as a TUM × Capgemini student project. Repository: <https://github.com/RaphiGai/dpp_capgemini>.

## Live deployment

| What | URL |
| --- | --- |
| Approuter (SSO entry point) | https://cf-procode-bas-dev-dpp-approuter.cfapps.eu10-004.hana.ondemand.com |
| Swagger DPPService | …/$api-docs/odata/v4/dpp |
| Swagger AuthorityService | …/$api-docs/odata/v4/authority |
| Liveness probe | …/healthz |
| Consumer view (no login) | …/public/dpp/&lt;qr_token&gt; |

BTP target: subaccount `yf81xg-ggkygbp7r`, region `eu10-004`, CF org `CF_ProCode_BAS`, space `dev`.

## Stack

- SAP Cloud Application Programming Model (CAP), Node.js, `@sap/cds` ^9
- CDS data model, OData V4 services, auto-generated OpenAPI/Swagger
- SQLite (development) / SAP HANA Cloud (production on SAP BTP)
- XSUAA authentication via the approuter (3 application roles — `company_advanced`, `company_user`, `end_user`)
- Public consumer endpoint (`/public/dpp/:token`) with HMAC-signed QR token and PNG generation
- Jest unit + `cds.test` integration tests

> **Authorization status (May 2026):** the `@restrict` clauses in `srv/dpp-service.cds` and `srv/authority-service.cds` are temporarily relaxed to `requires: 'authenticated-user'` because role-collection assignment is not available on the BTP UCC learn-tenant. The full role + tenant model lives in `db/common.cds` (`UserRole`) and `xs-security.json` and will be re-enabled in one commit once cockpit assignment is possible (see [docs/architecture.md](docs/architecture.md) §6 for details).

## Quick start (local development)

```bash
git clone https://github.com/RaphiGai/dpp_capgemini.git
cd dpp_capgemini

npm install
cp .env.example .env          # edit QR_TOKEN_HMAC_SECRET

npm run watch                 # CAP server on http://localhost:4004
```

Mock users for local mocked auth (Basic Auth, password `x`):

| User              | App role          | Tenant              |
| ----------------- | ----------------- | ------------------- |
| `kka_learn_235`   | company_advanced  | ORG-A (Greenline)   |
| `alice.advanced`  | company_advanced  | ORG-A               |
| `carol.user`      | company_user      | ORG-A               |
| `dan.advanced.b`  | company_advanced  | ORG-B (Fashionista) |
| `eve.enduser`     | end_user          | — (cross-tenant)    |

Role + tenant are seeded into `db/data/dpp-Users.csv` and into the matching mocked-auth entries in `.cdsrc.json`.

## Endpoints

- `GET /odata/v4/dpp/$metadata` — OData V4 metadata for the company-facing service
- `GET /odata/v4/authority/$metadata` — cross-tenant read-only view
- `GET /public/dpp/:token` — consumer view (no auth, visibility-filtered)
- `GET /public/dpp/:token/qr.png` — printable QR code PNG
- `GET /$api-docs/odata/v4/dpp` — Swagger UI for the DPP service
- `GET /$api-docs/odata/v4/authority` — Swagger UI for the authority service
- `GET /healthz` — Liveness probe

## Deploy to BTP

```bash
mbt build
cf login -a https://api.cf.eu10-004.hana.ondemand.com --sso \
        -o CF_ProCode_BAS -s dev
cf deploy mta_archives/dpp-capgemini_0.1.0.mtar
```

Requires `mbt`, `cf` CLI (with the multiapps plugin), and Node.js ≥ 20. Step-by-step setup is documented in [docs/architecture.md](docs/architecture.md) §1.

## Project layout

```
.
├── app/router/            # approuter (Cloud Foundry, prod entry point)
├── db/                    # CDS data model + sample CSV seed
├── srv/                   # CAP services, handlers, libs
├── test/                  # Unit & integration tests
├── docs/                  # architecture, technical documentation, diagrams
├── mta.yaml               # Multi-Target Application descriptor
└── xs-security.json       # XSUAA profile
```

For the full architecture and diagram set see [docs/architecture.md](docs/architecture.md) and the deep technical write-up in [docs/technical_documentation.md](docs/technical_documentation.md).

## License

MIT (placeholder — to be confirmed with project owners).
