const hasValue = (v) =>
  v !== null &&
  v !== undefined &&
  !(typeof v === 'string' && v.trim() === '');

const hasNumber = (v) => {
  if (!hasValue(v)) return false;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n);
};

const hasArray = (v) => Array.isArray(v) && v.length > 0;

function check(key, label, passed, mandatory = true, section = 'General', fixHint = '') {
  return {
    key,
    label,
    passed: Boolean(passed),
    mandatory,
    section,
    fixHint
  };
}

export function validateDppContext({
  product,
  variant,
  batch,
  item,
  dpp,
  bom = [],
  batchComponents = [],
  businessPartners = []
}) {
  const checks = [
    check(
      'dpp_exists',
      'Digital Product Passport exists',
      hasValue(dpp?.ID),
      true,
      'Passport',
      'Create a DPP for this item.'
    ),
    check(
      'dpp_status',
      'DPP has workflow status',
      hasValue(dpp?.status),
      true,
      'Passport',
      'Set DPP status to Draft, In Review, Approved, Published or Archived.'
    ),
    check(
      'product_exists',
      'Product assigned',
      hasValue(product?.ID) || hasValue(dpp?.product_ID),
      true,
      'Product',
      'Assign a product to the DPP.'
    ),
    check(
      'variant_exists',
      'Variant assigned',
      hasValue(variant?.ID) || hasValue(dpp?.variant_ID),
      true,
      'Product',
      'Assign a variant to the DPP.'
    ),
    check(
      'batch_exists',
      'Batch assigned',
      hasValue(batch?.ID) || hasValue(dpp?.batch_ID),
      true,
      'Production',
      'Assign a production batch.'
    ),
    check(
      'item_exists',
      'Item assigned',
      hasValue(item?.ID) || hasValue(dpp?.item_ID),
      true,
      'Production',
      'Assign an item to the DPP.'
    ),
    check(
      'item_status_active',
      'Item is active',
      item?.status === 'active',
      true,
      'Production',
      'Only active items should be published.'
    ),
    check(
      'product_name',
      'Product name filled',
      hasValue(product?.name),
      true,
      'Product',
      'Add product name.'
    ),
    check(
      'product_type',
      'Product type filled',
      hasValue(product?.product_type),
      true,
      'Product',
      'Add product type.'
    ),
    check(
      'product_espr_compliance',
      'ESPR compliance status is compliant',
      product?.espr_compliance === 'compliant',
      true,
      'Product',
      'Set ESPR compliance status to Compliant in Product information.'
    ),
    check(
      'variant_identification',
      'Variant identification filled',
      hasValue(variant?.sku) || hasValue(variant?.gtin) || hasValue(variant?.ID),
      true,
      'Product',
      'Add SKU, GTIN or variant ID.'
    ),
    check(
      'variant_size',
      'Size filled',
      hasValue(variant?.size),
      false,
      'Product',
      'Add size if relevant.'
    ),
    check(
      'variant_color',
      'Color filled',
      hasValue(variant?.color),
      false,
      'Product',
      'Add color if relevant.'
    ),
    check(
      'batch_number',
      'Batch number filled',
      hasValue(batch?.batch_number),
      true,
      'Production',
      'Add supplier/production batch number.'
    ),
    check(
      'production_date',
      'Production date filled',
      hasValue(batch?.production_date),
      true,
      'Production',
      'Add production date.'
    ),
    check(
      'production_country',
      'Production country filled',
      hasValue(batch?.production_country) ||
        hasValue(batch?.country_of_origin) ||
        hasValue(batch?.origin_country),
      true,
      'Production',
      'Add production country.'
    ),
    check(
      'factory_or_supplier',
      'Factory or supplier assigned',
      hasValue(batch?.factory_ID) ||
        hasValue(batch?.supplier_ID) ||
        hasValue(batch?.factory?.ID) ||
        hasValue(batch?.supplier?.ID),
      false,
      'Production',
      'Assign factory or supplier.'
    ),
    check(
      'bom_exists',
      'BOM/components available',
      hasArray(bom),
      true,
      'Components',
      'Create BOM/components for this variant.'
    ),
    check(
      'bom_quantities',
      'Component quantities complete',
      hasArray(bom) && bom.every((b) => hasNumber(b.quantity)),
      true,
      'Components',
      'Fill quantity for every BOM component.'
    ),
    check(
      'bom_units',
      'Component units complete',
      hasArray(bom) && bom.every((b) => hasValue(b.unit)),
      true,
      'Components',
      'Fill unit for every BOM component.'
    ),
    check(
      'component_sourcing',
      'Batch component sourcing available',
      hasArray(batchComponents),
      false,
      'Components',
      'Link consumed component batches or supplier batch numbers.'
    ),
    check(
      'co2_footprint',
      'CO₂ footprint filled',
      hasNumber(batch?.co2_footprint) ||
        hasNumber(batch?.co2_footprint_kg) ||
        hasNumber(batch?.own_co2_footprint),
      false,
      'Sustainability',
      'Add CO₂ footprint.'
    ),
    check(
      'recycled_content',
      'Recycled content filled',
      hasNumber(batch?.recycled_content_pct) ||
        hasNumber(product?.recycled_content_pct) ||
        hasNumber(variant?.recycled_content_pct),
      false,
      'Sustainability',
      'Add recycled content percentage.'
    ),
    check(
      'care_instructions',
      'Care instructions filled',
      hasValue(product?.care_instructions) ||
        hasValue(variant?.care_instructions) ||
        hasValue(dpp?.care_instructions),
      false,
      'Circularity',
      'Add washing/care instructions.'
    ),
    check(
      'repair_information',
      'Repair information filled',
      hasValue(product?.repair_information) ||
        hasValue(variant?.repair_information) ||
        hasValue(dpp?.repair_information),
      false,
      'Circularity',
      'Add repair information.'
    ),
    check(
      'end_of_life',
      'End-of-life information filled',
      hasValue(product?.end_of_life_instructions) ||
        hasValue(variant?.end_of_life_instructions) ||
        hasValue(dpp?.end_of_life_instructions),
      false,
      'Circularity',
      'Add reuse, recycling or disposal information.'
    ),
    check(
      'qr_available',
      'QR/public access token available',
      hasValue(dpp?.qr_token) ||
        hasValue(dpp?.public_token) ||
        hasValue(dpp?.public_url),
      true,
      'Publication',
      'Generate QR/public access token.'
    ),
    check(
      'visibility_ready',
      'Visibility is defined',
      hasValue(dpp?.visibility),
      true,
      'Publication',
      'Set DPP visibility.'
    ),
    check(
      'business_partner_available',
      'Business partner data available',
      hasValue(product?.company_ID) ||
        hasValue(product?.businessPartner_ID) ||
        hasValue(batch?.supplier_ID) ||
        hasArray(businessPartners),
      false,
      'Business Partner',
      'Assign brand, supplier or factory.'
    )
  ];

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed);
  const mandatoryFailed = checks.filter((c) => c.mandatory && !c.passed);
  const optionalFailed = checks.filter((c) => !c.mandatory && !c.passed);

  const mandatoryChecks = checks.filter((c) => c.mandatory);
  const mandatoryPassed = mandatoryChecks.filter((c) => c.passed).length;

  return {
    checks,
    passed,
    failed,
    mandatoryFailed,
    optionalFailed,
    total: checks.length,
    mandatoryPassed,
    mandatoryTotal: mandatoryChecks.length,
    score: `${passed}/${checks.length}`,
    mandatoryScore: `${mandatoryPassed}/${mandatoryChecks.length}`,
    percent: Math.round((passed / checks.length) * 100),
    mandatoryPercent: Math.round((mandatoryPassed / mandatoryChecks.length) * 100),
    readyToPublish: mandatoryFailed.length === 0,
    status:
      mandatoryFailed.length === 0
        ? 'ready'
        : mandatoryPassed === 0
          ? 'blocked'
          : 'incomplete'
  };
}

export function canPublishDpp(validation) {
  return Boolean(validation?.readyToPublish);
}

export function getValidationSummary(validation) {
  if (!validation) {
    return {
      label: 'Not checked',
      tone: 'neutral'
    };
  }

  if (validation.readyToPublish) {
    return {
      label: `Ready · ${validation.mandatoryScore} mandatory checks`,
      tone: 'success'
    };
  }

  return {
    label: `${validation.mandatoryFailed.length} mandatory issue(s)`,
    tone: 'error'
  };
}

export function groupChecksBySection(checks = []) {
  return checks.reduce((acc, check) => {
    (acc[check.section] ??= []).push(check);
    return acc;
  }, {});
}

export function validateStatusTransition(currentStatus, nextStatus, validation) {
  if (!nextStatus) return { allowed: false, reason: 'No target status selected.' };

  if (currentStatus === nextStatus) {
    return { allowed: true, reason: '' };
  }

  if ((nextStatus === 'approved' || nextStatus === 'published') && !canPublishDpp(validation)) {
    return {
      allowed: false,
      reason: 'This DPP cannot be approved or published because mandatory validation checks failed.'
    };
  }

  if (currentStatus === 'archived' && nextStatus === 'published') {
    return {
      allowed: false,
      reason: 'Archived DPPs cannot be published directly.'
    };
  }

  return { allowed: true, reason: '' };
}