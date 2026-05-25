using { dpp as db } from '../db/schema';

/**
 * AuthorityService — cross-tenant read-only view for external users
 * (market-surveillance authorities, auditors, regulators).
 *
 * NOTE (May 2026): role gating temporarily relaxed to `authenticated-user`
 * for the same reason as DPPService. Re-enable `requires: 'end_user'` once
 * cockpit role assignments are available.
 */
service AuthorityService @(
  path     : '/odata/v4/authority',
  requires : 'authenticated-user'
) {
  @readonly entity Organizations         as projection on db.Organizations;
  @readonly entity BusinessPartners      as projection on db.BusinessPartners;
  @readonly entity Products              as projection on db.Products;
  @readonly entity ProductVariants       as projection on db.ProductVariants;
  @readonly entity Batches               as projection on db.Batches;
  @readonly entity ProductItems          as projection on db.ProductItems;
  @readonly entity ProductBOMs           as projection on db.ProductBOMs;
  @readonly entity DPPs                  as projection on db.DPPs;
  @readonly entity QRCodes               as projection on db.QRCodes;
}
