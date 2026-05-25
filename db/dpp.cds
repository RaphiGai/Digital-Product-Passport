using {
  dpp.identified,
  dpp.DPPStatus,
  dpp.DPPType,
  dpp.Visibility,
  dpp.Granularity,
  dpp.QRCodeStatus,
  dpp.ComplianceStandard,
  dpp.DocumentType,
  dpp.URL,
  dpp.Sha256Hex
} from './common';
using { dpp.Products, dpp.ProductItems } from './product';
using { dpp.BusinessPartners } from './org';

namespace dpp;

// ----- Digital Product Passport -----
// Anchored at the ProductItem level for serialised products (Sprint-1 demo path),
// or at the Product level for model-/batch-level DPPs (US5.1).
entity DPPs : identified {
  product         : Association to Products     not null;
  item            : Association to ProductItems;
  granularity     : Granularity default 'item';
  dpp_type        : DPPType     default 'product';
  status          : DPPStatus   default 'draft';
  visibility      : Visibility  default 'internal';
  current_version : Integer     default 1;
  qr_token        : String(128);
  qr_payload_url  : URL;
  public_url      : URL;
  approved_at         : Timestamp;
  published_at        : Timestamp;
  archived_at         : Timestamp;
  valid_from          : Date;
  last_updated        : Timestamp;
  aggregated_snapshot : LargeString;  // JSON snapshot of latest published aggregation (Sheet 3 R85)

  versions     : Composition of many DPPVersions   on versions.dpp     = $self;
  qr_codes     : Composition of many QRCodes       on qr_codes.dpp     = $self;
  storytelling : Composition of many DPPStoryItems on storytelling.dpp = $self;
}

annotate DPPs with @assert.unique : { qrToken : [qr_token] };

// ----- Snapshot history (US5.9) -----
entity DPPVersions : identified {
  dpp           : Association to DPPs not null;
  version_no    : Integer  not null;
  snapshot      : LargeString;
  status        : DPPStatus;
  published_at  : Timestamp;
  published_by  : String(120);
  change_reason : String(500);
}

annotate DPPVersions with @assert.unique : { versionNo : [dpp, version_no] };

// ----- QR Code entity (1:1 active + history per DPP, Sheet 5 R9 + Sheet 2 R13) -----
// The currently-active QR Code is denormalised onto DPPs.qr_token for fast public-page
// resolution. Each row here is the history of every QR ever minted for that DPP.
entity QRCodes : identified {
  dpp          : Association to DPPs not null;
  qr_value     : URL;                          // encoded URL on the physical label
  qr_image_url : URL;                          // optional pointer to a rendered PNG
  status       : QRCodeStatus default 'active';
  created_at   : Timestamp;
  replaced_at  : Timestamp;
}

// ----- Storytelling / media content (US5.8) -----
entity DPPStoryItems : identified {
  dpp        : Association to DPPs not null;
  title      : String(200);
  body       : String(2000);
  media_url  : URL;
  media_type : String(20);   // 'video' | 'image' | 'link'
}

// ----- Compliance / Sustainability / Documents attached to Products (Epic 8/9) -----

entity Certifications : identified {
  product            : Association to Products not null;
  standard           : ComplianceStandard;
  certificate_number : String(80);
  issued_by          : Association to BusinessPartners;
  valid_from         : Date;
  valid_until        : Date;
  evidence_document  : Association to Documents;
}

entity SubstancesOfConcern : identified {
  product           : Association to Products not null;
  cas_number        : String(20);
  ec_number         : String(20);
  substance_name    : String(200) not null;
  concentration_pct : Decimal(7, 4);
  scip_reference    : String(80);
}

entity SustainabilityIndicators : identified {
  product                  : Association to Products not null;
  co2_footprint_kg         : Decimal(10, 3);
  water_usage_l            : Decimal(12, 2);
  energy_usage_kwh         : Decimal(12, 2);
  recycled_content_overall : Decimal(5, 2);
  durability_score         : Decimal(3, 1);
  repairability_score      : Decimal(3, 1);
}

entity Documents : identified {
  product       : Association to Products;
  document_type : DocumentType not null;
  title         : String(200)  not null;
  file_name     : String(200);
  mime_type     : String(80);
  size_bytes    : Integer64;
  sha256        : Sha256Hex;
  storage_url   : URL;
  content       : LargeBinary @Core.MediaType : mime_type;
  issuer        : String(120);
  issued_at     : Date;
}
