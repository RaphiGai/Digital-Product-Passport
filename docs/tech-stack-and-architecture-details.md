# Tech Stack & Architektur — Detail-Aufschlüsselung

Begleitreferenz für die Präsentation und für Q&A. Dröselt jede Technologie und
jeden Baustein nach seiner **Rolle** auf, mit der Achse *lokal (Dev) vs.
Produktion* bzw. *generiert vs. selbst geschrieben* bzw. *Modul vs. Resource*.

> **Die drei Sichten in je einem Satz:**
> - **Tech Stack** — *womit* gebaut wird.
> - **Software-Architektur** — *wie* der Code aufgebaut ist (logisch, deployment-agnostisch).
> - **BTP-Architektur** — *wo* es läuft (Deployment-Topologie auf der Plattform).
>
> Diagramme: [software-architecture](diagrams/software-architecture.png) ·
> [btp-architecture](diagrams/btp-architecture.png) ·
> [erd](diagrams/erd.png). Trennungsregeln: [diagrams/diagram-separation-spec.md](diagrams/diagram-separation-spec.md).

---

## 1. Tech Stack

### Backend

| Rolle (Konzept) | Technologie | Dev (lokal) | Prod (BTP) | Aufgabe |
|---|---|---|---|---|
| **Runtime** (führt den Code aus) | **Node.js** | direkt gestartet | läuft *innerhalb* der **Cloud Foundry Runtime** | macht aus JS ein laufendes Programm |
| **Framework** (strukturiert) | **SAP CAP** (`@sap/cds` 9) | ✓ | ✓ | generiert OData/Swagger, verdrahtet DB + Auth, ruft eure Handler |
| **Web-/HTTP-Schicht** | **Express** | ✓ | ✓ | trägt unter CAP die Public-REST-Routen |
| **Datenmodell-Sprache** | **CDS** | ✓ | ✓ | definiert die 12 Entitäten + den Service-Vertrag |
| **API – intern** | **OData V4** | ✓ | ✓ | auto-generiertes CRUD für die Firmen-App |
| **API – öffentlich** | **Public REST** | ✓ | ✓ | handgeschriebene Consumer- + Health-Endpoints |
| **Datenbank** | **SQLite** / **SAP HANA Cloud** | SQLite | HANA (HDI-Container) | speichert die Daten |
| **Authentifizierung** | **XSUAA** | Mock-Auth | XSUAA | stellt Tokens aus / prüft sie |
| **Einstieg + Auth-Terminierung** | **Application Router** | (Vite-Proxy) | Approuter | öffentliche Tür, leitet mit JWT weiter |
| **Geheimnisse / Config** | **Runtime Secrets** | `.env` | user-provided service | HMAC-Key + Public Base URL |
| **Hilfsbibliotheken** | `qrcode`, `@sap/xssec`, `crypto`/HMAC | ✓ | ✓ | QR-PNG, Token-Validierung, Token-Signatur |
| **Tests** | **Jest** + `cds.test` | ✓ | — | Unit + Integration |
| **Deployment** | **MTA** (`mta.yaml`) + `mbt` + `cf` | — | ✓ | paketiert & rollt aus |

### Frontend

| Rolle (Konzept) | Technologie | Aufgabe |
|---|---|---|
| **Runtime** | der **Browser** des Nutzers | führt die App aus (nicht Vite!) |
| **UI-Framework** | **React 18** | baut die Oberfläche aus Komponenten |
| **Sprache** | **JavaScript (JSX)** + JSDoc | statt TypeScript; JSDoc nur fürs Autocomplete |
| **Build-Tool / Dev-Server** | **Vite** | bündelt den Code; lokal mit Proxy zum Backend |
| **Styling** | **Tailwind CSS** | eigene UI-Komponenten, keine Library |
| **Server-State / Datenabruf** | **TanStack Query** | holt + cached OData-Daten |
| **Routing** | **React Router** | Navigation zwischen Seiten |
| **Icons** | **lucide-react** | — |
| **Auslieferung (Prod)** | **Application Router** (localDir) | serviert die gebaute SPA **aus dem eigenen Container**, leitet API weiter |

### Präzisierungen
1. **Node.js vs. Cloud Foundry:** In Prod ist es *weiterhin Node.js* — es läuft nur **innerhalb** der Cloud Foundry Runtime (CF stellt Container + Buildpack). Also nicht „CF *ersetzt* Node.js", sondern „CF *hostet* Node.js".
2. **Vite ist keine Runtime**, sondern Build-Tool + Dev-Server. Die *Runtime* des Frontends ist der **Browser**.
3. **CAP läuft auf Express**, nicht daneben: Express ist die HTTP-Basis, CAP die Schicht darüber — die Public-REST-Routen klinken sich direkt in Express ein.

### Sprech-Satz
> „Im Backend ist **SAP CAP** das Framework, **Node.js** die Runtime — lokal direkt, in Prod gehostet von der **Cloud Foundry Runtime**. **CDS** ist die Datenmodell-Sprache, **OData V4** und **REST** sind die API, **XSUAA** die Authentifizierung, und die Datenbank ist **SQLite** lokal bzw. **SAP HANA Cloud** in Prod. Das Frontend ist **React mit Vite und Tailwind**, ausgeliefert über den **Application Router**, der die gebaute SPA aus seinem eigenen Container serviert — beide MTAs teilen sich dieselbe XSUAA."

---

## 1a. Warum dieser Stack — Begründung der Wahl

Drei Leitlinien: **BTP-nativ** (gemanagte Plattformdienste statt Eigenbetrieb),
**etablierte Werkzeuge mit großer Community** (wartbar durch ein wechselndes
Studententeam, leicht zu lernen und zu besetzen) und **Skalierbarkeit ohne
Betriebsaufwand** (horizontale Skalierung übernimmt die Plattform).

### Plattform & Backend

| Technologie | Warum gewählt |
|---|---|
| **SAP BTP / Cloud Foundry** | Projektkontext ist das SAP-Ökosystem; gemanagte HANA + XSUAA → keine eigene Infrastruktur; horizontale Skalierung über zusätzliche CF-Instanzen ohne Ops-Aufwand. |
| **SAP CAP** (`@sap/cds`) | De-facto-Standard für BTP-Business-Apps: liefert OData, HANA-Integration, XSUAA-Auth und lokales Mocking out-of-the-box → wenig Boilerplate; SAP-gepflegt, gut dokumentiert, aktive Enterprise-Community. |
| **Node.js** | CAP-Runtime; riesiges npm-Ökosystem und großer Entwicklerpool (wichtig für ein wechselndes Team); non-blocking I/O passt zur I/O-lastigen API. |
| **OData V4** | SAP-/Fiori-Standard; eingebautes Querying (`$filter`/`$expand`/`$count`), Metadaten und generierte Clients → keine eigene API-Spezifikation nötig. |
| **SAP HANA Cloud** / **SQLite** | HANA = skalierbare gemanagte DB des SAP-Stacks; SQLite → lokale Entwicklung ohne DB-Setup; CAP abstrahiert beide → identischer Code in Dev und Prod. |
| **XSUAA + Application Router** | Plattform-Standard für OAuth2 — kein selbstgebauter Auth-Code; ein einziger Origin (kein CORS). |
| **MTA + `mbt`** | BTP-Standard-Deployment: ein Deskriptor baut alle Module, legt Services an und verdrahtet Bindings **atomar** (Rollback bei Fehler) — reproduzierbar über Spaces hinweg. |

### Frontend

| Technologie | Warum gewählt |
|---|---|
| **React 18** | Größte Frontend-Community + Ökosystem → viele Bibliotheken, Lernressourcen und verfügbare Entwickler; Komponentenmodell → wartbar und teamfähig. |
| **Vite** | Schneller HMR-Dev-Server + schlanker Prod-Build; einfache Multi-Entry-Konfiguration (App + Consumer-View); aktueller De-facto-Standard. |
| **Tailwind CSS** | Utility-first → schnelle, konsistente UI ohne CSS-Namens-Overhead; ungenutzte Klassen werden entfernt → kleines Bundle; kein Library-Lock-in. |
| **TanStack Query** | Bewährtes Caching, Invalidierung und Lade-/Fehlerzustände → deutlich weniger Boilerplate als selbst gebauter Fetch-State. |
| **React Router** | De-facto-Standard-Routing für React-SPAs. |
| **JSDoc statt TypeScript** | Autocomplete + Typhinweise ohne zusätzlichen Build-Schritt — bewusste Komplexitätsreduktion für ein kleines Team. |

---

## 2. Software-Architektur

*Sicht: WIE der Code aufgebaut ist. Der Request fließt top-down durch die Schichten.*

| Schicht | Konkrete Komponente (Datei) | Herkunft | Aufgabe |
|---|---|---|---|
| **Client** | React-SPA + Consumer-View (Frontend) · HTTP-Client (Behörde) | selbst / extern | sendet Anfragen, zeigt an — **keine** Regeln, **keine** Secrets |
| **Platform boundary** | Application Router + XSUAA | Plattform | lässt rein, prüft „eingeloggt ja/nein" |
| **API · Vertrag** | [srv/dpp-service.cds](../srv/dpp-service.cds) | selbst (deklarativ) | definiert **was** aufrufbar ist: 12 Projektionen, Actions, `me()` |
| **API · CRUD-Endpunkte** | OData V4 | **CAP-generiert** | Lesen/Schreiben + `$metadata` + Swagger automatisch |
| **API · Türsteher** | [srv/dpp-service.js](../srv/dpp-service.js), [srv/handlers/auth-helpers.js](../srv/handlers/auth-helpers.js) | selbst | Rolle + Mandant aus DB, Tenant-Filter — **vor** jedem Handler |
| **API · öffentlich** | [srv/server.js](../srv/server.js) (Express-Mounts) | selbst | `/public`, `/healthz` — bewusst außerhalb der CAP-Auth |
| **Business Logic** | [srv/handlers/](../srv/handlers/)*.js | selbst | Defaults, Lifecycle-Automat, BOM-Check, Consumer-DTO |
| **Supporting Libs** | [srv/lib/](../srv/lib/){token, secrets, aggregator}.js | selbst | HMAC-Token, Secret-Loader, hierarchische Aggregation |
| **Persistence** | [db/](../db/)*.cds → SQLite/HANA | **CAP-generiert** | Schema + SQL-Queries automatisch aus dem Modell |

### Präzisierungen
1. **Reihenfolge ist Teil des Frameworks:** CAP arbeitet jede Anfrage in Phasen `before → on → after` ab. Die Guards sind `before`, die Lifecycle-Logik ist `on`. Der Türsteher läuft also **garantiert vor** der Business-Logik.
2. **Arbeitsteilung Framework ↔ eigener Code:** CAP generiert **CRUD + Schema** aus dem Modell; alles Fachliche (Guards, Lifecycle, Aggregation, Consumer-DTO) ist **selbst geschrieben**.
3. **Deployment-agnostisch:** diese Sicht stimmt auch lokal (SQLite + Mock-Auth) — nur die Platform boundary wechselt.

### Sprech-Satz
> „Die Software-Architektur ist sechs Schichten von oben nach unten: Client, Platform boundary, API, Business Logic, Libs, Persistence. **CAP generiert** das CRUD und das Schema aus dem Modell; alles Fachliche — die Guards, der Lifecycle-Automat und die Aggregation — ist **selbst geschrieben**. Der Türsteher resolved Rolle und Mandant aus der DB und läuft vor jeder Logik."

---

## 3. BTP-Architektur

*Sicht: WO es läuft. Alles steckt im Subaccount (eu10-004) · CF Org · Space `dev`.*

Zentrale Unterscheidung: **Modul** = wird deployt und *läuft* · **Resource** = gebuchter Plattformdienst, an den Module per *Binding* andocken.

| Rolle | Komponente | MTA-Typ | Backend/Frontend | Aufgabe |
|---|---|---|---|---|
| **Einstieg / Routing** | dpp-approuter | **Modul** (`approuter.nodejs`) | Backend | öffentliche Tür, leitet API mit JWT weiter |
| **App-Laufzeit** | dpp-srv | **Modul** (`nodejs`) | Backend | der laufende CAP-Service |
| **Schema-Deploy** | dpp-db-deployer | **Modul** (`hdb`) | Backend | erzeugt das HANA-Schema, läuft einmal, beendet sich |
| **SPA-Auslieferung** | dpp-frontend-approuter | **Modul** (`approuter.nodejs`) | Frontend | serviert die SPA **aus localDir** (eigener Container), leitet `/odata`,`/public` weiter |
| **UI-Build** | dpp-ui | **Modul** (`html5`) | Frontend | Vite-Build → `dist`; `dist` wird beim Build **in den Approuter kopiert** |
| **Datenbank** | dpp-db | **Resource** (HANA HDI, `hdi-shared`) | geteilt | speichert die 12 Tabellen |
| **Identität** | dpp-uaa | **Resource** (XSUAA, `application`) | **von beiden MTAs geteilt** | stellt Tokens aus / prüft sie |
| **Geheimnisse** | dpp-secrets | **Resource** (user-provided, vorab angelegt) | Backend | HMAC-Key + Public Base URL |

### Präzisierungen
1. **Binding = die Verbindung:** ein Modul „requires" eine Resource → CF spielt die Zugangsdaten als `VCAP_SERVICES` in die Umgebung. Genau das liest [srv/lib/secrets.js](../srv/lib/secrets.js) beim Boot.
2. **Geteilte XSUAA:** das Frontend bucht **keine** neue XSUAA, sondern bindet die bestehende (`existing-service`) → **gleicher `xsappname`** → das vom Frontend-Approuter weitergereichte JWT wird vom Backend akzeptiert.
3. **Zwei Approuter:** jedes MTA hat seinen eigenen — Backend-Einstieg vs. Frontend-SPA-Auslieferung. **Beide** leiten an `dpp-srv` weiter.
4. **Build vs. Deploy:** `mbt build` packt alles in ein `.mtar` (Module + Resource-Deklarationen); `cf deploy` legt die Resources an und startet die Module.

### Sprech-Satz
> „Auf BTP gibt es zwei Arten von Bausteinen: **Module**, die laufen — Approuter, der CAP-Service `dpp-srv` und der DB-Deployer — und **Resources**, also gebuchte Dienste: HANA als HDI-Container, XSUAA und die Runtime-Secrets. Module docken per **Binding** an Resources an. Der Clou: **beide MTAs — Backend und Frontend — teilen sich eine XSUAA**, deshalb wird das durchgereichte Token akzeptiert."

---

## Merksatz für die Abgrenzung

> Tech Stack = **womit**. Software-Architektur = **wie der Code aufgebaut ist** (logisch). BTP-Architektur = **wo es läuft** (Deployment). Dieselbe Anwendung, drei Sichten.
