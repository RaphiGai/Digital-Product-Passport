# DPP Capgemini — Digital Product Passport Backend (Fashion)

Backend for an EU-ESPR–oriented Digital Product Passport (DPP) for the fashion industry, built as a TUM × Capgemini student project. Repository: <https://github.com/RaphiGai/dpp_capgemini>.

## Live deployment

| What | URL |
| --- | --- |
| Approuter (SSO entry point) | https://cf-procode-bas-dev-dpp-approuter.cfapps.eu10-004.hana.ondemand.com |
| Swagger DPPService | …/$api-docs/odata/v4/dpp |
| Liveness probe | …/healthz |
| Consumer / authority view (no login) | …/public/dpp/&lt;qr_token&gt; |

BTP target: subaccount `yf81xg-ggkygbp7r`, region `eu10-004`, CF org `CF_ProCode_BAS`, space `dev`.

## Stack

- SAP Cloud Application Programming Model (CAP), Node.js, `@sap/cds` ^9
- CDS data model, OData V4 services, auto-generated OpenAPI/Swagger
- SQLite (development) / SAP HANA Cloud (production on SAP BTP)
- XSUAA authentication via the approuter (2 application roles — `company_advanced`, `company_user`)
- Public consumer / authority endpoint (`/public/dpp/:token`) with HMAC-signed QR token and PNG generation — single read-only view for end consumers and market-surveillance authorities (no login required)
- Jest unit + `cds.test` integration tests

> **Authorization (May 2026):** App role (`company_advanced` / `company_user`) and tenant scoping are enforced **programmatically in service handlers** ([srv/dpp-service.js](srv/dpp-service.js), [srv/handlers/auth-helpers.js](srv/handlers/auth-helpers.js)) and resolved by DB lookup against the `Users` table — not via `@restrict`. The service-level guard `requires: 'authenticated-user'` is only the logged-in gate. This sidesteps a CAP 9 middleware-timing issue and lets us manage roles in the app without BTP cockpit role-collection assignment (see [docs/architecture.md](docs/architecture.md) §6).

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
| `alice.advanced`  | company_advanced  | ORG-A               |
| `carol.user`      | company_user      | ORG-A               |
| `dan.advanced.b`  | company_advanced  | ORG-B (Fashionista) |

Role + tenant are seeded into `db/data/dpp-Users.csv` and into the matching mocked-auth entries in `.cdsrc.json`.

## Endpoints

- `GET /odata/v4/dpp/$metadata` — OData V4 metadata for the company-facing service
- `GET /odata/v4/dpp/me()` — caller identity + role + organisation (returns 403 when the user has no active `Users` row); intended for frontend role-based UI rendering
- `GET /public/dpp/:token` — consumer / authority view (no auth, visibility-filtered)
- `GET /public/dpp/:token/qr.png` — printable QR code PNG
- `GET /$api-docs/odata/v4/dpp` — Swagger UI for the DPP service
- `GET /healthz` — Liveness probe

## Deploy to BTP

```bash
mbt build
cf login -a https://api.cf.eu10-004.hana.ondemand.com --sso \
        -o CF_ProCode_BAS -s dev

# One-time per space: create the user-provided service that holds runtime
# secrets (HMAC key + public base URL). The MTA expects it to exist.
cf cups dpp-secrets -p '{
  "QR_TOKEN_HMAC_SECRET": "<32+ char random string>",
  "PUBLIC_BASE_URL":      "https://<your-approuter-host>"
}'

cf deploy mta_archives/dpp-capgemini_0.1.0.mtar
```

Rotate the secret later without redeploying:

```bash
cf uups dpp-secrets -p '{"QR_TOKEN_HMAC_SECRET":"<new value>","PUBLIC_BASE_URL":"https://…"}'
cf restart dpp-srv
```

Requires `mbt`, `cf` CLI (with the multiapps plugin), and Node.js ≥ 20. Step-by-step setup is documented in [docs/architecture.md](docs/architecture.md) §1.

## Logging & troubleshooting

The backend logs through CAP's structured logger (`cds.log('dpp/<area>')`). In production the
output is **JSON** and carries a `correlation_id` per request, so a single request can be traced
across log lines. Log messages never contain personal data (no emails / usernames — only internal
IDs), per the project's DSGVO rules.

**Read logs on BTP (Kibana).** The `application-logs` service (`dpp-logs` in `mta.yaml`) is bound to
`dpp-srv` and `dpp-approuter`, so stdout is shipped to Kibana automatically:

- BTP Cockpit → your space → **Application Logging** → **Open Kibana Dashboard** — then filter by
  `component` (e.g. `dpp/service`, `dpp/auth`, `dpp/public`), `level` (`error`/`warn`), or a
  `correlation_id` copied from a failing request's `x-correlation-id` response header.
- Quick check without Kibana (short-lived buffer): `cf logs dpp-srv --recent`.

> Requires the `application-logs` entitlement in the subaccount (BTP Cockpit → Entitlements). If it
> is missing, `cf deploy` fails on the `dpp-logs` resource — add the entitlement or switch the plan.

**Log levels per environment** (`cds.log.levels` in `package.json`): dev = `debug`, prod = `info`
(app) with framework noise at `warn`/`error`. Turn on verbose logging in prod temporarily without a
redeploy, then revert:

```bash
cf set-env dpp-srv CDS_LOG_LEVELS 'dpp=debug' && cf restart dpp-srv
# revert
cf unset-env dpp-srv CDS_LOG_LEVELS && cf restart dpp-srv
```

**Dev loop:** find the failing request in Kibana by its `correlation_id` → reproduce locally with
`cds watch` (dev logs are human-readable text at `debug`) → fix → redeploy.

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
