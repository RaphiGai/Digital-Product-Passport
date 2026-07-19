using {
  dpp.identified,
  dpp.DPPStatus,
  dpp.DPPType,
  dpp.Visibility,
  dpp.QRCodeStatus,
  dpp.MarketingLinkType,
  dpp.MarketingMediaType,
  dpp.MarketingPlacement,
  dpp.URL
} from './common';
using { dpp.Products, dpp.ProductVariants, dpp.Batches, dpp.ProductItems } from './product';
using { dpp.audited, dpp.Organizations, dpp.Users } from './org';

namespace dpp;

// ----- Digital Product Passport (catalogue Sheet 2 R11) -----
// A DPP always represents a finished product from the perspective of its
// producer. The optional `batch` link narrows the DPP to a concrete production
// batch; otherwise the DPP describes the product on a model/variant level.
entity DPPs : identified, audited {
  product             : Association to Products not null;
  batch               : Association to Batches;
  variant             : Association to ProductVariants;  // which variant this DPP represents
  item                : Association to ProductItems;     // 1:1 for serialized item-level DPPs
  dpp_type            : DPPType     default 'product';
  status              : DPPStatus   default 'draft';
  visibility          : Visibility  default 'internal';
  current_version     : Integer     default 1;
  qr_token            : String(256);   // structured, signed token (see srv/lib/token.js)
  qr_payload_url      : URL;
  public_url          : URL;
  approved_at         : Timestamp;
  published_at        : Timestamp;
  archived_at         : Timestamp;
  valid_from          : Date;
  last_updated        : Timestamp;
  // Frozen internal state (buildSnapshot JSON) of the last APPROVED/PUBLISHED moment.
  // Written on approve AND publish; anchored at startup for legacy/seed DPPs. Serves as
  // the baseline for the "unapproved changes" field markers on the internal DPP view.
  aggregated_snapshot : LargeString;
  storytelling        : LargeString;  // optional JSON array of {title, body, media_url, media_type}
  // Normalized content hash of the last APPROVED/PUBLISHED state (drift anchor). When
  // the current data hashes differently, the DPP has unapproved changes and is reverted
  // to 'draft'. Set on approve AND publish; see srv/lib/snapshot-hash.js + dpp-handlers.js.
  baseline_content_hash : String(64);

  qr_codes        : Composition of many QRCodes           on qr_codes.dpp        = $self;
  marketing_links : Association  to many DPPMarketingLinks on marketing_links.dpp = $self;
}

annotate DPPs with @assert.unique : {
  qrToken     : [qr_token],
  dpp_per_item : [item]   // exactly one DPP per serialized item
};

// ----- QR Code (catalogue Sheet 2 R13) — 1:1 active + history per DPP -----
entity QRCodes : identified {
  dpp          : Association to DPPs not null;
  qr_value     : URL;                          // encoded URL on the physical label
  qr_image_url : URL;                          // optional pointer to a rendered PNG
  status       : QRCodeStatus default 'active';
  created_at   : Timestamp;
  replaced_at  : Timestamp;
}

// ----- Marketing / advertising links shown on the public DPP view -----
// Either attached to a specific DPP (item- or product-level ad, e.g. a care
// product) or org-wide when `dpp` is null (e.g. a "Summer sale" campaign shown
// across all the organisation's published DPPs). Surfaced by srv/handlers/
// public-handler.js, filtered by is_active + the valid_from/valid_to window.
entity DPPMarketingLinks : identified, audited {
  owning_organization : Association to Organizations not null;  // tenant scope
  dpp                 : Association to DPPs;                     // optional; null = all org DPPs
  link_type           : MarketingLinkType default 'advertisement';
  title               : String(200) not null;
  subtitle            : String(300);                          // optional CTA / teaser line shown under the title
  url                 : URL;
  media_type          : MarketingMediaType default 'image';   // image tile or video tile (play overlay)
  placement           : MarketingPlacement default 'discover_more'; // inline vs left/right side rail
  image_url           : URL;                                  // external thumbnail
  image_data          : LargeString;                          // uploaded thumbnail as a base64 data URL (preferred over image_url)
  display_order       : Integer default 0;
  is_active           : Boolean default true;
  valid_from          : Date;
  valid_to            : Date;
}

// ----- DPP version history (US5.9) -----
// One immutable record per publish PLUS one per re-approval: publish rows freeze the
// state being made live; approve rows preserve the PREVIOUSLY approved state that is
// being superseded. Approve rows carry NO consumer_snapshot and are never served to
// the public (public-handler picks the latest row WITH a consumer_snapshot). Persisted
// by srv/handlers/dpp-handlers.js (publishDPP/approveDPP); exposed READ-ONLY (writes
// are rejected). Tenant anchor: dpp.product.owning_organization_ID.
entity DPPVersions : identified {
  dpp            : Association to DPPs not null;
  version_number : Integer not null;
  snapshot_date  : Timestamp;
  change_reason  : String(500);
  changed_by     : Association to Users;
  source         : String(10) default 'publish';  // 'publish' | 'approve' (superseded-state snapshot)
  snapshot_data  : LargeString;   // fully-resolved internal state (buildSnapshot JSON) — version viewer
  consumer_snapshot : LargeString; // frozen consumer DTO served to the public until the next publish (publish rows only)
  content_hash   : String(64);    // normalized content hash (volatile/audit fields excluded) — drift anchor
}
