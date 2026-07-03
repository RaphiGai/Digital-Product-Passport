using { dpp.identified, dpp.Visibility } from './common';
using { dpp.ProductCategories } from './product';

namespace dpp;

// ----- Attribute catalogue (Epic 12 — multi-category scalability) -----
// Master data maintained by developers/IT consultants (CSV seeds or direct DB
// maintenance): the single source of truth for which fields a product category
// carries, which are mandatory for approve/publish, their consumer visibility
// defaults and the regulatory locked-public set. Replaces the previously
// hardcoded catalogues in srv/lib/field-visibility.js, srv/lib/mandatory-fields.js,
// srv/lib/dpp-validation.js#FIELD_META and the frontend fieldCatalogue.js.
// Adding a field or a whole category is a DATA change — no code, no new tables.

// One row per field. `category` null ⇒ core field shared by ALL categories
// (physical column today); a category-scoped row belongs to that category only.
// `storage` says where the value lives: 'column' = a physical CDS column on the
// level entity, 'json' = a key in the entity's `attributes` JSON bag.
//
// Key rules (enforced by srv/lib/catalogue.js): ^[a-z][a-z0-9_]*$ and NOT one of
// {status, id, attributes, field_visibility} nor ending in `_id` — those names
// collide with snapshot-hash.js#stripDeep, which would silently drop the value
// from the drift hash.
entity AttributeDefinitions : identified {
  category           : Association to ProductCategories;   // null ⇒ core (all categories)
  level              : String(10)  not null;               // 'product' | 'variant' | 'batch'
  ![key]             : String(60)  not null;               // column name or attributes-bag key (escaped: `key` is a CDS keyword)
  storage            : String(6)   not null default 'json';// 'column' | 'json'
  label              : String(120) not null;               // human-facing (clean English)
  description        : String(500);                        // optional help text for the edit form
  datatype           : String(10)  not null;               // string|text|number|integer|date|boolean|url|enum
  widget             : String(20);                         // FE hint: input|textarea|select|country|score|image|video_link|shop_link|storytelling
  section            : Association to AttributeSections;   // form/consumer grouping
  grp                : String(40);                         // consumer sub-group (e.g. 'care' bundles text+video+shop link)
  sort_order         : Integer default 0;
  unit               : String(20);                         // display unit (kg, %, …)
  min_value          : Decimal(15, 4);
  max_value          : Decimal(15, 4);
  max_length         : Integer;
  regex              : String(200);
  options            : LargeString;                        // JSON [{value,label}] for datatype 'enum'
  mandatory          : Boolean default false;              // approve/publish gate (presence)
  fix_hint           : String(200);                        // readiness-check fix hint (was dpp-validation FIELD_META)
  validation_section : String(40);                         // readiness-report section (Product|Circularity|Production|…)
  default_visibility : Visibility default 'public';        // consumer default; overridable per object
  locked_public      : Boolean default false;              // regulatory: always public, never hideable
  is_active          : Boolean default true;
}

annotate AttributeDefinitions with @assert.unique : { def_per_field : [category, level, key] };

// Form/consumer sections per category (`category` null ⇒ core section).
// `icon` is a lucide icon name resolved by the frontend with a safe fallback.
entity AttributeSections : identified {
  category         : Association to ProductCategories;     // null ⇒ core
  ![key]           : String(60)  not null;
  title            : String(120) not null;
  icon             : String(40);
  sort_order       : Integer default 0;
  show_on_consumer : Boolean default true;
}

annotate AttributeSections with @assert.unique : { section_per_category : [category, key] };

// Per-category compliance configuration: which document types count as the
// expected ESPR evidence set (drives compliance-handlers.js#EXPECTED).
// `expected_doc_types` is a comma-separated list (or JSON array) of DocumentType
// values, e.g. "certificate,test_report,declaration_of_conformity".
entity CategoryRequirements : identified {
  category           : Association to ProductCategories not null;
  expected_doc_types : LargeString;
}
