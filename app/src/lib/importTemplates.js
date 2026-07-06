import * as XLSX from 'xlsx';

// ── Template definitions ──────────────────────────────────────────────────
// Each template has:
//   columns  → [{header, hint, example}]  used by downloadTemplate()
//   fieldMap → {header → fieldName}       used by parseTemplateSheet()
//
// The generated .xlsx has 3 rows:
//   row 1 — headers  (keep this row intact)
//   row 2 — hints    (format guidance — skip when importing)
//   row 3+ — data    (fill from row 3 onwards)

const TEMPLATES = {
  products: {
    name: 'Products',
    filename: 'import-template-products',
    columns: [
      { header: 'Name *',                   hint: 'Text, required',                                                         example: 'Eco Classic Jacket' },
      { header: 'Brand *',                  hint: 'Text, required',                                                         example: 'GreenWear' },
      { header: 'Category *',               hint: 'Text, required',                                                         example: 'Outerwear' },
      { header: 'Type *',                   hint: 'finished | material | component | packaging',                            example: 'finished' },
      { header: 'Model',                    hint: 'Text (optional)',                                                        example: 'ECO-JKT-001' },
      { header: 'GTIN',                     hint: 'Barcode (optional)',                                                     example: '04012345678901' },
      { header: 'Status *',                 hint: 'draft | published | archived',                                          example: 'draft' },
      { header: 'Country of Origin *',      hint: 'ISO-2 code, e.g. DE, PT, CN',                                          example: 'DE' },
      { header: 'Description',              hint: 'Text (optional)',                                                        example: 'Sustainable jacket made with recycled fibres' },
      { header: 'Fibre Composition *',      hint: 'Text, required',                                                        example: '80% Recycled Polyester, 20% Organic Cotton' },
      { header: 'Care Instructions *',      hint: 'Text, required',                                                        example: 'Machine wash 30°C, do not bleach' },
      { header: 'Repair Instructions *',    hint: 'Text, required',                                                        example: 'Contact our repair service at repairs@example.com' },
      { header: 'Disposal Instructions *',  hint: 'Text, required',                                                        example: 'Recycle at designated textile collection points' },
      { header: 'Reuse Instructions',       hint: 'Text (optional)',                                                        example: 'Donate or resell via our take-back programme' },
      { header: 'Substances of Concern *',  hint: 'Text or "None"',                                                        example: 'None' },
      { header: 'ESPR Compliance *',        hint: 'draft | in_review | compliant | non_compliant',                         example: 'in_review' },
      { header: 'Durability Score',         hint: 'Number 0–10 (optional)',                                                example: '8' },
      { header: 'Repairability Score',      hint: 'Number 0–10 (optional)',                                                example: '7' },
      { header: 'Storytelling',             hint: 'Text (optional)',                                                        example: 'Crafted in Portugal using certified recycled materials.' },
      { header: 'Care Video URL',           hint: 'URL (optional)',                                                        example: '' },
      { header: 'Repair Video URL',         hint: 'URL (optional)',                                                        example: '' },
      { header: 'Disposal Video URL',       hint: 'URL (optional)',                                                        example: '' },
      { header: 'Reuse Video URL',          hint: 'URL (optional)',                                                        example: '' },
      { header: 'Care Products URL',        hint: 'Recommended-products shop link (optional)',                             example: '' },
      { header: 'Repair Products URL',      hint: 'Recommended-products shop link (optional)',                             example: '' },
      { header: 'Reuse Products URL',       hint: 'Recommended-products shop link (optional)',                             example: '' },
      { header: 'Disposal Products URL',    hint: 'Recommended-products shop link (optional)',                             example: '' },
    ],
    fieldMap: {
      'Name *':                  'name',
      'Brand *':                 'brand',
      'Category *':              'category',
      'Type *':                  'product_type',
      'Model':                   'model',
      'GTIN':                    'gtin',
      'Status *':                'status',
      'Country of Origin *':     'country_of_origin',
      'Description':             'description',
      'Fibre Composition *':     'fibre_composition',
      'Care Instructions *':     'care_instructions',
      'Repair Instructions *':   'repair_instructions',
      'Disposal Instructions *': 'disposal_instructions',
      'Reuse Instructions':      'reuse_instructions',
      'Substances of Concern *': 'substances_of_concern',
      'ESPR Compliance *':       'espr_compliance',
      'Durability Score':        'durability_score',
      'Repairability Score':     'repairability_score',
      'Storytelling':            'storytelling',
      'Care Video URL':          'care_video_url',
      'Repair Video URL':        'repair_video_url',
      'Disposal Video URL':      'disposal_video_url',
      'Reuse Video URL':         'reuse_video_url',
      'Care Products URL':       'care_products_url',
      'Repair Products URL':     'repair_products_url',
      'Reuse Products URL':      'reuse_products_url',
      'Disposal Products URL':   'disposal_products_url',
    },
    // Key columns shown in the import wizard preview table
    previewFields: ['name', 'brand', 'category', 'product_type', 'status'],
    previewHeaders: ['Name', 'Brand', 'Category', 'Type', 'Status'],
  },

  variants: {
    name: 'Variants',
    filename: 'import-template-variants',
    columns: [
      { header: 'Product Name *', hint: 'Must match an existing product name',   example: 'Eco Classic Jacket' },
      { header: 'SKU *',          hint: 'Unique identifier, required',           example: 'ECO-JKT-BLK-M' },
      { header: 'Color',          hint: 'Text (optional)',                       example: 'Black' },
      { header: 'Size',           hint: 'Text (optional)',                       example: 'M' },
      { header: 'GTIN',           hint: 'Barcode (optional)',                    example: '04012345678902' },
      { header: 'Weight (g)',     hint: 'Number in grams (optional)',            example: '450' },
      { header: 'Status *',       hint: 'active | inactive | archived',         example: 'active' },
    ],
    fieldMap: {
      'Product Name *': 'product_name',
      'SKU *':          'sku',
      'Color':          'color',
      'Size':           'size',
      'GTIN':           'gtin',
      'Weight (g)':     'weight_g',
      'Status *':       'status',
    },
    previewFields:  ['product_name', 'sku', 'color', 'size', 'status'],
    previewHeaders: ['Product', 'SKU', 'Color', 'Size', 'Status'],
  },

  batches: {
    name: 'Batches',
    filename: 'import-template-batches',
    columns: [
      { header: 'Product Name *',        hint: 'Must match an existing product name',                      example: 'Eco Classic Jacket' },
      { header: 'Variant SKU *',         hint: 'Must match an existing variant SKU',                       example: 'ECO-JKT-BLK-M' },
      { header: 'Batch Number *',        hint: 'Unique, max 40 characters',                               example: '2026-06-A' },
      { header: 'Production Date',       hint: 'YYYY-MM-DD (optional)',                                   example: '2026-06-01', type: 'date' },
      { header: 'Country of Origin',     hint: 'ISO-2 code, e.g. DE, PT, CN (optional)',                  example: 'PT' },
      { header: 'Production Stage',      hint: 'e.g. Cut & Sew (optional)',                               example: 'Cut & Sew' },
      { header: 'Factory Name',          hint: 'Business partner name (optional)',                        example: 'Textile Factory Lisboa' },
      { header: 'Supplier Name',         hint: 'Business partner name (optional)',                        example: 'EcoFabrics GmbH' },
      { header: 'CO2 Footprint (kg)',    hint: 'Decimal — own production emissions (optional)',           example: '2.45' },
      { header: 'Recycled Content (%)',  hint: 'Number 0–100, for materials/components only (optional)', example: '' },
      { header: 'Status *',             hint: 'draft | approved | archived',                             example: 'draft' },
    ],
    fieldMap: {
      'Product Name *':       'product_name',
      'Variant SKU *':        'variant_sku',
      'Batch Number *':       'batch_number',
      'Production Date':      'production_date',
      'Country of Origin':    'country_of_origin',
      'Production Stage':     'production_stage',
      'Factory Name':         'factory_name',
      'Supplier Name':        'supplier_name',
      'CO2 Footprint (kg)':   'co2_footprint_kg',
      'Recycled Content (%)': 'recycled_content_pct',
      'Status *':             'status',
    },
    previewFields:  ['product_name', 'variant_sku', 'batch_number', 'production_date', 'status'],
    previewHeaders: ['Product', 'Variant SKU', 'Batch Number', 'Production Date', 'Status'],
  },

  bom: {
    name: 'BOM',
    filename: 'import-template-bom',
    columns: [
      { header: 'Parent Product Name *',   hint: 'Product that owns this BOM',                                   example: 'Eco Classic Jacket' },
      { header: 'Parent Variant SKU *',    hint: 'Variant to which this BOM belongs',                            example: 'ECO-JKT-BLK-M' },
      { header: 'Component Product Name *', hint: 'Required. Exact product name (auto-linked) or free-text name for external parts.',                example: 'Recycled Polyester Fabric' },
      { header: 'External DPP URL',        hint: 'Required when component is external (name not in system). Must start with https://.',              example: 'https://supplier.example/dpp/abc' },
      { header: 'Component Role',          hint: 'Role in assembly (optional)',                                   example: 'Main fabric' },
      { header: 'Quantity *',              hint: 'Number greater than 0. Must be a whole number for pcs.',       example: '1.5' },
      { header: 'Unit *',                  hint: 'g | kg | pcs | %',                                            example: 'kg' },
      { header: 'ESPR Compliance',       hint: 'draft | in_review | compliant | non_compliant (optional, external only)',  example: 'in_review' },
      { header: 'CO2 Footprint (kg)',    hint: 'CO₂ override for external components (optional)',                           example: '' },
      { header: 'Recycled Content (%)',  hint: 'Recycled content override for external components (optional)',              example: '' },
    ],
    fieldMap: {
      'Parent Product Name *':       'parent_product_name',
      'Parent Variant SKU *':        'parent_variant_sku',
      'Component Product Name *':    'component_product_name',
      'Component Product Name':      'component_product_name', // backward compat
      'Component Name *':            'component_product_name', // backward compat
      'Component Name':              'component_product_name', // backward compat
      'External DPP URL':            'external_dpp_url',
      'Component Role':              'component_role',
      'Quantity *':                  'quantity',
      'Unit *':                      'unit',
      'ESPR Compliance':             'espr_compliance',
      'CO2 Footprint (kg)':          'co2_footprint_kg',
      'Recycled Content (%)':        'recycled_content_pct',
    },
    previewFields:  ['parent_product_name', 'parent_variant_sku', 'component_product_name', 'quantity', 'unit'],
    previewHeaders: ['Parent Product', 'Parent SKU', 'Component', 'Quantity', 'Unit'],
  },

  business_partners: {
    name: 'Business Partners',
    filename: 'import-template-business-partners',
    columns: [
      { header: 'Name *',              hint: 'Text, required',                                                                                                                example: 'GreenWear Supplier GmbH' },
      { header: 'Country *',           hint: 'ISO-2 code, e.g. DE, PT, CN',                                                                                                  example: 'DE' },
      { header: 'City',                hint: 'Text (optional)',                                                                                                               example: 'Berlin' },
      { header: 'Address',             hint: 'Text (optional)',                                                                                                               example: 'Hauptstraße 1, 10115 Berlin' },
      { header: 'Contact Person',      hint: 'Text (optional)',                                                                                                               example: 'Anna Schmidt' },
      { header: 'Contact Email',       hint: 'Email (optional)',                                                                                                              example: 'anna@supplier.de' },
      { header: 'External Identifier', hint: 'Your internal ID or EAN (optional)',                                                                                           example: 'SUP-0042' },
      { header: 'Roles *',             hint: 'Comma-separated: supplier | manufacturer | recycler | certification_body | distributor | retailer | logistics_provider', example: 'supplier,manufacturer' },
      { header: 'Status *',            hint: 'active | archived',                                                                                                            example: 'active' },
    ],
    fieldMap: {
      'Name *':              'name',
      'Country *':           'country_iso2',
      'City':                'city',
      'Address':             'address',
      'Contact Person':      'contact_person',
      'Contact Email':       'contact_email',
      'External Identifier': 'identifier',
      'Roles *':             'roles',
      'Status *':            'status',
    },
    previewFields:  ['name', 'country_iso2', 'city', 'roles', 'status'],
    previewHeaders: ['Name', 'Country', 'City', 'Roles', 'Status'],
  },
};

// ── Template download ─────────────────────────────────────────────────────

function autoWidthAoa(ws, rows) {
  const colCount = rows[0].length;
  const widths = Array.from({ length: colCount }, (_, ci) =>
    Math.min(Math.max(...rows.map((r) => String(r[ci] ?? '').length), 12) + 2, 80)
  );
  ws['!cols'] = widths.map((w) => ({ wch: w }));
}

/**
 * Pre-format a column's data cells (rows 3–202) as Text (@).
 * Uses real empty-string cells (t:'s') instead of stubs so xlsx actually writes
 * the format record into the file. Excel then stores whatever the user types as a
 * literal string and never auto-converts it to a date serial number.
 */
function applyTextColFormat(ws, colIdx) {
  const DATA_ROWS = 200;
  for (let r = 3; r <= 2 + DATA_ROWS; r++) {
    const addr = XLSX.utils.encode_cell({ r: r - 1, c: colIdx });
    if (!ws[addr]) ws[addr] = { t: 's', v: '', z: '@' };
    else ws[addr].z = '@';
  }
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  range.e.r = Math.max(range.e.r, 1 + DATA_ROWS);
  range.e.c = Math.max(range.e.c, colIdx);
  ws['!ref'] = XLSX.utils.encode_range(range);
}

export function downloadTemplate(key) {
  const tpl = TEMPLATES[key];
  if (!tpl) throw new Error(`Unknown template key: ${key}`);
  const headers = tpl.columns.map((c) => c.header);
  const hints   = tpl.columns.map((c) => c.hint);
  // Row 1 = headers, row 2 = format hints, row 3+ = your data
  const ws = XLSX.utils.aoa_to_sheet([headers, hints]);
  autoWidthAoa(ws, [headers, hints]);
  // Pre-format date columns as Text so Excel never auto-converts typed values.
  tpl.columns.forEach((col, i) => {
    if (col.type === 'date') applyTextColFormat(ws, i);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tpl.name);
  XLSX.writeFile(wb, `${tpl.filename}.xlsx`);
}

// ── Template parsing (for import wizard) ─────────────────────────────────

/**
 * Parse a worksheet that was generated by downloadTemplate(key) (or is in the
 * same format).  Row 0 = headers, row 1 = hints (always skipped), rows 2+ = data.
 *
 * Returns { rows, headers } where:
 *   rows    — array of {fieldName: value} objects, one per non-empty data row
 *   headers — [{header, fieldName}] for the preview table column list
 */
export function parseTemplateSheet(key, worksheet) {
  const tpl = TEMPLATES[key];
  if (!tpl) throw new Error(`Unknown template key: ${key}`);

  // raw:false returns the display string (w) for each cell rather than the raw value (v),
  // which prevents Excel date serials from reaching the import handler as numbers.
  const raw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });

  // Need at least a header row
  if (!raw.length) return { rows: [], headers: [] };

  const rawHeaders = raw[0].map((h) => String(h));

  // Build ordered list of recognised columns
  const headers = rawHeaders
    .map((h, idx) => ({ header: h, fieldName: tpl.fieldMap[h] ?? null, colIdx: idx }))
    .filter((c) => c.fieldName);

  // Data starts at row 2 (index 2): row 0 = headers, row 1 = hints (skip)
  const dataStart = raw.length >= 2 ? 2 : 1;
  const rows = raw
    .slice(dataStart)
    .filter((row) => row.some((cell) => String(cell).trim() !== ''))
    .map((row) => {
      const obj = {};
      for (const { fieldName, colIdx } of headers) {
        obj[fieldName] = String(row[colIdx] ?? '').trim();
      }
      return obj;
    });

  return { rows, headers };
}

/** Returns the preview column definition [{fieldName, label}] for a given type. */
export function getPreviewColumns(key) {
  const tpl = TEMPLATES[key];
  if (!tpl) return [];
  return tpl.previewFields.map((f, i) => ({ fieldName: f, label: tpl.previewHeaders[i] }));
}
