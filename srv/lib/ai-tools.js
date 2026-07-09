'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('dpp/ai');
const { evaluateDppChecks, loadDppValidationContext } = require('./dpp-validation');
const { MANDATORY } = require('./mandatory-fields');

/**
 * Tool catalogue for the DPP Assistant.
 *
 * Two kinds of tools:
 *  - READ tools: tenant-scoped queries the model uses to ground its answers.
 *  - PROPOSE tools: run the existing importXxx handlers in dryRun mode to VALIDATE
 *    a draft record WITHOUT writing anything. The normalized result is both fed
 *    back to the model and surfaced to the UI as an editable proposal card.
 *
 * Safety: nothing here mutates data. Real writes happen later, frontend-driven,
 * through the existing guarded flows (importXxx dryRun:false / odataCreate /
 * approveDPP / publishDPP), each requiring an explicit user click. Every tool is
 * scoped to the caller's organization; a cross-tenant id resolves to "not found".
 */

// Tenant anchor paths (subset of dpp-service.js TENANT_ANCHORS) for ownership checks.
const OWNER_PATH = {
  Products: 'owning_organization_ID',
  ProductVariants: 'product.owning_organization_ID',
  Batches: 'variant.product.owning_organization_ID',
  ProductBOMs: 'parent.product.owning_organization_ID',
  DPPs: 'product.owning_organization_ID',
};

/** Resolve the owning org of an entity instance, or undefined if it does not exist. */
async function ownerOrgOf(entityName, id) {
  const entity = cds.entities('dpp')[entityName];
  const path = OWNER_PATH[entityName];
  if (!entity || !path || id == null) return undefined;
  const row = await SELECT.one.from(entity).columns(`${path} as o`).where({ ID: id });
  return row ? row.o : undefined;
}

// ── Tool declarations (Gemini function-declaration schema; OpenAPI subset) ──

const READ_TOOLS = [
  {
    name: 'listProducts',
    description: "List the caller's products, optionally filtered by a name fragment or status.",
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Optional case-insensitive name fragment.' },
        status: { type: 'STRING', description: "Optional status filter: 'draft', 'published' or 'archived'." },
        limit: { type: 'INTEGER', description: 'Max results (default 25).' },
      },
    },
  },
  {
    name: 'getProduct',
    description: 'Get one product with its variants summary.',
    parameters: {
      type: 'OBJECT',
      properties: { productId: { type: 'STRING' } },
      required: ['productId'],
    },
  },
  {
    name: 'getVariant',
    description: 'Get one product variant with its batches and BOM summary.',
    parameters: {
      type: 'OBJECT',
      properties: { variantId: { type: 'STRING' } },
      required: ['variantId'],
    },
  },
  {
    name: 'getBatch',
    description: 'Get one production batch.',
    parameters: {
      type: 'OBJECT',
      properties: { batchId: { type: 'STRING' } },
      required: ['batchId'],
    },
  },
  {
    name: 'getBom',
    description: 'Get the bill of materials (component list) of a variant.',
    parameters: {
      type: 'OBJECT',
      properties: { variantId: { type: 'STRING' } },
      required: ['variantId'],
    },
  },
  {
    name: 'listCategories',
    description: 'List the available product categories (code list) to pick a valid category.',
    // No parameters: Gemini rejects an OBJECT with empty `properties`, so omit it entirely.
  },
  {
    name: 'getMandatoryFields',
    description: "List the mandatory fields for a 'product' or 'batch' (needed for DPP approval).",
    parameters: {
      type: 'OBJECT',
      properties: { entity: { type: 'STRING', description: "'product' or 'batch'." } },
    },
  },
  {
    name: 'getValidationStatus',
    description:
      'Check DPP readiness: what mandatory items still block approve/publish. Optionally scope to one product or one DPP.',
    parameters: {
      type: 'OBJECT',
      properties: {
        productId: { type: 'STRING', description: 'Optional: only DPPs of this product.' },
        dppId: { type: 'STRING', description: 'Optional: only this DPP.' },
      },
    },
  },
  {
    name: 'offerLifecycleAction',
    description:
      'Offer the user a one-click Approve or Publish button for a DPP, AFTER confirming readiness with getValidationStatus. Only call when the user wants to approve/publish and you have the DPP id. If the DPP is not ready, explain what is missing instead.',
    parameters: {
      type: 'OBJECT',
      properties: {
        dppId: { type: 'STRING' },
        action: { type: 'STRING', description: "'approve' or 'publish'." },
      },
      required: ['dppId', 'action'],
    },
  },
];

const PROPOSE_TOOLS = [
  {
    name: 'proposeProduct',
    description:
      'Validate a draft PRODUCT (no data is written). Provide the known fields; missing/invalid fields are reported so you can ask the user for them.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        brand: { type: 'STRING' },
        category: { type: 'STRING', description: 'Category code or label (see listCategories).' },
        product_type: { type: 'STRING', description: "'finished', 'material', 'component' or 'packaging'." },
        country_of_origin: { type: 'STRING', description: 'ISO-2 country code, e.g. DE.' },
        fibre_composition: { type: 'STRING' },
        care_instructions: { type: 'STRING' },
        repair_instructions: { type: 'STRING' },
        disposal_instructions: { type: 'STRING' },
        substances_of_concern: { type: 'STRING' },
        espr_compliance: {
          type: 'STRING',
          description: "'draft', 'in_review', 'compliant' or 'non_compliant'. Must be 'compliant' to publish.",
        },
        description: { type: 'STRING' },
        gtin: { type: 'STRING' },
        durability_score: { type: 'NUMBER', description: '0–10.' },
        repairability_score: { type: 'NUMBER', description: '0–10.' },
      },
      required: ['name', 'brand', 'product_type'],
    },
  },
  {
    name: 'proposeVariant',
    description: 'Validate a draft VARIANT for an existing product (no data is written).',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_name: { type: 'STRING', description: 'Exact name of an existing product.' },
        sku: { type: 'STRING' },
        color: { type: 'STRING' },
        size: { type: 'STRING' },
        gtin: { type: 'STRING' },
        weight_g: { type: 'NUMBER', description: 'Weight in grams (> 0).' },
      },
      required: ['product_name', 'sku'],
    },
  },
  {
    name: 'proposeBatch',
    description: 'Validate a draft production BATCH for an existing product+variant (no data is written).',
    parameters: {
      type: 'OBJECT',
      properties: {
        product_name: { type: 'STRING' },
        variant_sku: { type: 'STRING' },
        batch_number: { type: 'STRING' },
        production_date: { type: 'STRING', description: 'YYYY-MM-DD.' },
        country_of_origin: { type: 'STRING', description: 'ISO-2 country code.' },
        co2_footprint_kg: { type: 'NUMBER' },
        recycled_content_pct: { type: 'NUMBER', description: '0–100.' },
        factory_name: { type: 'STRING', description: 'Name of an existing business partner (optional).' },
        supplier_name: { type: 'STRING', description: 'Name of an existing business partner (optional).' },
      },
      required: ['product_name', 'variant_sku', 'batch_number'],
    },
  },
  {
    name: 'proposeBom',
    description: 'Validate one or more BOM component rows for an existing variant (no data is written).',
    parameters: {
      type: 'OBJECT',
      properties: {
        rows: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              parent_product_name: { type: 'STRING' },
              parent_variant_sku: { type: 'STRING' },
              component_product_name: { type: 'STRING' },
              quantity: { type: 'NUMBER' },
              unit: { type: 'STRING', description: 'One of: g, kg, pcs, %.' },
              component_role: { type: 'STRING' },
              external_dpp_url: { type: 'STRING', description: 'Required only for external components.' },
            },
            required: ['parent_product_name', 'parent_variant_sku', 'component_product_name', 'quantity', 'unit'],
          },
        },
      },
      required: ['rows'],
    },
  },
];

/**
 * Function declarations offered to the model. company_user (read-only) still gets
 * the propose tools (they only validate, never write) so the assistant can help
 * draft; the frontend hides the commit button for them.
 */
function toolDeclarations(/* role */) {
  return [...READ_TOOLS, ...PROPOSE_TOOLS];
}

const PROPOSE_NAMES = new Set(PROPOSE_TOOLS.map((t) => t.name));

// ── Executors ───────────────────────────────────────────────────────────────

/** Run an importXxx handler in dryRun mode under the caller's identity. */
async function dryRunImport(ctx, event, rows) {
  const dryReq = Object.assign(Object.create(ctx.req), {
    event,
    data: { rows: JSON.stringify(rows), dryRun: true },
  });
  const result = await ctx.srv.dispatch(dryReq);
  let errors = [];
  try {
    errors = JSON.parse(result.errors || '[]');
  } catch {
    /* ignore */
  }
  return { valid: result.skipped === 0, total: result.total, skipped: result.skipped, errors };
}

async function scopedProductIds(orgId) {
  const { Products } = cds.entities('dpp');
  const rows = await SELECT.from(Products).columns('ID', 'name').where({ owning_organization_ID: orgId });
  return rows;
}

const readExecutors = {
  async listProducts(args, ctx) {
    const { Products } = cds.entities('dpp');
    let q = SELECT.from(Products)
      .columns('ID', 'name', 'brand', 'product_type', 'status', 'category_code')
      .where({ owning_organization_ID: ctx.orgId })
      .limit(Math.min(Number(args.limit) || 25, 50));
    const rows = await q;
    let out = rows;
    if (args.query) {
      const f = String(args.query).toLowerCase();
      out = out.filter((p) => (p.name || '').toLowerCase().includes(f));
    }
    if (args.status) out = out.filter((p) => p.status === args.status);
    return { products: out };
  },

  async getProduct(args, ctx) {
    if ((await ownerOrgOf('Products', args.productId)) !== ctx.orgId) return { error: 'Product not found.' };
    const { Products, ProductVariants } = cds.entities('dpp');
    const product = await SELECT.one.from(Products).where({ ID: args.productId });
    const variants = await SELECT.from(ProductVariants)
      .columns('ID', 'sku', 'color', 'size', 'status')
      .where({ product_ID: args.productId });
    return { product, variants };
  },

  async getVariant(args, ctx) {
    if ((await ownerOrgOf('ProductVariants', args.variantId)) !== ctx.orgId) return { error: 'Variant not found.' };
    const { ProductVariants, Batches, ProductBOMs } = cds.entities('dpp');
    const variant = await SELECT.one.from(ProductVariants).where({ ID: args.variantId });
    const batches = await SELECT.from(Batches)
      .columns('ID', 'batch_number', 'status', 'production_date')
      .where({ variant_ID: args.variantId });
    const bom = await SELECT.from(ProductBOMs)
      .columns('ID', 'component_name', 'component_ID', 'quantity', 'unit')
      .where({ parent_ID: args.variantId });
    return { variant, batches, bom };
  },

  async getBatch(args, ctx) {
    if ((await ownerOrgOf('Batches', args.batchId)) !== ctx.orgId) return { error: 'Batch not found.' };
    const { Batches } = cds.entities('dpp');
    return { batch: await SELECT.one.from(Batches).where({ ID: args.batchId }) };
  },

  async getBom(args, ctx) {
    if ((await ownerOrgOf('ProductVariants', args.variantId)) !== ctx.orgId) return { error: 'Variant not found.' };
    const { ProductBOMs } = cds.entities('dpp');
    const bom = await SELECT.from(ProductBOMs)
      .columns('ID', 'component_name', 'component_ID', 'quantity', 'unit', 'component_role', 'external_dpp_url')
      .where({ parent_ID: args.variantId });
    return { bom };
  },

  async listCategories() {
    const rows = await SELECT.from('dpp.ProductCategories');
    return {
      categories: rows.map((c) => ({ code: c.code, label: c.name || c.descr || c.text || c.code })),
    };
  },

  async getMandatoryFields(args) {
    const entity = args.entity === 'batch' ? 'batch' : 'product';
    return { entity, fields: MANDATORY[entity] };
  },

  async offerLifecycleAction(args, ctx) {
    const action = args.action === 'publish' ? 'publish' : 'approve';
    if ((await ownerOrgOf('DPPs', args.dppId)) !== ctx.orgId) return { error: 'DPP not found.' };
    if (ctx.role !== 'company_advanced') {
      return { dppId: args.dppId, action, ready: false, reason: 'Your account is read-only; ask a full editor to perform this.' };
    }
    const { DPPs } = cds.entities('dpp');
    const dpp = await SELECT.one.from(DPPs).where({ ID: args.dppId });
    const ev = evaluateDppChecks(await loadDppValidationContext(dpp));
    return { dppId: dpp.ID, action, ready: ev.can_approve, blocking: ev.gate_errors, status: dpp.status };
  },

  async getValidationStatus(args, ctx) {
    const { DPPs } = cds.entities('dpp');
    const products = await scopedProductIds(ctx.orgId);
    if (!products.length) return { dpps: [] };
    const nameById = Object.fromEntries(products.map((p) => [p.ID, p.name]));
    const prodIds = products.map((p) => p.ID);

    let dpps;
    if (args.dppId) {
      dpps = await SELECT.from(DPPs).where({ ID: args.dppId, product_ID: { in: prodIds } });
    } else if (args.productId) {
      if (!prodIds.includes(args.productId)) return { error: 'Product not found.' };
      dpps = await SELECT.from(DPPs).where({ product_ID: args.productId });
    } else {
      dpps = await SELECT.from(DPPs).where({ product_ID: { in: prodIds } }).limit(25);
    }

    const out = [];
    for (const dpp of dpps) {
      const context = await loadDppValidationContext(dpp);
      const ev = evaluateDppChecks(context);
      out.push({
        dpp_id: dpp.ID,
        product_name: nameById[dpp.product_ID] || null,
        status: dpp.status,
        can_approve: ev.can_approve,
        percent: ev.percent,
        blocking: ev.gate_errors,
      });
    }
    return { dpps: out };
  },
};

const proposeExecutors = {
  async proposeProduct(args, ctx) {
    const row = { status: 'draft', ...args };
    if (row.category_code && !row.category) row.category = row.category_code;
    const result = await dryRunImport(ctx, 'importProducts', [row]);
    return { entity: 'product', draft: args, validation: result };
  },
  async proposeVariant(args, ctx) {
    const result = await dryRunImport(ctx, 'importVariants', [{ status: 'active', ...args }]);
    return { entity: 'variant', draft: args, validation: result };
  },
  async proposeBatch(args, ctx) {
    const result = await dryRunImport(ctx, 'importBatches', [{ status: 'draft', ...args }]);
    return { entity: 'batch', draft: args, validation: result };
  },
  async proposeBom(args, ctx) {
    const rows = Array.isArray(args.rows) ? args.rows : [];
    const result = await dryRunImport(ctx, 'importBOM', rows);
    return { entity: 'bom', draft: rows, validation: result };
  },
};

/**
 * Execute a tool by name. Never throws for expected failures — returns
 * `{ error }` so the model can react and the loop continues.
 * @returns {Promise<object>}
 */
async function executeTool(name, args, ctx) {
  const exec = readExecutors[name] || proposeExecutors[name];
  if (!exec) return { error: `Unknown tool: ${name}` };
  try {
    return await exec(args || {}, ctx);
  } catch (e) {
    LOG.warn('ai tool execution failed', { tool: name, code: e.code || null });
    return { error: 'This step could not be completed. Please try again or provide different input.' };
  }
}

module.exports = {
  toolDeclarations,
  executeTool,
  isProposeTool: (n) => PROPOSE_NAMES.has(n),
  isLifecycleTool: (n) => n === 'offerLifecycleAction',
};
