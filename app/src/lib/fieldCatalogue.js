/**
 * DPP field catalogue — drives the "Field catalogue" sidebar, form validation hints
 * AND the per-field consumer visibility (Public/Internal) toggle in the edit forms.
 * Source: Fashion_DPP_Object_Field_Catalogue.xlsm + the create-form mockups.
 *
 * `visibility: 'public'` is the DEFAULT — the field appears on the consumer DPP (enforced
 * in the backend by srv/lib/field-visibility.js / public-handler.js); 'internal' stays
 * inside DPP Studio. A `company_advanced` user can flip non-locked fields per object.
 *
 * `locked: true` = the field is required to be public by regulation and can NEVER be set
 * internal (server-enforced). This is a REVIEWABLE default derived from the `mandatory`
 * flag + the ESPR / EU textile-labelling context — NOT legal advice; confirm with a
 * compliance advisor. KEEP IN SYNC with the backend mirror dpp_capgemini/srv/lib/field-visibility.js.
 */

/** @typedef {{ key: string, label: string, mandatory: boolean, visibility: 'public' | 'internal', locked?: boolean }} CatalogueField */

/** @type {CatalogueField[]} */
export const PRODUCT_CATALOGUE = [
  { key: 'product_type', label: 'ProductType', mandatory: true, visibility: 'internal' },
  { key: 'name', label: 'ProductName', mandatory: true, visibility: 'public', locked: true },
  { key: 'brand', label: 'Brand', mandatory: true, visibility: 'public', locked: true },
  { key: 'category', label: 'Category', mandatory: true, visibility: 'public', locked: true },
  { key: 'fibre_composition', label: 'FibreComposition', mandatory: true, visibility: 'public', locked: true },
  { key: 'care_instructions', label: 'CareInstructions', mandatory: true, visibility: 'public', locked: true },
  { key: 'repair_instructions', label: 'RepairInstructions', mandatory: true, visibility: 'public', locked: true },
  { key: 'reuse_instructions', label: 'ReuseInstructions', mandatory: false, visibility: 'public' },
  {
    key: 'disposal_instructions',
    label: 'DisposalInstructions',
    mandatory: true,
    visibility: 'public',
    locked: true
  },
  { key: 'durability_score', label: 'DurabilityScore', mandatory: false, visibility: 'public' },
  { key: 'repairability_score', label: 'RepairabilityScore', mandatory: false, visibility: 'public' },
  { key: 'care_video_url', label: 'CareVideoLink', mandatory: false, visibility: 'public' },
  { key: 'repair_video_url', label: 'RepairVideoLink', mandatory: false, visibility: 'public' },
  { key: 'disposal_video_url', label: 'DisposalVideoLink', mandatory: false, visibility: 'public' },
  { key: 'reuse_video_url', label: 'ReuseVideoLink', mandatory: false, visibility: 'public' },
  { key: 'care_products_url', label: 'CareProductsLink', mandatory: false, visibility: 'public' },
  { key: 'repair_products_url', label: 'RepairProductsLink', mandatory: false, visibility: 'public' },
  { key: 'reuse_products_url', label: 'ReuseProductsLink', mandatory: false, visibility: 'public' },
  { key: 'disposal_products_url', label: 'DisposalProductsLink', mandatory: false, visibility: 'public' },
  { key: 'country_of_origin', label: 'CountryOfOrigin', mandatory: true, visibility: 'public', locked: true },
  {
    key: 'substances_of_concern',
    label: 'SubstancesOfConcern',
    mandatory: true,
    visibility: 'public',
    locked: true
  },
  { key: 'espr_compliance', label: 'ESPRComplianceStatus', mandatory: true, visibility: 'public', locked: true },
  { key: 'status', label: 'ProductStatus', mandatory: true, visibility: 'internal' },
  { key: 'model', label: 'Model', mandatory: false, visibility: 'public' },
  { key: 'description', label: 'Description', mandatory: false, visibility: 'public' },
  { key: 'gtin', label: 'GTIN', mandatory: false, visibility: 'internal' },
  { key: 'upc', label: 'UPC', mandatory: false, visibility: 'internal' },
  { key: 'ean', label: 'EAN', mandatory: false, visibility: 'internal' },
  { key: 'storytelling', label: 'Storytelling', mandatory: false, visibility: 'public' }
];

/**
 * Consumer-facing variant fields (mirror toConsumerDTO.variant). None regulatory-locked.
 * @type {CatalogueField[]}
 */
export const VARIANT_CATALOGUE = [
  { key: 'color', label: 'Colour', mandatory: false, visibility: 'public' },
  { key: 'size', label: 'Size', mandatory: false, visibility: 'public' },
  { key: 'sku', label: 'SKU', mandatory: false, visibility: 'internal' },
  { key: 'gtin', label: 'GTIN', mandatory: false, visibility: 'internal' },
  // The "Product image" row controls both keys together.
  { key: 'image_url', label: 'ProductImage', mandatory: false, visibility: 'public' },
  { key: 'image_data', label: 'ProductImage', mandatory: false, visibility: 'public' }
];

/**
 * Consumer-facing batch fields (mirror toConsumerDTO.batch).
 * @type {CatalogueField[]}
 */
export const BATCH_CATALOGUE = [
  { key: 'batch_number', label: 'BatchNumber', mandatory: false, visibility: 'internal' },
  { key: 'production_date', label: 'ProductionDate', mandatory: false, visibility: 'internal' },
  { key: 'country_of_origin', label: 'CountryOfOrigin', mandatory: true, visibility: 'public', locked: true },
  { key: 'co2_footprint_kg', label: 'CO2Footprint', mandatory: false, visibility: 'public' },
  { key: 'recycled_content_pct', label: 'RecycledContent', mandatory: false, visibility: 'public' }
];

/** key → catalogue entry, for O(1) lookup of visibility/locked. */
export function catalogueByKey(catalogue) {
  return Object.fromEntries(catalogue.map((f) => [f.key, f]));
}

/**
 * Effective per-field visibility map: catalogue defaults, overridden by a stored
 * `field_visibility` JSON, with locked fields forced to 'public'.
 * @param {CatalogueField[]} catalogue
 * @param {string|object|null} storedJson
 * @returns {Record<string, 'public'|'internal'>}
 */
export function mergeVisibility(catalogue, storedJson) {
  let stored = {};
  if (storedJson) {
    try {
      const o = typeof storedJson === 'string' ? JSON.parse(storedJson) : storedJson;
      if (o && typeof o === 'object') stored = o;
    } catch {
      /* ignore malformed field_visibility */
    }
  }
  const out = {};
  for (const f of catalogue) {
    if (f.locked) out[f.key] = 'public';
    else if (stored[f.key] === 'public' || stored[f.key] === 'internal') out[f.key] = stored[f.key];
    else out[f.key] = f.visibility;
  }
  return out;
}

/** @type {CatalogueField[]} */
export const PARTNER_CATALOGUE = [
  { key: 'name', label: 'Name', mandatory: true, visibility: 'public' },
  { key: 'country_iso2', label: 'Country', mandatory: true, visibility: 'public' },
  { key: 'status', label: 'Status', mandatory: true, visibility: 'internal' },
  { key: 'roles', label: 'Role (min. 1)', mandatory: true, visibility: 'internal' },
  { key: 'city', label: 'City', mandatory: false, visibility: 'internal' },
  { key: 'address', label: 'Address', mandatory: false, visibility: 'internal' },
  { key: 'contact_person', label: 'ContactPerson', mandatory: false, visibility: 'internal' },
  { key: 'contact_email', label: 'ContactEmail', mandatory: false, visibility: 'internal' },
  { key: 'identifier', label: 'ExternalIdentifier', mandatory: false, visibility: 'internal' }
];

/** Enum option lists (per the agreed alignment: no ProductStatus 'approved', no BP 'authority'). */
export const PRODUCT_TYPES = [
  { value: 'finished', label: 'Finished product', hint: 'End-consumer garment or accessory' },
  { value: 'material', label: 'Material', hint: 'Raw fabric, yarn or fibre' },
  { value: 'component', label: 'Component', hint: 'Button, zipper, label or trim' },
  { value: 'packaging', label: 'Packaging', hint: 'Box, bag or hang tag' }
];

export const PRODUCT_STATUSES = [
  { value: 'draft', label: 'Draft', hint: 'Work in progress — not yet active' },
  { value: 'published', label: 'Published', hint: 'Active — DPPs can be generated' },
  { value: 'archived', label: 'Archived', hint: 'No longer active; read-only' }
];

export const ESPR_STATUSES = [
  { value: 'draft', label: 'Draft', hint: 'Not yet assessed' },
  { value: 'in_review', label: 'In review', hint: 'Documentation being gathered' },
  { value: 'compliant', label: 'Compliant', hint: 'All ESPR requirements met' },
  { value: 'non_compliant', label: 'Non-compliant', hint: 'One or more requirements not met' }
];

/** App user roles for the Settings → user management screen. */
export const USER_ROLES = [
  { value: 'company_user', label: 'User (read-only)', hint: 'Can view everything in the organisation, but cannot edit.' },
  { value: 'company_advanced', label: 'Advanced (full access)', hint: 'Full access, incl. creating/managing users.' }
];

/**
 * Document types for certificates & proofs (DocumentManager). Values mirror the
 * CDS `DocumentType` enum exactly.
 */
export const DOCUMENT_TYPES = [
  { value: 'certificate', label: 'Certificate' },
  { value: 'test_report', label: 'Test report' },
  { value: 'declaration_of_conformity', label: 'Declaration of conformity' },
  { value: 'safety_data_sheet', label: 'Safety data sheet' },
  { value: 'manual', label: 'Manual' },
  { value: 'other', label: 'Other' }
];

/** Quick value→label lookup for rendering document rows. */
export const DOC_TYPE_LABEL = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t.value, t.label]));

/**
 * Marketing/advertising link types (MarketingLinksManager). Values mirror the CDS
 * `MarketingLinkType` enum exactly.
 */
export const MARKETING_LINK_TYPES = [
  { value: 'advertisement', label: 'Advertisement' },
  { value: 'product_info', label: 'Product info' },
  { value: 'care_product', label: 'Care product' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'related_product', label: 'Related product' },
  { value: 'other', label: 'Other' }
];

/** Quick value→label lookup for rendering marketing-link rows. */
export const MARKETING_LINK_LABEL = Object.fromEntries(MARKETING_LINK_TYPES.map((t) => [t.value, t.label]));

/**
 * How a marketing link renders on the consumer DPP (mirrors the CDS `MarketingMediaType`
 * enum). 'image' = a clickable image tile; 'video' = a play overlay on the thumbnail.
 */
export const MARKETING_MEDIA_TYPES = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' }
];

/**
 * Where a marketing link appears on the consumer DPP (mirrors the CDS `MarketingPlacement`
 * enum). 'discover_more' = inline in the "Discover more" section; 'left'/'right' = a side
 * rail next to the passport on desktop, or the "Featured" block on mobile.
 */
export const MARKETING_PLACEMENTS = [
  { value: 'discover_more', label: 'Discover more (inline)' },
  { value: 'left', label: 'Left of the passport' },
  { value: 'right', label: 'Right of the passport' }
];

export const PARTNER_ROLES = [
  { value: 'supplier', label: 'Supplier', hint: 'Provides raw materials or components' },
  { value: 'manufacturer', label: 'Manufacturer', hint: 'Produces or assembles the finished product' },
  { value: 'recycler', label: 'Recycler', hint: 'Handles end-of-life processing' },
  { value: 'certification_body', label: 'Certification body', hint: 'Issues compliance certificates' },
  { value: 'distributor', label: 'Distributor', hint: 'Distributes products to market' },
  { value: 'retailer', label: 'Retailer', hint: 'Sells products to end customers' },
  { value: 'logistics_provider', label: 'Logistics provider', hint: 'Manages transport and shipping' }
];
