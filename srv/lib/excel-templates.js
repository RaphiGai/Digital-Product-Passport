'use strict';

/**
 * Column metadata for Excel import/export templates.
 *
 * `required: true` fields are validated during import — missing values produce
 * blocking errors. `enumValues` triggers an enum-membership check.
 *
 * Templates double as the source-of-truth for the OpenAPI download endpoint:
 * `generateTemplate(name)` builds an XLSX buffer with the headers + a comment row.
 */

const PRODUCT_TEMPLATE = {
  entity: 'Products',
  columns: [
    { key: 'ID',                    label: 'ID',                    required: false },
    { key: 'product_type',          label: 'Product Type',          required: true, enumValues: ['finished', 'material', 'component'] },
    { key: 'name',                  label: 'Name',                  required: true },
    { key: 'brand',                 label: 'Brand',                 required: false },
    { key: 'category',              label: 'Category',              required: false },
    { key: 'model',                 label: 'Model',                 required: false },
    { key: 'description',           label: 'Description',           required: false },
    { key: 'gtin',                  label: 'GTIN',                  required: false },
    { key: 'fibre_composition',     label: 'Fibre Composition',     required: false },
    { key: 'care_instructions',     label: 'Care Instructions',     required: false },
    { key: 'repair_instructions',   label: 'Repair Instructions',   required: false },
    { key: 'disposal_instructions', label: 'Disposal Instructions', required: false },
    { key: 'country_of_origin',     label: 'Country of Origin',     required: false },
    { key: 'espr_compliance',       label: 'ESPR Compliance',       required: false, enumValues: ['draft', 'in_review', 'compliant', 'non_compliant'] },
    { key: 'status',                label: 'Status',                required: false, enumValues: ['draft', 'approved', 'published', 'archived'] }
  ]
};

const BATCH_TEMPLATE = {
  entity: 'Batches',
  columns: [
    { key: 'ID',                   label: 'ID',                   required: false },
    { key: 'variant_ID',           label: 'Variant ID',           required: true },
    { key: 'batch_number',         label: 'Batch Number',         required: true },
    { key: 'production_date',      label: 'Production Date',      required: false },
    { key: 'factory_ID',           label: 'Factory (BP ID)',      required: false },
    { key: 'supplier_ID',          label: 'Supplier (BP ID)',     required: false },
    { key: 'country_of_origin',    label: 'Country of Origin',    required: false },
    { key: 'production_stage',     label: 'Production Stage',     required: false },
    { key: 'co2_footprint_kg',     label: 'CO2 Footprint (kg)',   required: false },
    { key: 'recycled_content_pct', label: 'Recycled Content (%)', required: false },
    { key: 'status',               label: 'Status',               required: false, enumValues: ['draft', 'approved', 'archived'] }
  ]
};

const BOM_TEMPLATE = {
  entity: 'ProductBOMs',
  columns: [
    { key: 'ID',             label: 'ID',                    required: false },
    { key: 'parent_ID',      label: 'Parent Product ID',     required: true },
    { key: 'component_ID',   label: 'Component Product ID',  required: true },
    { key: 'quantity',       label: 'Quantity / Share',      required: true },
    { key: 'unit',           label: 'Unit',                  required: true, enumValues: ['%', 'kg', 'm', 'pcs'] },
    { key: 'component_role', label: 'Component Role',        required: false },
    { key: 'is_mandatory',   label: 'Mandatory (true/false)', required: false },
    { key: 'linked_dpp_ID',  label: 'Linked Material DPP ID', required: false },
    { key: 'status',         label: 'Status',                required: false, enumValues: ['active', 'archived'] }
  ]
};

const TEMPLATES = {
  products: PRODUCT_TEMPLATE,
  batches: BATCH_TEMPLATE,
  bom: BOM_TEMPLATE
};

/**
 * Build an XLSX buffer with one header row (labels) + one comment row that
 * shows allowed enum values / required marker.
 */
function buildTemplateBuffer(name) {
  const xlsx = require('xlsx');
  const tpl = TEMPLATES[name];
  if (!tpl) throw new Error(`Unknown import template '${name}'.`);
  const headers = tpl.columns.map((c) => c.label);
  const hints = tpl.columns.map((c) => {
    const parts = [];
    if (c.required) parts.push('required');
    if (c.enumValues) parts.push(`one of: ${c.enumValues.join(' | ')}`);
    return parts.join(' — ');
  });
  const sheet = xlsx.utils.aoa_to_sheet([headers, hints]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, sheet, tpl.entity);
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Parse a base64-encoded XLSX file into an array of plain objects, keyed by
 * the template's column `key`. Empty rows are dropped.
 */
function parseImportBuffer(base64, templateName) {
  const xlsx = require('xlsx');
  const tpl = TEMPLATES[templateName];
  if (!tpl) throw new Error(`Unknown import template '${templateName}'.`);
  const buf = Buffer.from(base64, 'base64');
  const wb = xlsx.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const raw = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null, raw: false });

  // Map labels back to keys, since users typically work from the labelled template.
  const labelToKey = Object.fromEntries(tpl.columns.map((c) => [c.label, c.key]));
  const out = [];
  for (const row of raw) {
    // Skip the hint row if it accidentally got picked up (heuristic: first column starts with "required").
    const firstVal = Object.values(row)[0];
    if (typeof firstVal === 'string' && /^(required|one of)/.test(firstVal)) continue;

    const mapped = {};
    let hasAny = false;
    for (const [k, v] of Object.entries(row)) {
      const target = labelToKey[k] || k;
      if (v !== null && v !== undefined && v !== '') hasAny = true;
      mapped[target] = v === '' ? null : v;
    }
    if (hasAny) out.push(mapped);
  }
  return out;
}

/**
 * Validate a parsed row set against template column rules. Returns the
 * accepted entries plus a list of per-row issues — callers decide whether
 * to reject the whole batch or import the survivors.
 */
function validateRows(rows, templateName) {
  const tpl = TEMPLATES[templateName];
  const errors = [];
  const accepted = [];

  rows.forEach((row, idx) => {
    const rowNo = idx + 2;  // 1-based, plus header row offset
    const issues = [];
    for (const col of tpl.columns) {
      const val = row[col.key];
      if (col.required && (val === null || val === undefined || val === '')) {
        issues.push({ row: rowNo, field: col.key, message: `'${col.label}' is required.` });
        continue;
      }
      if (val != null && col.enumValues && !col.enumValues.includes(String(val))) {
        issues.push({
          row: rowNo,
          field: col.key,
          message: `'${col.label}' = '${val}' is not one of: ${col.enumValues.join(', ')}.`
        });
      }
    }
    if (issues.length) errors.push(...issues);
    else accepted.push(row);
  });

  return { accepted, errors };
}

module.exports = { TEMPLATES, buildTemplateBuffer, parseImportBuffer, validateRows };
