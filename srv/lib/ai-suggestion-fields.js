'use strict';

/**
 * Allowlist of fields for which AI-generated text is permitted.
 *
 * Only free-text presentation and instruction fields belong here.
 *
 * Do not add:
 * - identifiers;
 * - GTIN or UPI;
 * - statuses;
 * - dropdown or enum values;
 * - country codes;
 * - dates;
 * - sustainability metrics;
 * - percentages;
 * - calculated values;
 * - relationship or business-partner IDs.
 */
const SUGGESTION_FIELDS = Object.freeze({
  product: Object.freeze({
    description: Object.freeze({
      label: 'Product description',
      maxLength: 500,
      guidance: `
Write a clear, factual and consumer-friendly product description.

You may mention information that is explicitly available in the supplied
context, such as:
- product type;
- intended use;
- known material composition;
- known design or functional characteristics;
- brand;
- model.

Do not invent:
- certifications;
- compliance statements;
- sustainability claims;
- environmental benefits;
- performance characteristics;
- country of origin;
- dimensions or measurements;
- percentages;
- environmental values.
      `.trim(),
    }),

    care_instructions: Object.freeze({
      label: 'Care instructions',
      maxLength: 500,
      guidance: `
Write concise and practical care instructions for the consumer.

Only mention specific washing temperatures, drying methods, ironing
temperatures, cleaning methods or restrictions when they are explicitly
supported by the supplied context.

When specific care requirements are unavailable, use cautious wording and
recommend following the product label or manufacturer guidance.

Do not invent:
- care symbols;
- washing temperatures;
- cleaning restrictions;
- material treatment requirements.
      `.trim(),
    }),

    repair_instructions: Object.freeze({
      label: 'Repair instructions',
      maxLength: 500,
      guidance: `
Write concise and practical repair instructions.

You may describe general repair steps that do not require invented product
specifications. Recommend professional repair when specialist tools,
replacement components or technical knowledge may be required.

Do not:
- promise that the product is repairable;
- invent spare-part availability;
- invent repair services;
- invent a warranty;
- invent technical specifications.
      `.trim(),
    }),

    reuse_instructions: Object.freeze({
      label: 'Reuse instructions',
      maxLength: 500,
      guidance: `
Write practical instructions for extending the useful life of the product.

Where appropriate, you may mention:
- continued use;
- cleaning before reuse;
- resale;
- donation;
- repurposing;
- transfer to a suitable reuse organisation.

Do not invent:
- a company take-back programme;
- a resale platform;
- a donation partnership;
- guaranteed suitability for a particular reuse purpose.
      `.trim(),
    }),

    disposal_instructions: Object.freeze({
      label: 'Disposal instructions',
      maxLength: 500,
      guidance: `
Write practical end-of-life instructions.

Prioritise reuse and repair before disposal. Where appropriate, advise the
consumer to use a suitable textile collection, recycling or municipal waste
service according to local rules.

Do not:
- claim that the entire product is recyclable unless explicitly supported;
- invent local collection points;
- invent recycling programmes;
- invent take-back services;
- promise a specific recycling outcome.
      `.trim(),
    }),

    storytelling: Object.freeze({
      label: 'Product story',
      maxLength: 500,
      guidance: `
Write an engaging but factual product story for the consumer-facing Digital
Product Passport.

You may use known information about:
- the product;
- its design;
- its materials;
- its intended use;
- its brand;
- its country of origin when explicitly supplied.

Use a warm and professional marketing tone without exaggeration.

Do not invent:
- the history of the product or brand;
- artisan production;
- ethical sourcing;
- environmental benefits;
- certifications;
- social impact;
- sustainability achievements;
- manufacturing locations;
- people or organisations involved.
      `.trim(),
    }),
  }),
});

/**
 * Normalises keys before looking them up in the allowlist.
 */
function normalizeKey(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';
}

/**
 * Returns the field definition or null when the field is not supported.
 */
function getSuggestionField(entity, field) {
  const normalizedEntity = normalizeKey(entity);
  const normalizedField = normalizeKey(field);

  return (
    SUGGESTION_FIELDS[normalizedEntity]?.[normalizedField] ||
    null
  );
}

/**
 * Returns the names of all supported fields for an entity.
 */
function listSuggestionFields(entity) {
  const normalizedEntity = normalizeKey(entity);

  return Object.keys(
    SUGGESTION_FIELDS[normalizedEntity] || {}
  );
}

/**
 * Indicates whether a particular field supports AI suggestions.
 */
function isSuggestionField(entity, field) {
  return Boolean(getSuggestionField(entity, field));
}

module.exports = {
  SUGGESTION_FIELDS,
  getSuggestionField,
  listSuggestionFields,
  isSuggestionField,
};