const CERT_WARNING_DAYS = 30;

export const norm = (v) => String(v ?? '').trim().toLowerCase();

export const hasValue = (v) =>
  v !== null && v !== undefined && String(v).trim() !== '';

const isActive = (v) =>
  !v || v === 'active' || v === 'published' || v === 'approved';

const daysUntil = (date) => {
  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(String(date).slice(0, 10));
  target.setHours(0, 0, 0, 0);

  return Math.ceil((target - today) / 86400000);
};

const looksLikeUrl = (v) => {
  if (!hasValue(v)) return false;

  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

function makeIssue({
  type,
  severity = 'warning',
  entityType,
  entityId,
  entityName,
  message,
  details,
  dueDate,
  link,
  sourceId
}) {
  const id = [
    type,
    severity,
    entityType,
    entityId,
    sourceId,
    message,
    details,
    dueDate
  ]
    .filter(Boolean)
    .join('|');

  return {
    id,
    type,
    severity,
    entityType,
    entityId,
    entityName: entityName || entityId || '—',
    message,
    details,
    dueDate,
    link,
    status: 'Open'
  };
}

function duplicateIssues(rows, keyFn, label, entityType, linkFn, nameFn) {
  const map = new Map();

  rows.forEach((row) => {
    const key = norm(keyFn(row));
    if (!key) return;

    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });

  const issues = [];

  map.forEach((duplicates, key) => {
    if (duplicates.length <= 1) return;

    duplicates.forEach((row) => {
      issues.push(
        makeIssue({
          type: label,
          severity: 'warning',
          entityType,
          entityId: row.ID,
          entityName: nameFn(row),
          message: `Duplicate ${label.replace('Duplicate ', '')}`,
          details: `Value "${key}" is used ${duplicates.length} times.`,
          link: linkFn(row),
          sourceId: row.ID
        })
      );
    });
  });

  return issues;
}

export function buildComplianceIssues({
  products = [],
  variants = [],
  batches = [],
  items = [],
  docs = [],
  boms = [],
  batchComponents = []
}) {
  const productById = new Map(products.map((p) => [p.ID, p]));
  const variantById = new Map(variants.map((v) => [v.ID, v]));
  const batchById = new Map(batches.map((b) => [b.ID, b]));

  const all = [];

  all.push(
    ...duplicateIssues(
      products,
      (p) => p.gtin,
      'Duplicate GTIN',
      'Product',
      (p) => `/products/${p.ID}`,
      (p) => p.name
    ),

    ...duplicateIssues(
      products,
      (p) => p.upi || p.UPI,
      'Duplicate UPI',
      'Product',
      (p) => `/products/${p.ID}`,
      (p) => p.name
    ),

    ...duplicateIssues(
      items,
      (i) => i.serial_number,
      'Duplicate Serial Number',
      'Item',
      (i) => `/items/${i.ID}`,
      (i) => i.serial_number || i.upi || i.ID
    ),

    ...duplicateIssues(
      products,
      (p) => `${p.name}|${p.category}|${p.brand}`,
      'Duplicate Product',
      'Product',
      (p) => `/products/${p.ID}`,
      (p) => p.name
    ),

    ...duplicateIssues(
      variants,
      (v) => `${v.product_ID}|${v.name}|${v.size}|${v.color}`,
      'Duplicate Variant',
      'Variant',
      (v) => `/products/${v.product_ID}/variants/${v.ID}/view`,
      (v) => v.name || [v.color, v.size].filter(Boolean).join(' / ') || v.ID
    ),

    ...duplicateIssues(
      batches,
      (b) => `${b.variant_ID}|${b.batch_number}`,
      'Duplicate Batch',
      'Batch',
      (b) =>
        `/products/${variantById.get(b.variant_ID)?.product_ID}/variants/${b.variant_ID}/batches/${b.ID}`,
      (b) => b.batch_number || b.ID
    )
  );

  products.forEach((p) => {
    const link = `/products/${p.ID}`;

    if (
      !hasValue(p.country_of_origin) &&
      !hasValue(p.origin_country) &&
      !hasValue(p.country)
    ) {
      all.push(
        makeIssue({
          type: 'Missing Country of Origin',
          severity: 'critical',
          entityType: 'Product',
          entityId: p.ID,
          entityName: p.name,
          message: 'Missing country of origin',
          details: 'Country of origin is mandatory for compliance.',
          link,
          sourceId: p.ID
        })
      );
    }

    if (!isActive(p.status)) {
      all.push(
        makeIssue({
          type: 'Inactive referenced Product / Variant / Batch',
          severity: 'critical',
          entityType: 'Product',
          entityId: p.ID,
          entityName: p.name,
          message: 'Product is inactive',
          details: `Current status: ${p.status}`,
          link,
          sourceId: p.ID
        })
      );
    }
  });

  variants.forEach((v) => {
    const product = productById.get(v.product_ID);
    const link = `/products/${v.product_ID}/variants/${v.ID}/view`;

    if (!isActive(v.status)) {
      all.push(
        makeIssue({
          type: 'Inactive referenced Product / Variant / Batch',
          severity: 'critical',
          entityType: 'Variant',
          entityId: v.ID,
          entityName: v.name || v.ID,
          message: 'Variant is inactive',
          details: `Product: ${product?.name ?? v.product_ID}`,
          link,
          sourceId: v.ID
        })
      );
    }

    if (v.product_ID && !product) {
      all.push(
        makeIssue({
          type: 'Inactive referenced Product / Variant / Batch',
          severity: 'critical',
          entityType: 'Variant',
          entityId: v.ID,
          entityName: v.name || v.ID,
          message: 'Referenced product does not exist',
          details: `Missing product_ID: ${v.product_ID}`,
          link,
          sourceId: v.ID
        })
      );
    }
  });

  batches.forEach((b) => {
    const variant = variantById.get(b.variant_ID);
    const productId = variant?.product_ID;
    const product = productById.get(productId);
    const link = `/products/${productId}/variants/${b.variant_ID}/batches/${b.ID}`;

    if (
      !hasValue(b.supplier_ID) &&
      !hasValue(b.businessPartner_ID) &&
      !hasValue(b.supplier)
    ) {
      all.push(
        makeIssue({
          type: 'Missing Supplier',
          severity: 'warning',
          entityType: 'Batch',
          entityId: b.ID,
          entityName: b.batch_number || b.ID,
          message: 'Missing supplier',
          details: 'No supplier/business partner is assigned to this batch.',
          link,
          sourceId: b.ID
        })
      );
    }

    if (
      !hasValue(b.co2_footprint_kg) &&
      !hasValue(b.carbon_footprint) &&
      !hasValue(b.carbonFootprint)
    ) {
      all.push(
        makeIssue({
          type: 'Missing Carbon Footprint',
          severity: 'warning',
          entityType: 'Batch',
          entityId: b.ID,
          entityName: b.batch_number || b.ID,
          message: 'Missing carbon footprint',
          details: 'No CO₂ / carbon footprint value is maintained for this batch.',
          link,
          sourceId: b.ID
        })
      );
    }

    const isFinishedProduct =
      product?.product_type === 'finished' ||
      ['Cut & Sew', 'Assembly'].includes(b.production_stage);

    if (!isFinishedProduct && !hasValue(b.recycled_content_pct)) {
      all.push(
        makeIssue({
          type: 'Missing Recycled Content',
          severity: 'info',
          entityType: 'Batch',
          entityId: b.ID,
          entityName: b.batch_number || b.ID,
          message: 'Missing recycled content',
          details: 'Recycled content is missing for this material/component batch.',
          link,
          sourceId: b.ID
        })
      );
    }

    if (!isActive(b.status)) {
      all.push(
        makeIssue({
          type: 'Inactive referenced Product / Variant / Batch',
          severity: 'critical',
          entityType: 'Batch',
          entityId: b.ID,
          entityName: b.batch_number || b.ID,
          message: 'Batch is inactive',
          details: `Current status: ${b.status}`,
          link,
          sourceId: b.ID
        })
      );
    }

    if (b.variant_ID && !variant) {
      all.push(
        makeIssue({
          type: 'Inactive referenced Product / Variant / Batch',
          severity: 'critical',
          entityType: 'Batch',
          entityId: b.ID,
          entityName: b.batch_number || b.ID,
          message: 'Referenced variant does not exist',
          details: `Missing variant_ID: ${b.variant_ID}`,
          link,
          sourceId: b.ID
        })
      );
    }
  });

  docs.forEach((d) => {
    const owner = d.product_ID
      ? productById.get(d.product_ID)
      : d.batch_ID
        ? batchById.get(d.batch_ID)
        : null;

    const entityType = d.product_ID ? 'Product' : d.batch_ID ? 'Batch' : 'Document';
    const entityId = d.product_ID || d.batch_ID || d.ID;
    const entityName = owner?.name || owner?.batch_number || d.title || d.ID;

    const link = d.product_ID
      ? `/products/${d.product_ID}`
      : d.batch_ID
        ? `/batches/${d.batch_ID}`
        : undefined;

    if (d.doc_type === 'certificate') {
      const days = daysUntil(d.valid_until);

      if (days !== null && days < 0) {
        all.push(
          makeIssue({
            type: 'Certificate expired',
            severity: 'critical',
            entityType,
            entityId,
            entityName,
            message: 'Certificate is expired',
            details: `${d.title || d.file_name || d.ID} expired ${Math.abs(days)} days ago.`,
            dueDate: d.valid_until,
            link,
            sourceId: d.ID
          })
        );
      } else if (days !== null && days <= CERT_WARNING_DAYS) {
        all.push(
          makeIssue({
            type: 'Certificate expires soon',
            severity: days <= 7 ? 'critical' : 'warning',
            entityType,
            entityId,
            entityName,
            message: `Certificate expires in ${days} days`,
            details: d.title || d.file_name || d.ID,
            dueDate: d.valid_until,
            link,
            sourceId: d.ID
          })
        );
      }
    }

    if (!hasValue(d.title) || !hasValue(d.doc_type) || !hasValue(d.visibility)) {
      all.push(
        makeIssue({
          type: 'Invalid document metadata',
          severity: 'warning',
          entityType,
          entityId,
          entityName,
          message: 'Invalid document metadata',
          details: 'Title, document type or visibility is missing.',
          link,
          sourceId: d.ID
        })
      );
    }

    if (
      d.doc_type === 'certificate' &&
      (!hasValue(d.issuer) || !hasValue(d.issue_date) || !hasValue(d.valid_until))
    ) {
      all.push(
        makeIssue({
          type: 'Invalid document metadata',
          severity: 'warning',
          entityType,
          entityId,
          entityName,
          message: 'Certificate metadata incomplete',
          details: 'Issuer, issue date and valid-until date should be maintained.',
          link,
          sourceId: d.ID
        })
      );
    }
  });

  products.forEach((p) => {
    const productDocs = docs.filter((d) => d.product_ID === p.ID);

    const hasCertificate = productDocs.some((d) => d.doc_type === 'certificate');

    const hasComplianceDoc = productDocs.some((d) =>
      ['certificate', 'declaration', 'test_report', 'audit_report', 'compliance'].includes(
        d.doc_type
      )
    );

    if (!hasCertificate || !hasComplianceDoc) {
      all.push(
        makeIssue({
          type: 'Missing mandatory document',
          severity: 'critical',
          entityType: 'Product',
          entityId: p.ID,
          entityName: p.name,
          message: 'Missing mandatory compliance document',
          details: 'At least one certificate or compliance proof should be attached.',
          link: `/products/${p.ID}`,
          sourceId: p.ID
        })
      );
    }
  });

  boms.forEach((bom) => {
    const variant = variantById.get(bom.parent_ID);
    const productId = variant?.product_ID;

    if (hasValue(bom.external_dpp_url) && !looksLikeUrl(bom.external_dpp_url)) {
      all.push(
        makeIssue({
          type: 'Broken external DPP URL',
          severity: 'warning',
          entityType: 'BOM',
          entityId: bom.ID,
          entityName: bom.component_name || bom.component_ID || bom.ID,
          message: 'Broken external DPP URL',
          details: bom.external_dpp_url,
          link:
            productId && variant?.ID
              ? `/products/${productId}/variants/${variant.ID}/edit`
              : undefined,
          sourceId: bom.ID
        })
      );
    }

    if (bom.component_ID) {
      const component = productById.get(bom.component_ID);

      if (!component || !isActive(component.status)) {
        all.push(
          makeIssue({
            type: 'Inactive referenced Product / Variant / Batch',
            severity: 'critical',
            entityType: 'BOM',
            entityId: bom.ID,
            entityName: bom.component_name || bom.component_ID,
            message: 'BOM references inactive or missing component product',
            details: `Component product: ${bom.component_ID}`,
            link:
              productId && variant?.ID
                ? `/products/${productId}/variants/${variant.ID}/edit`
                : undefined,
            sourceId: bom.ID
          })
        );
      }
    }
  });

  return all;
}