# Diagram Separation Spec — Software Architecture vs. BTP Architecture

A rebuild guide for the two architecture diagrams so each answers exactly **one**
question and they stop overlapping. Apply these edits in the authoritative
`.drawio` files (draw.io, SAP BTP icon set), then re-export the `.png` and keep
[../architecture.md](../architecture.md) in sync.

- [software-architecture.drawio](software-architecture.drawio) → §2 Software Architecture
- [btp-architecture.drawio](btp-architecture.drawio) → §1 BTP Architecture

## 0. Why

Both diagrams currently show the same middle band — client tier on top, then
Application Router + XSUAA + Runtime Secrets, then HANA at the bottom. The only
real difference today is *which half is expanded*: the software diagram opens up
the **inside of the backend**, the BTP diagram opens up the **platform**. The
shared middle band is what makes them look ~70 % identical.

The fix is not "make them more different" — it is to give each a strict **view
contract** and cut at the deployment-unit line.

## 1. The separation rule

> **Software architecture = logical view.** What the code is and how a request
> flows through it. **Deployment-agnostic** — no infrastructure detail. It must
> stay true even running locally (SQLite + mocked auth).
>
> **BTP architecture = deployment view.** Where it runs and what platform pieces
> wire it together. **No code internals** — the backend collapses to a single
> module box.
>
> **The cut is the deployment unit.** Software stops at "what the code does";
> BTP starts at "what runs as a process/service and how it is bound."

This mirrors the C4 model: software architecture ≈ *Component* view (C4 L3),
BTP architecture ≈ *Deployment* view. Rich actor/device rendering belongs in
neither — it is the *System Context* view, already covered by
[solution-context.drawio](solution-context.drawio) (Appendix A).

## 2. The shared seam — render at different detail in each

Four elements legitimately appear in both diagrams (they are the seam between the
views). Keep them, but render them at **deliberately different detail** so they
read as "context" in one diagram and "subject" in the other.

| Element | In Software Architecture | In BTP Architecture |
|---|---|---|
| Application Router | one thin grey **"Platform boundary"** box (no detail) | full CF module `approuter.nodejs` with route + bindings |
| XSUAA | folded into that same boundary box ("validates token") | managed-service resource (`xs-security.json`), shared by both MTAs |
| HANA Cloud | abstract **"Persistence"** node (HANA in prod / SQLite in dev) | HDI container resource (`hdi-shared`) + `hdb` deployer module |
| Actors (company user / consumer / authority) | minimal entry strip, no device icons | minimal client tier on top (or omit → see solution-context) |

## 3. Software Architecture diagram — rebuild

Target: a clean top-to-bottom **layer stack** of the backend's logical components.

### Remove / collapse
- The whole **"SAP BTP — Cloud Foundry Runtime"** band that wraps the backend.
  Replace the three boxes (Application Router, XSUAA, Runtime Secrets) with a
  **single thin grey box**: `Platform boundary — Approuter terminates auth, XSUAA validates token`.
  Add a one-line caption: *"Detail → BTP Architecture (§1)."*
- Demote **HANA Cloud** at the bottom from a service icon to an abstract
  **Persistence** node labelled `SAP HANA Cloud (prod) · SQLite (dev)`.
- Drop device icons from the client strip; keep three plain role labels.

### Keep / emphasise (this is the subject of this diagram)
- **API Layer** (4 boxes): `OData V4 (authenticated)`, `Public REST (consumer + /healthz)`,
  `Role & Tenant Resolver`, `Authorization Helpers`.
- **Business Logic Layer** — show all **6** (see consistency fix §5): `Product`,
  `Product-item`, `Marketing-link`, `Passport-lifecycle`, `Public-view`, `Identity`.
- **Supporting Libraries** (3 boxes): `Signed Token`, `Secret Loader`, `Aggregator`.
- The **request-flow arrows** between layers (Client → boundary → API → logic →
  libs → persistence). These arrows are the value of this view.

### Add
- The 2 missing business-logic boxes and the `Aggregator` lib (consistency fix).
- A small footnote: *"Same code runs locally on SQLite + mocked auth — the
  platform boundary is the only part that changes between dev and prod."*

### Target layout
```
Client strip      Company user        Consumer (QR)        Authority (HTTP)
─────────────────────────────────────────────────────────────────────────
Platform boundary      [ Approuter terminates auth · XSUAA validates token ]   → detail in §1
─────────────────────────────────────────────────────────────────────────
Backend (Node.js / SAP CAP)
  API Layer        OData V4 · Public REST · Role&Tenant Resolver · Auth Helpers
  Business Logic   Product · Product-item · Marketing-link · Passport-lifecycle · Public-view · Identity
  Supporting Libs  Signed Token · Secret Loader · Aggregator
─────────────────────────────────────────────────────────────────────────
Persistence            SAP HANA Cloud (prod) · SQLite (dev)
```

## 4. BTP Architecture diagram — rebuild

Target: the **deployment topology** — modules, resources, bindings — across
**both** MTAs. No handler/lib boxes anywhere.

### Remove
- Any code-internal boxes. The backend is **one** module: `dpp-srv`.

### Keep / emphasise
- **Subaccount** (region `eu10-004`) → **CF Org** (`CF_ProCode_BAS`) → **Space** (`dev`).
- **Backend MTA** modules: `dpp-srv` (`nodejs`), `dpp-db-deployer` (`hdb`),
  `dpp-approuter` (`approuter.nodejs`).
- **Resources**: `dpp-db` (HANA HDI container, `hdi-shared`),
  `dpp-uaa` (XSUAA, plan `application`), `dpp-secrets` (user-provided service).
- **Bindings** as labelled arrows: `dpp-srv → dpp-db / dpp-uaa / dpp-secrets`;
  `dpp-approuter → srv-api destination → dpp-srv` (`forwardAuthToken: true`);
  `dpp-approuter → dpp-uaa`.
- **Public route** on the backend approuter (the URL baked into every QR code).
- **Future / out-of-scope services** (Destination, Document Management, Alert
  Notification, Application Logging) — keep, but dashed/greyed as "planned".

### Frontend MTA — render as Variante A (localDir)
- The **frontend MTA** (`dpp_frontend`) as its own module group in the same space:
  - `dpp-ui` (`html5`, Vite build → `dist`)
  - `dpp-frontend-approuter` (`approuter.nodejs`) — serves the SPA from its **own
    container** (`xs-app.json` `localDir`, `resources/`); the `dist` is copied into
    the approuter at build time. **No** `dpp-ui-deployer` and **no** `html5-apps-repo`
    resources.
- The **shared XSUAA**: the frontend approuter binds the *same* `dpp-uaa` instance
  (`existing-service`) — same `xsappname`, so the forwarded JWT is accepted by
  `dpp-srv`. This shared-instance arrow is a deployment fact that belongs only here.

> **History — Variante B (dropped).** An earlier design served the SPA from the SAP
> HTML5 Application Repository: a `dpp-ui-deployer` (`com.sap.application.content`)
> module plus `dpp-html5-host` + `dpp-html5-runtime` resources. It was abandoned
> because the repo could not resolve the app in the XSUAA-protected route
> (`Service Tag index is unknown` → endless login loop). The localDir approach above
> is the current, working one — keep these elements **out** of the diagram.

### Target layout
```
Client tier            Company user · Consumer (QR) · Authority      (minimal)
─────────────────────────────────────────────────────────────────────────────
SAP BTP Subaccount (eu10-004)  ·  CF Org CF_ProCode_BAS  ·  Space dev

  ── Backend MTA (dpp-capgemini) ──        ── Frontend MTA (dpp-frontend) ──
  dpp-approuter ──srv-api──▶ dpp-srv       dpp-frontend-approuter ──/odata,/public──▶ (backend srv-api)
        │                     │  │  │         serves SPA from localDir (resources/)
        │                     │  │  └─▶ dpp-secrets (UPS)   dpp-ui (Vite → dist) ──┐
        ▼                     │  └────▶ dpp-db  ◀── dpp-db-deployer (hdb)          └▶ dist copied into approuter
     dpp-uaa (XSUAA) ◀────────┴──────────────────────────── dpp-frontend-approuter
       (shared, existing-service — same xsappname → JWT accepted)

  Planned (dashed): Destination · Document Management · Alert Notification · Application Logging
```

## 5. Consistency fixes (do these while editing)

- **12 tables, not 11.** The legacy [software-architecture.mmd](software-architecture.mmd)
  still says "11 catalogue tables"; the schema is **12**. Drop the count from the
  software diagram (it is a data-model concern) or set it to 12.
- **Six business-logic components**, not four — match
  [../architecture.md](../architecture.md) §2.1: add `Product-item` and
  `Marketing-link`.
- **Aggregator** library (`srv/lib/aggregator.js`) is missing from the diagram —
  add it next to Signed Token and Secret Loader.

## 6. Checklist

- [ ] software-architecture.drawio: collapse BTP band → one "Platform boundary" box
- [ ] software-architecture.drawio: HANA → abstract "Persistence (prod/dev)" node
- [ ] software-architecture.drawio: add 2 logic boxes + Aggregator lib; fix table count
- [x] btp-architecture.drawio: frontend MTA = `dpp-ui` + `dpp-frontend-approuter` (localDir); no `dpp-ui-deployer`, no `html5-apps-repo` resources
- [x] btp-architecture.drawio: shared `dpp-uaa` binding from frontend approuter
- [ ] btp-architecture.drawio: confirm no handler/lib boxes remain
- [ ] Re-export both `.png` (border 10, white background, ≥1400 px)
- [ ] architecture.md §1 + §2 prose synced (done in this change set)
