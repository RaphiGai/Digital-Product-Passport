'use strict';

const cds = require('@sap/cds');

const MAX_DEPTH = 8;

function toFraction(quantity, unit) {
  if (quantity == null) return 1;
  if (unit === '%') return Number(quantity) / 100;
  return Number(quantity);
}

/**
 * Mass (kg) of a BOM component consumed per finished unit.
 * - 'kg' / 'g' convert directly to kg;
 * - '%' is a share of the finished unit's own mass, so it needs parentWeightG (grams);
 * - 'pcs' (and unknown units) carry no mass basis → null (the caller flags it as missing).
 */
function toKg(quantity, unit, parentWeightG) {
  if (quantity == null) return null;
  const q = Number(quantity);
  if (unit === 'kg') return q;
  if (unit === 'g') return q / 1000;
  if (unit === '%') {
    return parentWeightG != null ? (q / 100) * (Number(parentWeightG) / 1000) : null;
  }
  return null;
}

function weightedSum(self, contributions) {
  let acc = 0;
  let any = false;
  if (self != null) { acc += Number(self); any = true; }
  for (const c of contributions) {
    if (c.value == null) continue;
    acc += Number(c.value) * c.weight;
    any = true;
  }
  return any ? Number(acc.toFixed(6)) : null;
}

function weightedAverage(self, contributions) {
  let num = 0;
  let den = 0;
  if (self != null) { num += Number(self); den += 1; }
  for (const c of contributions) {
    if (c.value == null) continue;
    num += Number(c.value) * c.weight;
    den += c.weight;
  }
  if (den === 0) return null;
  return Number((num / den).toFixed(6));
}

/** Simple arithmetic mean over non-null values — used to average several consumed component batches. */
function mean(values) {
  const xs = values.filter((v) => v != null).map(Number);
  if (!xs.length) return null;
  return Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(6));
}

/**
 * Representative DPP of a component batch = the DPP of its FIRST item (all items in
 * a batch are identical), ordered by serial_number. Null if the batch has no item DPP.
 */
async function firstItemDpp(batchId) {
  if (!batchId) return null;
  const { ProductItems, DPPs } = cds.entities('dpp');
  const item = await SELECT.one.from(ProductItems)
    .columns(['ID']).where({ batch_ID: batchId }).orderBy('serial_number');
  if (!item) return null;
  const dpp = await SELECT.one.from(DPPs).columns(['ID']).where({ item_ID: item.ID });
  return dpp?.ID ?? null;
}

/** Pull the scalars a parent BOM edge consumes out of a child aggregate() result. */
function aggregatedToSource(sub) {
  return {
    co2_per_kg: sub.values?.co2_per_kg ?? null,
    co2_footprint_kg: sub.values?.co2_footprint_kg ?? null,
    recycled_content_pct: sub.values?.recycled_content_pct ?? null,
    weight_g: sub.values?.weight_g ?? null,
    incomplete: sub.incomplete,
  };
}

/**
 * Resolve one BatchComponents row to footprint scalars. Prefers the chosen component
 * batch (via the DPP of its first item); falls back to the component batch row's own
 * values when it has no item DPP yet; finally to an explicit legacy sub_dpp.
 */
async function resolveSource(bc, visited, depth) {
  if (bc.component_batch_ID) {
    const dppId = await firstItemDpp(bc.component_batch_ID);
    if (dppId) {
      return aggregatedToSource(await aggregate(dppId, { visited: new Set(visited), depth: depth + 1 }));
    }
    const { Batches } = cds.entities('dpp');
    const b = await SELECT.one.from(Batches).where({ ID: bc.component_batch_ID });
    if (!b) return null;
    return {
      co2_per_kg: b.co2_footprint_kg != null ? Number(b.co2_footprint_kg) : null,
      co2_footprint_kg: b.co2_footprint_kg != null ? Number(b.co2_footprint_kg) : null,
      recycled_content_pct: b.recycled_content_pct != null ? Number(b.recycled_content_pct) : null,
      weight_g: null,
      incomplete: false,
    };
  }
  if (bc.sub_dpp_ID) {
    return aggregatedToSource(await aggregate(bc.sub_dpp_ID, { visited: new Set(visited), depth: depth + 1 }));
  }
  return null;
}

async function loadDPPContext(dppId) {
  const { DPPs, Products, ProductVariants, Batches, ProductBOMs, BatchComponents } = cds.entities('dpp');
  const dpp = await SELECT.one.from(DPPs).where({ ID: dppId });
  if (!dpp) return null;
  const product = await SELECT.one.from(Products).where({ ID: dpp.product_ID });
  const batch = dpp.batch_ID
    ? await SELECT.one.from(Batches).where({ ID: dpp.batch_ID })
    : null;

  let variantIds;
  if (dpp.variant_ID) {
    variantIds = [dpp.variant_ID];
  } else if (batch) {
    variantIds = [batch.variant_ID];
  } else {
    const variants = await SELECT.from(ProductVariants)
      .columns(['ID'])
      .where({ product_ID: dpp.product_ID });
    variantIds = variants.map((v) => v.ID);
  }

  // A single resolved variant carries weight_g — the mass basis used to turn
  // percentage BOM lines into kg and to mass-weight non-extensive metrics.
  const variant = variantIds.length === 1
    ? await SELECT.one.from(ProductVariants).where({ ID: variantIds[0] })
    : null;

  const boms = variantIds.length
    ? await SELECT.from(ProductBOMs).where({ parent_ID: { in: variantIds } })
    : [];

  // Per-run sourcing: which concrete component batch(es) were consumed in this batch.
  // Keyed by BOM line → list of BatchComponents rows (multiple batches per line allowed,
  // averaged downstream). Overrides the variant-level ProductBOMs.sub_dpp.
  const overrides = new Map();
  if (batch) {
    const bcs = await SELECT.from(BatchComponents).where({ batch_ID: batch.ID });
    for (const bc of bcs) {
      if (!overrides.has(bc.bom_ID)) overrides.set(bc.bom_ID, []);
      overrides.get(bc.bom_ID).push(bc);
    }
  }

  return { dpp, product, batch, variant, boms, overrides };
}

/**
 * Recursively aggregate a DPP. Returns:
 *   { values: { co2_footprint_kg, recycled_content_pct, ... },
 *     incomplete: boolean,
 *     missing: [{ component_ID?, external_dpp_url?, reason }] }
 */
async function aggregate(dppId, opts = {}) {
  const visited = opts.visited || new Set();
  const depth = opts.depth || 0;

  if (visited.has(dppId)) {
    return { values: {}, incomplete: true, missing: [{ dpp_ID: dppId, reason: 'cycle' }] };
  }
  if (depth > MAX_DEPTH) {
    return { values: {}, incomplete: true, missing: [{ dpp_ID: dppId, reason: 'depth_limit' }] };
  }
  visited.add(dppId);

  const ctx = await loadDPPContext(dppId);
  if (!ctx) {
    return { values: {}, incomplete: true, missing: [{ dpp_ID: dppId, reason: 'not_found' }] };
  }

  const missing = [];
  const parentWeightG = ctx.variant?.weight_g ?? null;
  const co2Contribs = [];        // for weightedSum: { value: kg, weight: 1 }
  const recycledContribs = [];   // for weightedAverage: { value: recycled %, weight: mass kg }
  const contributions = [];      // per-component breakdown for the UI

  for (const edge of ctx.boms) {
    const unit = edge.unit;
    const qty = edge.quantity != null ? Number(edge.quantity) : null;
    const massKg = toKg(edge.quantity, unit, parentWeightG);   // kg/g/% → kg; pcs → null

    // Resolve the component's footprint figures (basis decided by the BOM unit below).
    let perKg = null;        // CO2 per kg of the component (for mass-based lines)
    let perPiece = null;     // CO2 per piece of the component (for pcs lines)
    let childRecycled = null;
    let childWeightKg = null;
    let hasSource = false;
    let srcKind = 'unlinked';

    // Per-batch sourcing (BatchComponents) wins over the variant-level recipe link.
    // A BOM line can reference several consumed component batches → average them.
    // Rows that resolve to no component source (e.g. an external line carrying only a
    // batch number) do NOT divert sourcing → fall through to the line's own values.
    const overrideRows = ctx.overrides.get(edge.ID) || [];
    const srcs = [];
    for (const bc of overrideRows) {
      const sv = await resolveSource(bc, visited, depth);
      if (sv) srcs.push(sv);
    }

    if (srcs.length) {
      hasSource = true;
      srcKind = 'internal';
      perKg = mean(srcs.map((s) => s.co2_per_kg));
      perPiece = mean(srcs.map((s) => s.co2_footprint_kg));
      childRecycled = mean(srcs.map((s) => s.recycled_content_pct));
      const w = srcs.find((s) => s.weight_g != null)?.weight_g ?? null;
      childWeightKg = w != null ? Number(w) / 1000 : null;
      if (srcs.some((s) => s.incomplete)) {
        missing.push({ component_ID: edge.component_ID, reason: 'sub_dpp_incomplete' });
      }
    } else if (edge.sub_dpp_ID) {
      // Variant-level default: roll up the component's own DPP (live).
      hasSource = true;
      srcKind = 'internal';
      const sub = await aggregate(edge.sub_dpp_ID, { visited: new Set(visited), depth: depth + 1 });
      perKg = sub.values?.co2_per_kg ?? null;
      perPiece = sub.values?.co2_footprint_kg ?? null;     // child's aggregated total per piece
      childRecycled = sub.values?.recycled_content_pct ?? null;
      childWeightKg = sub.values?.weight_g != null ? Number(sub.values.weight_g) / 1000 : null;
      if (sub.incomplete) {
        missing.push({ component_ID: edge.component_ID, sub_dpp_ID: edge.sub_dpp_ID, reason: 'sub_dpp_incomplete' });
      }
    } else if (edge.external_dpp_url) {
      // External: supplier value entered on the line; basis follows the BOM unit.
      hasSource = true;
      srcKind = 'external';
      const ext = edge.ext_co2_footprint != null ? Number(edge.ext_co2_footprint) : null;
      perKg = ext;
      perPiece = ext;
      childRecycled = edge.ext_recycled_content_pct != null ? Number(edge.ext_recycled_content_pct) : null;
    } else {
      missing.push({ component_ID: edge.component_ID, reason: 'no_sub_dpp' });
    }

    // CO2 contribution (absolute kg) + the mass that enters the recycled average, by BOM unit.
    let co2Kg = null;
    let recMassKg = null;
    if (hasSource) {
      if (unit === 'pcs') {
        if (perPiece != null && qty != null) co2Kg = perPiece * qty;       // count × per-piece
        else missing.push({ component_ID: edge.component_ID, reason: 'no_co2_value' });
        if (childWeightKg != null && qty != null) recMassKg = childWeightKg * qty;
      } else {
        if (perKg == null) missing.push({ component_ID: edge.component_ID, reason: 'no_co2_value' });
        else if (massKg == null) missing.push({ component_ID: edge.component_ID, reason: 'no_mass_basis' });
        else co2Kg = perKg * massKg;                                       // consumed kg × per-kg
        if (massKg != null) recMassKg = massKg;
      }
      if (co2Kg != null) co2Contribs.push({ value: co2Kg, weight: 1 });
      if (childRecycled != null && recMassKg != null) recycledContribs.push({ value: childRecycled, weight: recMassKg });
    }

    contributions.push({
      component_ID: edge.component_ID ?? null,
      component_name: edge.component_name ?? null,
      source: srcKind,
      unit,
      quantity: qty,
      co2_kg: co2Kg != null ? Number(co2Kg.toFixed(6)) : null,
      recycled_pct: childRecycled,
      mass_kg: recMassKg != null ? Number(recMassKg.toFixed(6)) : null,
    });
  }

  const values = {};

  // --- CO2: own per-unit production (batch.co2_footprint_kg) + Σ component contributions.
  const selfCo2 = ctx.batch?.co2_footprint_kg ?? null;
  values.co2_footprint_kg = weightedSum(selfCo2, co2Contribs);

  // Per-kg figure for a parent that consumes THIS product by weight:
  //  - assembly (has a BOM): derive from the per-piece total ÷ unit weight;
  //  - leaf material (no BOM): the entered value is already per kg.
  const hasChildren = ctx.boms.length > 0;
  values.co2_per_kg = hasChildren
    ? (values.co2_footprint_kg != null && parentWeightG
        ? Number((values.co2_footprint_kg / (parentWeightG / 1000)).toFixed(6))
        : null)
    : (selfCo2 != null ? Number(selfCo2) : null);

  // Expose own unit weight so a parent pcs line can mass-weight this in recycled %.
  values.weight_g = ctx.variant?.weight_g ?? null;

  // --- Recycled content (ISO 14021 mass balance): mass-weighted average over
  //     components. No own/self term (a process step adds no recycled mass).
  //     Leaf material with no components falls back to its own batch value.
  values.recycled_content_pct = recycledContribs.length
    ? weightedAverage(null, recycledContribs)
    : (ctx.batch?.recycled_content_pct != null ? Number(ctx.batch.recycled_content_pct) : null);

  // Fibre composition and substances of concern are NOT rolled up — both are
  // declared directly on the finished product (Products.fibre_composition /
  // Products.substances_of_concern).

  return {
    values,
    incomplete: missing.length > 0,
    missing,
    breakdown: {
      own_co2_kg: selfCo2 != null ? Number(selfCo2) : null,
      components: contributions,
    },
  };
}

module.exports = {
  aggregate,
  firstItemDpp,
  _internals: {
    weightedSum,
    weightedAverage,
    mean,
    toFraction,
    toKg,
  },
};
