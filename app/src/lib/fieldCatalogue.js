/**
 * DPP field catalogue — drives the "Field catalogue" sidebar and form validation hints.
 * Source: Fashion_DPP_Object_Field_Catalogue.xlsm + the create-form mockups.
 *
 * `visibility: 'public'` means the field appears on the consumer DPP (see toConsumerDTO
 * in the backend public-handler.js); 'internal' stays inside DPP Studio.
 */

/** @typedef {{ key: string, label: string, mandatory: boolean, visibility: 'public' | 'internal' }} CatalogueField */

/** @type {CatalogueField[]} */
export const PRODUCT_CATALOGUE = [
  { key: 'product_type', label: 'ProductType', mandatory: true, visibility: 'internal' },
  { key: 'name', label: 'ProductName', mandatory: true, visibility: 'public' },
  { key: 'brand', label: 'Brand', mandatory: true, visibility: 'public' },
  { key: 'category', label: 'Category', mandatory: true, visibility: 'public' },
  { key: 'fibre_composition', label: 'FibreComposition', mandatory: true, visibility: 'public' },
  { key: 'care_instructions', label: 'CareInstructions', mandatory: true, visibility: 'public' },
  { key: 'repair_instructions', label: 'RepairInstructions', mandatory: true, visibility: 'public' },
  { key: 'reuse_instructions', label: 'ReuseInstructions', mandatory: false, visibility: 'public' },
  {
    key: 'disposal_instructions',
    label: 'DisposalInstructions',
    mandatory: true,
    visibility: 'public'
  },
  { key: 'durability_score', label: 'DurabilityScore', mandatory: false, visibility: 'public' },
  { key: 'repairability_score', label: 'RepairabilityScore', mandatory: false, visibility: 'public' },
  { key: 'care_video_url', label: 'CareVideoLink', mandatory: false, visibility: 'public' },
  { key: 'repair_video_url', label: 'RepairVideoLink', mandatory: false, visibility: 'public' },
  { key: 'disposal_video_url', label: 'DisposalVideoLink', mandatory: false, visibility: 'public' },
  { key: 'reuse_video_url', label: 'ReuseVideoLink', mandatory: false, visibility: 'public' },
  { key: 'country_of_origin', label: 'CountryOfOrigin', mandatory: true, visibility: 'public' },
  {
    key: 'substances_of_concern',
    label: 'SubstancesOfConcern',
    mandatory: true,
    visibility: 'public'
  },
  { key: 'espr_compliance', label: 'ESPRComplianceStatus', mandatory: true, visibility: 'public' },
  { key: 'status', label: 'ProductStatus', mandatory: true, visibility: 'internal' },
  { key: 'model', label: 'Model', mandatory: false, visibility: 'public' },
  { key: 'description', label: 'Description', mandatory: false, visibility: 'public' },
  { key: 'gtin', label: 'GTIN', mandatory: false, visibility: 'internal' },
  { key: 'storytelling', label: 'Storytelling', mandatory: false, visibility: 'public' }
];

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

export const PARTNER_ROLES = [
  { value: 'supplier', label: 'Supplier', hint: 'Provides raw materials or components' },
  { value: 'manufacturer', label: 'Manufacturer', hint: 'Produces or assembles the finished product' },
  { value: 'recycler', label: 'Recycler', hint: 'Handles end-of-life processing' },
  { value: 'certification_body', label: 'Certification body', hint: 'Issues compliance certificates' },
  { value: 'distributor', label: 'Distributor', hint: 'Distributes products to market' },
  { value: 'retailer', label: 'Retailer', hint: 'Sells products to end customers' },
  { value: 'logistics_provider', label: 'Logistics provider', hint: 'Manages transport and shipping' }
];
