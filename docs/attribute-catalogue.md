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

**… add a field to a category?** Add ONE row to
`dpp-AttributeDefinitions.csv` (or insert it directly into the deployed DB).
No code, no schema change, no frontend rebuild — validation, the approve gate,
visibility, snapshots/drift, the consumer passport, import and export pick it
up from the catalogue. Key rules: `^[a-z][a-z0-9_]*$`, not
`status`/`id`/`attributes`/`field_visibility`, no `_id` suffix.

**… add a whole category?** Add rows to `dpp-ProductCategories.csv`,
`dpp-AttributeSections.csv`, `dpp-AttributeDefinitions.csv` and
`dpp-CategoryRequirements.csv`. That's it — see `electronics` in the seeds and
`test/integration/electronics-category.test.js`, which proves the full
lifecycle (create → category-specific gate → publish → consumer passport) for a
category that exists only as data.

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
