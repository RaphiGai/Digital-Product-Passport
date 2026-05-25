using { dpp as db } from '../db/schema';

/**
 * AuthorityService — cross-tenant read-only view for market-surveillance authorities.
 *
 * Holders of the `authority` scope carry no `tenant` attribute, so no tenant
 * `where` clause is applied: an authority can see every DPP in every organisation.
 * Document binary content is excluded; large media is retrievable via a separate
 * signed-URL endpoint (TBD).
 */
service AuthorityService @(
  path     : '/odata/v4/authority',
  requires : 'authority'
) {
  @readonly entity Organizations            as projection on db.Organizations;
  @readonly entity Users                    as projection on db.Users;
  @readonly entity BusinessPartners         as projection on db.BusinessPartners;
  @readonly entity BusinessPartnerRoles     as projection on db.BusinessPartnerRoles;
  @readonly entity Products                 as projection on db.Products;
  @readonly entity ProductVariants          as projection on db.ProductVariants;
  @readonly entity Batches                  as projection on db.Batches;
  @readonly entity ProductItems             as projection on db.ProductItems;
  @readonly entity ProductBOMs              as projection on db.ProductBOMs;
  @readonly entity ProductBusinessPartners  as projection on db.ProductBusinessPartners;
  @readonly entity DPPs                     as projection on db.DPPs;
  @readonly entity DPPVersions              as projection on db.DPPVersions;
  @readonly entity QRCodes                  as projection on db.QRCodes;
  @readonly entity DPPStoryItems            as projection on db.DPPStoryItems;
  @readonly entity Certifications           as projection on db.Certifications;
  @readonly entity SubstancesOfConcern      as projection on db.SubstancesOfConcern;
  @readonly entity SustainabilityIndicators as projection on db.SustainabilityIndicators;
  @readonly entity Documents                as projection on db.Documents excluding { content };
  @readonly entity ValidationWarnings       as projection on db.ValidationWarnings;
}
