using { dpp as db } from '../db/schema';

/**
 * DPPService — primary OData V4 service for company users.
 *
 * NOTE (May 2026): Authorization is enforced programmatically in the service
 * handlers (`srv/dpp-service.js` + `srv/handlers/auth-helpers.js`), NOT via
 * `@restrict`. The service-level `requires: 'authenticated-user'` is only the
 * "logged-in yes/no" gate; the actual app role (`company_advanced` /
 * `company_user`) and the tenant scoping are resolved from the DB Users table
 * and applied in `srv.before(*)` handlers. This sidesteps a CAP 9 middleware-
 * timing issue where app-resolved roles arrived too late for `@restrict`.
 */
service DPPService @(
  path     : '/odata/v4/dpp',
  requires : 'authenticated-user'
) {

  type QRCodeImage : {
    png     : LargeString;
    payload : String;
  };

  type MeInfo : {
    id             : String;
    displayName    : String;
    email          : String;
    role           : String;
    organizationId : String;
    tenantId       : String;
  };

  // Live-aggregated footprint for the pre-publication review (computed by srv/lib/aggregator).
  type AggregatedFootprint : {
    co2_footprint_kg      : Decimal(14, 6);
    recycled_content_pct  : Decimal(14, 6);
    incomplete            : Boolean;
    missing               : LargeString;   // JSON array of unresolved component edges
    breakdown             : LargeString;   // JSON: { own_co2_kg, components:[{name,co2_kg,recycled_pct,mass_kg,...}] }
  };

  entity Organizations         as projection on db.Organizations;
  entity Users                 as projection on db.Users;
  entity BusinessPartners      as projection on db.BusinessPartners;
  entity BusinessPartnerRoles  as projection on db.BusinessPartnerRoles;

  entity Products as projection on db.Products actions {
    @Common.SideEffects: { TargetProperties: ['status'] }
    action archiveProduct() returns Products;
  };

  entity ProductVariants       as projection on db.ProductVariants;
  entity Batches               as projection on db.Batches;
  entity ProductItems          as projection on db.ProductItems;
  entity ProductBOMs           as projection on db.ProductBOMs;
  entity BatchComponents       as projection on db.BatchComponents;

  entity DPPs as projection on db.DPPs actions {
    @Common.SideEffects: { TargetProperties: ['status', 'approved_at'] }
    action   approveDPP()                            returns DPPs;

    @Common.SideEffects: { TargetProperties: ['status', 'published_at', 'qr_token', 'qr_payload_url', 'public_url', 'current_version'] }
    action   publishDPP(change_reason : String(500)) returns DPPs;

    @Common.SideEffects: { TargetProperties: ['status', 'archived_at'] }
    action   archiveDPP()                            returns DPPs;

    @Common.SideEffects: { TargetProperties: ['qr_token', 'qr_payload_url'] }
    action   regenerateQRToken()                     returns DPPs;

    function generateQRCode()                        returns QRCodeImage;

    // Live aggregation across the BOM tree for review before publishing.
    function aggregatedFootprint()                   returns AggregatedFootprint;
  };

  entity QRCodes               as projection on db.QRCodes;
  entity DPPMarketingLinks     as projection on db.DPPMarketingLinks;

  function me() returns MeInfo;
}
