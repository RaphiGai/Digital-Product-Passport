# Attribute Catalogue — Multi-Category DPPs (Epic 12)

The platform supports any ESPR product group (textiles, electronics, shoes, …)
from ONE data model and ONE code base. Which fields a passport carries, which
are mandatory for approve/publish, their consumer visibility defaults, the
regulatory locked-public set, the form sections/widgets and the expected
compliance evidence — all of it is **master data**, not code:

| Entity (db/config.cds)  | Seed file (db/data/)             | Drives |
|-------------------------|----------------------------------|--------|
| `ProductCategories`     | dpp-ProductCategories.csv        | the category picker (ESPR product group) |
| `AttributeDefinitions`  | dpp-AttributeDefinitions.csv     | fields: key, storage, label, datatype, widget, section, grp, constraints, mandatory + fix hint, visibility default, locked |
| `AttributeSections`     | dpp-AttributeSections.csv        | form/consumer grouping, titles, icons, order |
| `CategoryRequirements`  | dpp-CategoryRequirements.csv     | expected evidence document types per category |

`category` empty = **core** row (applies to every category: name, brand, GTIN,
country of origin, substances of concern, ESPR scores, batch fields …).
Category-scoped rows define that category's specific fields.

Values of category-specific fields live in the `attributes` JSON bag on
`Products` / `ProductVariants` / `Batches` (`storage: 'json'`), validated on
every write against the definitions (datatype, min/max, length, regex, enum
options, http(s)-only URL guard; unknown/reserved keys rejected). Core fields
stay physical columns (`storage: 'column'`).

Everything downstream reads the catalogue at runtime — approve/publish gate and
readiness checks (`srv/lib/mandatory-fields.js`, `srv/lib/dpp-validation.js`),
per-field consumer visibility (`srv/lib/field-visibility.js`), the
self-describing consumer DTO (`attribute_sections` in
`srv/handlers/public-handler.js`, frozen into every published snapshot),
imports, drift hashing, and the frontend (forms, detail views, consumer
passport) via `DPPService.fieldCatalogue(category)`.

## How do I …

**… add a field or a category? → Use the admin UI (primary way).** DPP Studio →
System → **Field catalogue** (visible to the PLATFORM OPERATOR only:
`company_advanced` of the `is_platform_tenant` organization — enforced
server-side in `srv/handlers/catalogue-admin-handlers.js`, surfaced via
`me().isPlatformAdmin`). There you create categories (blank or as a clone of an
existing one via `cloneCategoryCatalogue`), manage sections and add/edit fields
with a live preview of the resulting form. Changes take effect IMMEDIATELY —
every write clears the server-side catalogue cache and the UI invalidates its
queries; no redeploy, no restart. Guardrails: technical keys are derived once
from the label and immutable afterwards; runtime fields are always bag-backed
(`storage='json'`); enum fields need options; locked fields must be public;
fields with stored values can only be deactivated, not deleted
(`catalogueUsage` shows the counts).

**… the seed-CSV way (bootstrap/transport).** The same rows can be shipped as
seed data — `dpp-ProductCategories.csv`, `dpp-AttributeSections.csv`,
`dpp-AttributeDefinitions.csv`, `dpp-CategoryRequirements.csv` — e.g. for a
fresh deployment or to transport a catalogue between environments. See
`electronics` in the seeds and `test/integration/electronics-category.test.js`,
which proves the full lifecycle for a category that exists only as data. Key
rules (enforced in both paths): `^[a-z][a-z0-9_]*$`, not
`status`/`id`/`attributes`/`field_visibility`, no `_id` suffix.

**… add a new widget/rendering style?** The only code-level extension point:
register a renderer in the frontend widget registries
(`app/src/ui/AttributeFields.jsx` for forms, `app/src/consumer/ConsumerApp.jsx`
for the passport), then reference it via the definition's `widget` hint.

**… add a core field that needs OData `$filter`/unique constraints?** Classic
CDS column + a catalogue row with `storage: 'column'`, `category` empty.

## Migration notes (July 2026)

The former textile columns (fibre composition, care/repair/reuse/disposal
blocks incl. video/shop links; variant colour/size) were moved into the
attributes bag; `ProductBOMs.component_fibre_composition` became
`component_composition`. For persistent databases run
`node scripts/migrate-attributes.js` BEFORE deploying the column drop — it
copies the values into the bag and clears `baseline_content_hash` so the
server re-anchors drift baselines on startup (no mass draft-revert). Passports
published before the migration keep rendering: their frozen snapshots carry
the old field names and both the consumer app and the version viewer read
bag-first with a column fallback.

The mandatory/locked defaults in the catalogue remain reviewable defaults
derived from the ESPR/labelling context — not legal advice; confirm changes
with a compliance advisor.
