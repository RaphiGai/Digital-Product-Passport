import { Link } from 'react-router-dom';

/**
 * Shared validation report — renders the backend's unified check catalogue
 * (DPPService.validationStatus / validationOverview) grouped by section, with
 * deep links to the source records. Used by the Validation page (expandable
 * row report) and the DPP-detail readiness card.
 *
 * @typedef {{ key:string, label:string, passed:boolean, mandatory:boolean,
 *   gate?:boolean, section:string, fixHint?:string }} Check
 */

function groupChecksBySection(checks = []) {
  return checks.reduce((acc, check) => {
    (acc[check.section] ??= []).push(check);
    return acc;
  }, {});
}

function labelVariant(v) {
  if (!v) return '—';
  return [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID || '—';
}

const linkClass = 'font-mono text-xs text-brand hover:underline break-all';

function EntityBox({ children }) {
  return (
    <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-xs text-ink-muted">
      {children}
    </div>
  );
}

/**
 * @param {{ checks: Check[], entities?: { dpp?:object, product?:object, variant?:object,
 *   batch?:object, item?:object }, summary?: { score?:string, readyToPublish?:boolean,
 *   mandatoryFailed?:number }|null, className?: string }} props
 */
export function ValidationReport({ checks = [], entities = {}, summary = null, className = '' }) {
  const { dpp, product, variant, batch, item } = entities;
  const grouped = groupChecksBySection(checks);

  const productId = product?.ID || dpp?.product_ID;
  const variantId = variant?.ID || dpp?.variant_ID;
  const batchId = batch?.ID || dpp?.batch_ID;
  const itemId = item?.ID || dpp?.item_ID;

  const sectionDescription = {
    Product: (
      <EntityBox>
        Product:{' '}
        {productId ? (
          <Link to={`/products/${productId}`} className={linkClass}>
            {productId}
          </Link>
        ) : (
          '—'
        )}
        {product?.name && <span> · {product.name}</span>}
      </EntityBox>
    ),
    Variant: (
      <EntityBox>
        Variant:{' '}
        {productId && variantId ? (
          <Link to={`/products/${productId}/variants/${variantId}/view`} className={linkClass}>
            {variantId}
          </Link>
        ) : (
          '—'
        )}
        <span> · {labelVariant(variant)}</span>
      </EntityBox>
    ),
    Production: (
      <EntityBox>
        Batch:{' '}
        {productId && variantId && batchId ? (
          <Link
            to={`/products/${productId}/variants/${variantId}/batches/${batchId}`}
            className={linkClass}
          >
            {batchId}
          </Link>
        ) : (
          '—'
        )}
        {batch?.batch_number && <span> · {batch.batch_number}</span>}
        {itemId && (
          <span>
            {' '}· Item {item?.serial_number || item?.upi || itemId}
          </span>
        )}
      </EntityBox>
    )
  };

  return (
    <div className={className}>
      {summary && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-ink">Validation report</span>

          {summary.score && (
            <span className="text-xs text-ink-muted">{summary.score} checks passed</span>
          )}

          {summary.readyToPublish ? (
            <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
              Ready to publish
            </span>
          ) : (
            <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
              {summary.mandatoryFailed ?? 0} mandatory issue(s)
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(grouped).map(([section, sectionChecks]) => (
          <div key={section} className="rounded-lg border border-black/5 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-ink">{section}</h3>

            {sectionDescription[section]}

            <div className="space-y-2">
              {sectionChecks.map((c) => (
                <div key={c.key} className="flex items-start gap-2 text-sm">
                  <span
                    className={
                      c.passed
                        ? 'text-green-600'
                        : c.mandatory
                          ? 'text-red-600'
                          : 'text-amber-600'
                    }
                  >
                    {c.passed ? '✓' : c.mandatory ? '✕' : '!'}
                  </span>

                  <div>
                    <p className="text-ink">
                      {c.label}
                      {c.mandatory && (
                        <span className="ml-1 text-xs text-red-600">mandatory</span>
                      )}
                    </p>

                    {!c.passed && c.fixHint && (
                      <p className="text-xs text-ink-muted">{c.fixHint}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
