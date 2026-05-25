using { dpp as db } from '../db/schema';

/**
 * DPPService — primary OData V4 service for company users.
 *
 * Roles (from `dpp.UserRole`):
 *   - admin    : full CRUD on tenant data; user management.
 *   - advanced : full CRUD on products/DPPs/business partners (US3.x, US4.x, US5.x).
 *   - user     : READ tenant data + CREATE/UPDATE on ProductItems and DPPs (US3.8, US6.1).
 *   - viewer   : READ-only.
 *
 * Tenant isolation is enforced via `@restrict.where` clauses that walk back to
 * `owning_organization.tenant_id = $user.tenant`.
 */
service DPPService @(
  path     : '/odata/v4/dpp',
  requires : 'authenticated-user'
) {

  // ---- Organisation & users ----

  @restrict: [
    { grant: 'READ',   to: ['admin', 'advanced', 'user', 'viewer'], where: 'tenant_id = $user.tenant' },
    { grant: 'UPDATE', to: ['admin'],                                 where: 'tenant_id = $user.tenant' }
  ]
  entity Organizations as projection on db.Organizations;

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced'], where: 'organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin'],             where: 'organization.tenant_id = $user.tenant' }
  ]
  entity Users as projection on db.Users;

  // ---- Business partners ----

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'owning_organization.tenant_id = $user.tenant' }
  ]
  entity BusinessPartners as projection on db.BusinessPartners;

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'partner.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'partner.owning_organization.tenant_id = $user.tenant' }
  ]
  entity BusinessPartnerRoles as projection on db.BusinessPartnerRoles;

  // ---- Products & hierarchy ----

  @restrict: [
    { grant: 'READ', to: ['admin', 'advanced', 'user', 'viewer'], where: 'owning_organization.tenant_id = $user.tenant' },
    { grant: '*',    to: ['admin', 'advanced'],                    where: 'owning_organization.tenant_id = $user.tenant' }
  ]
  entity Products as projection on db.Products actions {
    @Common.SideEffects: { TargetProperties: ['status'] }
    action archiveProduct() returns Products;
  };

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'product.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'product.owning_organization.tenant_id = $user.tenant' }
  ]
  entity ProductVariants as projection on db.ProductVariants;

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'variant.product.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'variant.product.owning_organization.tenant_id = $user.tenant' }
  ]
  entity Batches as projection on db.Batches;

  @restrict: [
    { grant: 'READ',                                       to: ['admin', 'advanced', 'user', 'viewer'], where: 'batch.variant.product.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'],               to: ['admin', 'advanced', 'user'],            where: 'batch.variant.product.owning_organization.tenant_id = $user.tenant' }
  ]
  entity ProductItems as projection on db.ProductItems;

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'parent.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'parent.owning_organization.tenant_id = $user.tenant' }
  ]
  entity ProductBOMs as projection on db.ProductBOMs;

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'product.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'product.owning_organization.tenant_id = $user.tenant' }
  ]
  entity ProductBusinessPartners as projection on db.ProductBusinessPartners;

  // ---- Digital Product Passport ----

  @restrict: [
    { grant: 'READ',               to: ['admin', 'advanced', 'user', 'viewer'], where: 'product.owning_organization.tenant_id = $user.tenant' },
    { grant: '*',                  to: ['admin', 'advanced'],                    where: 'product.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE'], to: ['user'],                                 where: 'product.owning_organization.tenant_id = $user.tenant' }
  ]
  entity DPPs as projection on db.DPPs actions {
    @Common.SideEffects: { TargetProperties: ['status', 'approved_at', 'current_version'] }
    action   approveDPP()      returns DPPs;

    @Common.SideEffects: { TargetProperties: ['status', 'published_at', 'qr_token', 'qr_payload_url', 'public_url', 'current_version'] }
    action   publishDPP(change_reason : String(500)) returns DPPs;

    @Common.SideEffects: { TargetProperties: ['status', 'archived_at'] }
    action   archiveDPP()      returns DPPs;

    @Common.SideEffects: { TargetProperties: ['qr_token', 'qr_payload_url'] }
    action   regenerateQRToken() returns DPPs;

    function generateQRCode()  returns { png : LargeString; payload : String };
    function getValidationReport() returns array of {
      warning_code : String;
      severity     : String;
      field_name   : String;
      message      : String;
    };
  };

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'dpp.product.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'dpp.product.owning_organization.tenant_id = $user.tenant' }
  ]
  entity DPPVersions as projection on db.DPPVersions;

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'dpp.product.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'dpp.product.owning_organization.tenant_id = $user.tenant' }
  ]
  entity QRCodes as projection on db.QRCodes;

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'dpp.product.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'dpp.product.owning_organization.tenant_id = $user.tenant' }
  ]
  entity DPPStoryItems as projection on db.DPPStoryItems;

  // ---- Compliance / Sustainability / Documents ----

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'product.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'product.owning_organization.tenant_id = $user.tenant' }
  ]
  entity Certifications as projection on db.Certifications;

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'product.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'product.owning_organization.tenant_id = $user.tenant' }
  ]
  entity SubstancesOfConcern as projection on db.SubstancesOfConcern;

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'], where: 'product.owning_organization.tenant_id = $user.tenant' },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'],                   where: 'product.owning_organization.tenant_id = $user.tenant' }
  ]
  entity SustainabilityIndicators as projection on db.SustainabilityIndicators;

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'] },
    { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['admin', 'advanced'] }
  ]
  entity Documents as projection on db.Documents;

  // ---- Warnings & tracking (Epic 10) ----

  @restrict: [
    { grant: 'READ',                         to: ['admin', 'advanced', 'user', 'viewer'] },
    { grant: ['UPDATE'],                     to: ['admin', 'advanced'] }
  ]
  entity ValidationWarnings as projection on db.ValidationWarnings;
}
