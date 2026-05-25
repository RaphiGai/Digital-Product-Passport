namespace dpp;

type CountryISO2 : String(2);
type GTIN        : String(14);
type GLN         : String(13);
type EmailAddr   : String(254);
type URL         : String(500);
type Sha256Hex   : String(64);

type ProductType : String(12) enum {
  finished;
  material;
  component;
}

type ProductStatus : String(12) enum {
  draft;
  approved;
  published;
  archived;
}

type BatchStatus : String(12) enum {
  draft;
  approved;
  archived;
}

type BOMStatus : String(12) enum {
  active;
  archived;
}

type ESPRComplianceStatus : String(16) enum {
  draft;
  in_review;
  compliant;
  non_compliant;
}

type DPPStatus : String(12) enum {
  draft;
  approved;
  published;
  archived;
}

type DPPType : String(12) enum {
  product;
  material;
}

type Visibility : String(8) enum {
  internal;
  public;
}

type Granularity : String(8) enum {
  model;
  batch;
  item;
}

type ItemStatus : String(12) enum {
  active;
  sold;
  repaired;
  recycled;
  disposed;
}

type QRCodeStatus : String(10) enum {
  active;
  invalid;
  replaced;
}

type UserRole : String(12) enum {
  admin;
  advanced;
  user;
  viewer;
  authority;
}

type BusinessPartnerRole : String(24) enum {
  supplier;
  manufacturer;
  recycler;
  certification_body;
  distributor;
  retailer;
  logistics_provider;
}

type ComplianceStandard : String(24) enum {
  ESPR;
  EU_Textile_Labelling;
  REACH;
  SCIP;
  CSDDD;
  CSRD;
  GOTS;
  OEKO_TEX;
  BLUESIGN;
  CRADLE_TO_CRADLE;
}

type DocumentType : String(20) enum {
  certificate;
  audit_report;
  test_report;
  declaration;
  safety_sheet;
  care_label;
  repair_manual;
}

type WarningSeverity : String(10) enum {
  info;
  warning;
  blocking;
}

type IssueStatus : String(10) enum {
  open;
  resolved;
  ignored;
}

// Generic string-id aspect (replacement for @sap/cds/common.cuid, which forces UUID).
// Allows human-readable IDs in sample data (e.g. `prod-001`) and accepts upstream
// systems' identifiers as-is.
aspect identified {
  key ID : String(36);
}
