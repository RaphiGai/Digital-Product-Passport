import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, ArrowLeft } from 'lucide-react';
import { callUnboundAction } from '@/api/client';
import { useHasRole } from '@/auth/useMe';
import { PRODUCT_TYPES, ESPR_STATUSES } from '@/lib/fieldCatalogue';
import { exportCsv } from '@/lib/exportCsv';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Input, Select } from '@/ui/Form';
import { SortHeader } from '@/ui/Table';
import { Banner } from '@/ui/Breadcrumb';
import { PageHeader } from './ComingSoon';
import { BarChart, HBars, DonutChart } from '@/ui/charts';

// ---- formatting (German number/date standard; UI language stays English) ----
const fmtNum = (v, digits = 2) =>
  v == null || v === '' || Number.isNaN(Number(v))
    ? '—'
    : new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(v));
const fmtDate = (v) => {
  if (!v) return '—';
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(v).slice(0, 10);
};
const csvNum = (v, digits = 2) =>
  v == null || v === '' || Number.isNaN(Number(v)) ? '' : Number(v).toFixed(digits).replace('.', ',');
const pctStr = (v, digits = 0) => (v == null ? '—' : `${fmtNum(v, digits)} %`);

const PRODUCT_TYPE_LABEL = Object.fromEntries(PRODUCT_TYPES.map((t) => [t.value, t.label]));
const ESPR_LABEL = Object.fromEntries(ESPR_STATUSES.map((t) => [t.value, t.label]));
const ESPR_COLORS = { compliant: '#16a34a', in_review: '#f59e0b', non_compliant: '#dc2626', draft: '#9ca3af' };
const EVIDENCE_COLORS = { complete: '#16a34a', partial: '#f59e0b', expired_only: '#dc2626', none: '#9ca3af' };

const RISK_RANK = { 'Declared, not evidenced': 3, 'Non-compliant': 2, Incomplete: 1, OK: 0 };
const RISK_BADGE = {
  'Declared, not evidenced': 'bg-red-100 text-red-800',
  'Non-compliant': 'bg-red-100 text-red-800',
  Incomplete: 'bg-amber-100 text-amber-800',
  OK: 'bg-green-100 text-green-800'
};

const TOP_CRITERIA = [
  { value: 'gap', label: 'Largest evidence gap', compute: (r) => Math.round((1 - r.evidence_score) * 100), unit: '%' },
  { value: 'missing', label: 'Most missing types', compute: (r) => 3 - r.covered_types, unit: 'types' },
  { value: 'expired', label: 'Most expired docs', compute: (r) => r.expired_doc_count, unit: 'docs' },
  { value: 'declared', label: 'Declared, not evidenced', compute: (r) => Math.round((1 - r.evidence_score) * 100), unit: '%', only: (r) => r.declared_not_evidenced }
];

const iso = (d) => d.toISOString().slice(0, 10);
const triState = (has, expiredOnly) => (has ? 'Valid' : expiredOnly ? 'Expired' : 'Missing');

function compareVals(av, bv, dir) {
  const aNull = av == null || av === '';
  const bNull = bv == null || bv === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  let r;
  if (typeof av === 'number' && typeof bv === 'number') r = av - bv;
  else r = String(av).localeCompare(String(bv), 'en', { numeric: true, sensitivity: 'base' });
  return dir === 'asc' ? r : -r;
}

function Kpi({ label, value, hint, tone }) {
  const valueCls = tone === 'danger' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-ink';
  return (
    <Card>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className={'mt-1 text-2xl font-semibold ' + valueCls}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

function Tri({ state }) {
  const cls = state === 'Valid' ? 'text-green-700' : state === 'Expired' ? 'text-red-700 font-medium' : 'text-ink-muted';
  return <span className={cls}>{state}</span>;
}
function EsprCell({ value }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-2 w-2 rounded-full" style={{ background: ESPR_COLORS[value] || '#9ca3af' }} />
      {ESPR_LABEL[value] ?? value}
    </span>
  );
}
function RiskBadge({ flag }) {
  return <span className={'rounded px-2 py-0.5 text-xs font-medium ' + (RISK_BADGE[flag] || 'bg-gray-100 text-ink')}>{flag}</span>;
}
const yesNo = (b) => (b ? 'Yes' : 'No');

// ---- column specs per level. get = display value; sort = sort value; csv = export. ----
const COLUMNS = {
  product: [
    { key: 'name', header: 'Product', sort: (r) => r.name, cell: (r) => r.name, csv: (r) => r.name },
    { key: 'product_type', header: 'Type', sort: (r) => r.product_type, cell: (r) => PRODUCT_TYPE_LABEL[r.product_type] ?? r.product_type, csv: (r) => PRODUCT_TYPE_LABEL[r.product_type] ?? r.product_type ?? '' },
    { key: 'espr_compliance', header: 'ESPR status', sort: (r) => r.espr_compliance, cell: (r) => <EsprCell value={r.espr_compliance} />, csv: (r) => ESPR_LABEL[r.espr_compliance] ?? r.espr_compliance ?? '' },
    { key: 'evidence_score', header: 'Evidence', num: true, sort: (r) => r.evidence_score, cell: (r) => pctStr(r.evidence_score * 100), csv: (r) => csvNum(r.evidence_score * 100, 0) },
    { key: 'evidence_complete', header: 'Complete?', sort: (r) => (r.evidence_complete ? 1 : 0), cell: (r) => yesNo(r.evidence_complete), csv: (r) => yesNo(r.evidence_complete) },
    { key: 'certificate', header: 'Certificate', sort: (r) => triState(r.has_certificate, r.certificate_expired_only), cell: (r) => <Tri state={triState(r.has_certificate, r.certificate_expired_only)} />, csv: (r) => triState(r.has_certificate, r.certificate_expired_only) },
    { key: 'test_report', header: 'Test report', sort: (r) => triState(r.has_test_report, r.test_report_expired_only), cell: (r) => <Tri state={triState(r.has_test_report, r.test_report_expired_only)} />, csv: (r) => triState(r.has_test_report, r.test_report_expired_only) },
    { key: 'doc', header: 'Decl. of conformity', sort: (r) => triState(r.has_doc, r.doc_expired_only), cell: (r) => <Tri state={triState(r.has_doc, r.doc_expired_only)} />, csv: (r) => triState(r.has_doc, r.doc_expired_only) },
    { key: 'doc_count', header: 'Docs', num: true, sort: (r) => r.doc_count, cell: (r) => r.doc_count, csv: (r) => r.doc_count },
    { key: 'expired_doc_count', header: 'Expired', num: true, sort: (r) => r.expired_doc_count, cell: (r) => r.expired_doc_count, csv: (r) => r.expired_doc_count },
    { key: 'published', header: 'Published DPP', sort: (r) => (r.published ? 1 : 0), cell: (r) => yesNo(r.published), csv: (r) => yesNo(r.published) },
    { key: 'risk', header: 'Risk', sort: (r) => RISK_RANK[r.risk_flag] ?? -1, cell: (r) => <RiskBadge flag={r.risk_flag} />, csv: (r) => r.risk_flag }
  ],
  batch: [
    { key: 'batch_number', header: 'Batch', sort: (r) => r.batch_number, cell: (r) => r.batch_number ?? '—', csv: (r) => r.batch_number ?? '' },
    { key: 'product_name', header: 'Product', sort: (r) => r.product_name, cell: (r) => r.product_name, csv: (r) => r.product_name },
    { key: 'variant_label', header: 'Variant', sort: (r) => r.variant_label, cell: (r) => r.variant_label ?? '—', csv: (r) => r.variant_label ?? '' },
    { key: 'production_date', header: 'Date', sort: (r) => r.production_date, cell: (r) => fmtDate(r.production_date), csv: (r) => r.production_date ?? '' },
    { key: 'status', header: 'Status', sort: (r) => r.status, cell: (r) => r.status ?? '—', csv: (r) => r.status ?? '' },
    { key: 'country_of_origin_set', header: 'Origin set', sort: (r) => (r.country_of_origin_set ? 1 : 0), cell: (r) => yesNo(r.country_of_origin_set), csv: (r) => yesNo(r.country_of_origin_set) },
    { key: 'evidence_score', header: 'Evidence', num: true, sort: (r) => r.evidence_score, cell: (r) => pctStr(r.evidence_score * 100), csv: (r) => csvNum(r.evidence_score * 100, 0) },
    { key: 'evidence_complete', header: 'Complete?', sort: (r) => (r.evidence_complete ? 1 : 0), cell: (r) => yesNo(r.evidence_complete), csv: (r) => yesNo(r.evidence_complete) },
    { key: 'batch_doc_count', header: 'Own docs', num: true, sort: (r) => r.batch_doc_count, cell: (r) => r.batch_doc_count, csv: (r) => r.batch_doc_count },
    { key: 'product_doc_count', header: 'Inherited docs', num: true, sort: (r) => r.product_doc_count, cell: (r) => r.product_doc_count, csv: (r) => r.product_doc_count },
    { key: 'missing_types', header: 'Missing types', sort: (r) => (r.missing_types || []).length, cell: (r) => (r.missing_types || []).join(', ') || '—', csv: (r) => (r.missing_types || []).join(', ') }
  ]
};

const LEVELS = [
  { value: 'product', label: 'By product', rowsKey: 'by_product' },
  { value: 'batch', label: 'By batch', rowsKey: 'by_batch' }
];
const LEVEL_DEFAULT_SORT = {
  product: { column: 'risk', direction: 'desc' },
  batch: { column: 'evidence_score', direction: 'asc' }
};

export function ComplianceAnalytics() {
  const isAdvanced = useHasRole('company_advanced');

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return iso(d);
  });
  const [dateTo, setDateTo] = useState(() => iso(new Date()));
  const [productType, setProductType] = useState('');
  const [esprStatus, setEsprStatus] = useState('');

  const [level, setLevel] = useState('product');
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState(LEVEL_DEFAULT_SORT.product);
  const [topOnly, setTopOnly] = useState(false);
  const [topCriterion, setTopCriterion] = useState('gap');

  const query = useQuery({
    queryKey: ['complianceAnalytics', dateFrom, dateTo, productType, esprStatus],
    enabled: isAdvanced,
    queryFn: async () => {
      const raw = await callUnboundAction('complianceAnalytics', {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        productType: productType || undefined,
        esprStatus: esprStatus || undefined
      });
      const json = raw?.value ?? raw;
      return typeof json === 'string' ? JSON.parse(json) : json;
    }
  });

  const data = query.data;
  const columns = COLUMNS[level];
  const rawRows = useMemo(() => {
    if (!data) return [];
    return data[LEVELS.find((l) => l.value === level).rowsKey] ?? [];
  }, [data, level]);

  function changeLevel(next) {
    setLevel(next);
    setSortConfig(LEVEL_DEFAULT_SORT[next]);
  }
  function handleSort(column) {
    setSortConfig((cur) =>
      cur.column === column ? { column, direction: cur.direction === 'asc' ? 'desc' : 'asc' } : { column, direction: 'desc' }
    );
  }

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = rawRows;
    if (q) {
      rows = rows.filter((r) =>
        Object.values(r)
          .filter((v) => v != null)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    const col = columns.find((c) => c.key === sortConfig.column);
    if (col) rows = [...rows].sort((a, b) => compareVals(col.sort(a), col.sort(b), sortConfig.direction));
    return topOnly ? rows.slice(0, 10) : rows;
  }, [rawRows, columns, search, sortConfig, topOnly]);

  const topData = useMemo(() => {
    if (!data) return [];
    const crit = TOP_CRITERIA.find((c) => c.value === topCriterion);
    return (data.by_product ?? [])
      .filter((r) => (crit.only ? crit.only(r) : true))
      .map((r) => ({ label: r.name, value: crit.compute(r) }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [data, topCriterion]);

  const topUnit = TOP_CRITERIA.find((c) => c.value === topCriterion).unit;
  const topFormat = (v) => (topUnit === '%' ? `${fmtNum(v, 0)} %` : `${fmtNum(v, 0)} ${topUnit}`);

  function handleExport() {
    const cols = columns.map((c) => ({ key: c.key, label: c.header }));
    const rows = visibleRows.map((r) => Object.fromEntries(columns.map((c) => [c.key, c.csv ? c.csv(r) : ''])));
    exportCsv(`compliance-${level}-${dateFrom}_${dateTo}.csv`, cols, rows);
  }

  if (!isAdvanced) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compliance reports" />
        <Banner kind="error">You don&apos;t have permission to view compliance reports.</Banner>
      </div>
    );
  }

  const kpis = data?.kpis;
  const espr = data?.espr_distribution ?? {};
  const ev = data?.evidence_distribution ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Compliance reports" subtitle="ESPR readiness & documentation-evidence completeness" />
        <Link to="/reports">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Reports
          </Button>
        </Link>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            From
            <Input type="date" max={dateTo} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            To
            <Input type="date" min={dateFrom} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Product type
            <Select
              value={productType}
              onChange={(e) => setProductType(e.target.value)}
              options={[{ value: '', label: 'All product types' }, ...PRODUCT_TYPES.map((t) => ({ value: t.value, label: t.label }))]}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            ESPR status
            <Select
              value={esprStatus}
              onChange={(e) => setEsprStatus(e.target.value)}
              options={[{ value: '', label: 'All ESPR statuses' }, ...ESPR_STATUSES.map((t) => ({ value: t.value, label: t.label }))]}
            />
          </label>
        </div>
      </Card>

      {query.isError && <Banner kind="error">Could not load the compliance report. Please try again.</Banner>}
      {query.isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Products assessed" value={kpis.products} hint={`${kpis.published_dpps} published passports`} />
            <Kpi label="ESPR ready" value={pctStr(kpis.espr_ready_pct, 1)} hint={`${espr.compliant ?? 0} of ${kpis.products} self-declared compliant`} tone={kpis.espr_ready_pct != null && kpis.espr_ready_pct < 100 ? 'warn' : undefined} />
            <Kpi label="Blocking compliance" value={kpis.espr_blocking} hint={`${kpis.non_compliant} non-compliant · ${kpis.in_review} in review · ${kpis.draft} draft`} tone={kpis.espr_blocking > 0 ? 'warn' : undefined} />
            <Kpi label="Declared, not evidenced" value={kpis.declared_not_evidenced} hint="Compliant but documentation incomplete" tone={kpis.declared_not_evidenced > 0 ? 'danger' : undefined} />
            <Kpi label="Documentation complete" value={pctStr(kpis.docs_complete_pct, 1)} hint={`Avg evidence ${pctStr((kpis.avg_docs_score ?? 0) * 100, 0)}`} />
            <Kpi label="Products with no documents" value={kpis.products_no_docs} hint={`${kpis.products_expired_only} expired-only`} tone={kpis.products_no_docs > 0 ? 'warn' : undefined} />
            <Kpi label="Docs expiring (≤90d)" value={kpis.docs_expiring_soon} hint={`${kpis.docs_expired} already expired`} tone={kpis.docs_expiring_soon > 0 ? 'warn' : undefined} />
            <Kpi label="Docs expired" value={kpis.docs_expired} hint={`As of ${fmtDate(data.today)}`} tone={kpis.docs_expired > 0 ? 'danger' : undefined} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-ink">ESPR compliance mix (self-declared)</h3>
              <DonutChart
                segments={[
                  { label: ESPR_LABEL.compliant, value: espr.compliant ?? 0, color: ESPR_COLORS.compliant },
                  { label: ESPR_LABEL.in_review, value: espr.in_review ?? 0, color: ESPR_COLORS.in_review },
                  { label: ESPR_LABEL.non_compliant, value: espr.non_compliant ?? 0, color: ESPR_COLORS.non_compliant },
                  { label: ESPR_LABEL.draft, value: espr.draft ?? 0, color: ESPR_COLORS.draft }
                ]}
              />
            </Card>
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-ink">Evidence completeness mix (products)</h3>
              <DonutChart
                segments={[
                  { label: 'Complete', value: ev.complete ?? 0, color: EVIDENCE_COLORS.complete },
                  { label: 'Partial', value: ev.partial ?? 0, color: EVIDENCE_COLORS.partial },
                  { label: 'Expired only', value: ev.expired_only ?? 0, color: EVIDENCE_COLORS.expired_only },
                  { label: 'No docs', value: ev.none ?? 0, color: EVIDENCE_COLORS.none }
                ]}
              />
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-ink">Expected-type coverage (%)</h3>
              <p className="mb-3 text-xs text-ink-muted">Products with a non-expired document of each expected type</p>
              <BarChart
                data={[
                  { label: 'Certificate', value: kpis.doc_coverage_certs_pct ?? 0 },
                  { label: 'Test report', value: kpis.doc_coverage_test_pct ?? 0 },
                  { label: 'Decl. of conformity', value: kpis.doc_coverage_doc_pct ?? 0 }
                ]}
                color="#0ea5e9"
                format={(v) => `${fmtNum(v, 1)} %`}
              />
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-ink">Documentation coverage per month (%)</h3>
              <p className="mb-3 text-xs text-ink-muted">Avg evidence score, bucketed by reference date</p>
              <BarChart
                data={(data.time_series ?? []).map((t) => ({ label: t.month, value: t.avg_docs_score_pct ?? 0 }))}
                color="#16a34a"
                format={(v) => `${fmtNum(v, 0)} %`}
              />
            </Card>
            <Card className="lg:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">Top 10 products by compliance gap</h3>
                <Select
                  className="max-w-[18rem]"
                  value={topCriterion}
                  onChange={(e) => setTopCriterion(e.target.value)}
                  options={TOP_CRITERIA.map((c) => ({ value: c.value, label: c.label }))}
                />
              </div>
              <HBars data={topData} color="#dc2626" format={topFormat} empty="No compliance gaps in this period." />
            </Card>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg border border-black/10 p-0.5">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => changeLevel(l.value)}
                    className={
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                      (level === l.value ? 'bg-brand-600 text-white' : 'text-ink-muted hover:text-ink')
                    }
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="search"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-48 rounded-lg border border-black/15 px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={topOnly} onChange={(e) => setTopOnly(e.target.checked)} className="h-4 w-4 accent-brand-600" />
                  Top 10 only
                </label>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={visibleRows.length === 0}>
                  <Download className="h-4 w-4" /> Export CSV
                </Button>
              </div>
            </div>

            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-left text-xs uppercase tracking-wider text-ink-muted">
                    {columns.map((c) => (
                      <th key={c.key} className={'px-4 py-3 font-medium ' + (c.num ? 'text-right' : '')}>
                        <SortHeader label={c.header} column={c.key} sortConfig={sortConfig} onSort={handleSort} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-8 text-center text-ink-muted">
                        No records in this period.
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row, ri) => (
                      <tr key={ri} className="border-b border-black/5 last:border-0 hover:bg-gray-50">
                        {columns.map((c) => (
                          <td key={c.key} className={'px-4 py-3 text-ink ' + (c.num ? 'text-right tabular-nums' : '')}>
                            {c.cell(row)}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>

            <p className="text-xs text-ink-muted">
              ESPR status is self-declared by the operator; documentation completeness is a structural check
              (a non-expired document of each expected type — certificate, test report, declaration of conformity —
              exists), not an attestation that documents were reviewed. The expected-document set is a reviewable
              default, not legal advice — confirm the required documents and regulatory suitability with your
              compliance advisor. Document expiry is evaluated as of {fmtDate(data.today)}.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
