using {
  dpp.identified,
  dpp.CountryISO2,
  dpp.GTIN,
  dpp.ProductType,
  dpp.ProductStatus,
  dpp.BatchStatus,
  dpp.BOMStatus,
  dpp.ItemStatus,
  dpp.ESPRComplianceStatus,
  dpp.BusinessPartnerRole
} from './common';
using { dpp.Organizations, dpp.BusinessPartners } from './org';
using { dpp.DPPs } from './dpp';

namespace dpp;

// ----- Product master data (model level) -----
// Generic product entity: can represent a finished product, a material, or a component.
entity Products : identified {
  owning_organization   : Association to Organizations not null;
  product_type          : ProductType  not null default 'finished';
  name                  : String(120)  not null;
  brand                 : String(120);
  category              : String(60);
  model                 : String(120);
  description           : String(500);
  gtin                  : GTIN;
  fibre_composition     : String(500);
  care_instructions     : String(500);
  repair_instructions   : String(500);
  disposal_instructions : String(500);
  country_of_origin     : CountryISO2;
  espr_compliance       : ESPRComplianceStatus default 'draft';
  status                : ProductStatus        default 'draft';
  archived              : Boolean              default false;

  variants       : Association to many ProductVariants     on variants.product       = $self;
  bom            : Composition of many ProductBOMs         on bom.parent             = $self;
  partners       : Composition of many ProductBusinessPartners on partners.product   = $self;
}

annotate Products with @assert.unique : { gtin_per_org : [gtin, owning_organization] };

// ----- Variant level (color, size, SKU) -----
entity ProductVariants : identified {
  product  : Association to Products not null;
  color    : String(40);
  size     : String(20);
  sku      : String(40);
  gtin     : GTIN;
  weight_g : Integer;
  status   : ProductStatus default 'draft';

  batches  : Association to many Batches on batches.variant = $self;
}

annotate ProductVariants with @assert.unique : { sku_per_product : [sku, product] };

// ----- Batch level (production batch) -----
entity Batches : identified {
  variant              : Association to ProductVariants not null;
  batch_number         : String(40);
  production_date      : Date;
  factory              : Association to BusinessPartners;
  supplier             : Association to BusinessPartners;
  country_of_origin    : CountryISO2;
  production_stage     : String(60);
  co2_footprint_kg     : Decimal(10, 3);
  recycled_content_pct : Decimal(5, 2);
  status               : BatchStatus default 'draft';

  items : Association to many ProductItems on items.batch = $self;
}

annotate Batches with @assert.unique : { batch_per_variant : [batch_number, variant] };

// ----- Item level (uniquely identifiable physical product) -----
entity ProductItems : identified {
  batch         : Association to Batches not null;
  serial_number : String(40);
  upi           : String(60);  // Unique Product Identity (US6.4)
  item_status   : ItemStatus default 'active';
  created_date  : Date;
  dpp           : Association to DPPs;  // populated when a DPP is generated for this item
}

annotate ProductItems with @assert.unique : {
  upi_global   : [upi],
  serial_batch : [serial_number, batch]
};

// ----- Bill of Materials: product composition (US4.x) -----
// One row says: `parent` product is composed of `quantity` `unit` of `component` product.
entity ProductBOMs : identified {
  parent         : Association to Products not null;
  component      : Association to Products not null;
  quantity       : Decimal(10, 3);
  unit           : String(8);     // '%', 'kg', 'm'
  component_role : String(60);    // 'Main fabric', 'Lining', ...
  is_mandatory   : Boolean default true;
  linked_dpp     : Association to DPPs;   // optional reference to material DPP (US4.9)
  status         : BOMStatus default 'active';
}

annotate ProductBOMs with @assert.unique : { edge : [parent, component] };

// ----- Product ↔ BusinessPartner link with role (US2.4/2.5) -----
entity ProductBusinessPartners : identified {
  product : Association to Products         not null;
  partner : Association to BusinessPartners not null;
  role    : BusinessPartnerRole             not null;
}

annotate ProductBusinessPartners with @assert.unique : { triplet : [product, partner, role] };
