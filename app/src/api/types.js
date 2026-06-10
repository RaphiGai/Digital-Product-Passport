/**
 * JSDoc typedefs for the DPP backend shapes — give editor autocomplete without TypeScript.
 *
 * Mirrors the CDS model (db/*.cds, srv/dpp-service.cds). Per the agreed alignment:
 *  - ProductStatus omits `approved` (only DPPStatus keeps `approved`).
 *  - BusinessPartnerRole has no `authority`.
 *
 * This file exports nothing at runtime; it only carries types for tooling.
 */

/** @typedef {'company_advanced' | 'company_user'} UserRole */

/**
 * @typedef {Object} MeInfo
 * @property {string} id
 * @property {string} displayName
 * @property {string} email
 * @property {UserRole} role
 * @property {string} organizationId
 * @property {string} tenantId
 */

/** @typedef {'finished' | 'material' | 'component' | 'packaging'} ProductType */
/** @typedef {'draft' | 'published' | 'archived'} ProductStatus */
/** @typedef {'draft' | 'in_review' | 'compliant' | 'non_compliant'} ESPRComplianceStatus */
/** @typedef {'draft' | 'in_review' | 'approved' | 'published' | 'archived'} DPPStatus */
/** @typedef {'product' | 'material' | 'item'} DPPType */
/** @typedef {'internal' | 'public'} Visibility */
/**
 * @typedef {'supplier' | 'manufacturer' | 'recycler' | 'certification_body'
 *   | 'distributor' | 'retailer' | 'logistics_provider'} BusinessPartnerRole
 */

/**
 * @typedef {Object} Product
 * @property {string} ID
 * @property {string} name
 * @property {string} [brand]
 * @property {string} [category]
 * @property {string} [model]
 * @property {ProductType} product_type
 * @property {ProductStatus} status
 * @property {ESPRComplianceStatus} [espr_compliance]
 * @property {string} [gtin]
 * @property {string} [fibre_composition]
 * @property {string} [country_of_origin]
 * @property {string} [storytelling] JSON array string [{title, body}]
 */

/**
 * @typedef {Object} BusinessPartner
 * @property {string} ID
 * @property {string} name
 * @property {string} [country_iso2]
 * @property {string} [city]
 * @property {boolean} [archived]
 */

/**
 * @typedef {Object} DPP
 * @property {string} ID
 * @property {DPPStatus} status
 * @property {Visibility} visibility
 * @property {DPPType} dpp_type
 * @property {number} [current_version]
 * @property {string} [qr_token]
 * @property {string} [public_url]
 */

export {};
