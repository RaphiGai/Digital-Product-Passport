using { dpp as db } from '../db/schema';

/**
 * DPPService — primary OData V4 service for company users.
 *
 * NOTE (May 2026): role-based @restrict clauses temporarily relaxed to
 * `authenticated-user` because BTP role-collection assignment is blocked on
 * the UCC learn-tenant and the CAP 9 middleware hooks don't reliably let us
 * resolve roles from the DB before @restrict evaluation. Once the UCC team
 * assigns the proper role collections (or we move to a sub-account where we
 * have admin rights), the previous restrict clauses come back. They are
 * preserved in git history.
 */
service DPPService @(
  path     : '/odata/v4/dpp',
  requires : 'authenticated-user'
) {

  type FileEnvelope : {
    filename       : String;
    content_base64 : LargeString;
  };

  type QRCodeImage : {
    png     : LargeString;
    payload : String;
  };

  type ImportError : {
    row     : Integer;
    field   : String;
    message : String;
  };

  type ImportReport : {
    total    : Integer;
    imported : Integer;
    rejected : Integer;
    errors   : array of ImportError;
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
    function exportDPPasPDF()                        returns FileEnvelope;
    function generateQRLabel()                       returns FileEnvelope;
  };

  entity QRCodes               as projection on db.QRCodes;

  // ---- Data import & export ----
  action importProducts(file : LargeString) returns ImportReport;
  action importBatches(file : LargeString)  returns ImportReport;
  action importBOM(file : LargeString)      returns ImportReport;

  function downloadTemplate(template : String) returns FileEnvelope;
  function exportProducts()                     returns FileEnvelope;
  function exportBOM()                          returns FileEnvelope;
  function exportDPP(dppId : String)            returns FileEnvelope;
  function exportDPPs(dppIds : String)          returns FileEnvelope;
  function exportTraceability()                 returns FileEnvelope;
}
