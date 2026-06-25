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
    : new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
        Number(v)
      );
const fmtDate = (v) => {
  if (!v) return '—';
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(v).slice(0, 10);
};
// CSV decimals: comma, no grouping → parses cleanly in German Excel.
const csvNum = (v, digits = 2) =>
  v == null || v === '' || Number.isNaN(Number(v)) ? '' : Number(v).toFixed(digits).replace('.', ',');

const PRODUCT_TYPE_LABEL = Object.fromEntries(PRODUCT_TYPES.map((t) => [t.value, t.label]));
const ESPR_LABEL = Object.fromEntries(ESPR_STATUSES.map((t) => [t.value, t.label]));

const ESPR_COLORS = { compliant: '#16a34a', in_review: '#f59e0b', non_compliant: '#dc2626', draft: '#9ca3af' };

const TOP_CRITERIA = [
  { value: 'co2_desc', label: 'Highest CO₂ footprint', field: 'co2_kg', dir: 'desc', unit: 'kg' },
  { value: 'co2_asc', label: 'Lowest CO₂ footprint', field: 'co2_kg', dir: 'asc', unit: 'kg' },
  { value: 'recycled_desc', label: 'Highest recycled content', field: 'recycled_pct', dir: 'desc', unit: '%' },
  { value: 'durability_desc', label: 'Highest durability', field: 'durability_score', dir: 'desc', unit: '/10' },
  { value: 'repairability_desc', label: 'Highest repairability', field: 'repairability_score', dir: 'desc', unit: '/10' }
];

const iso = (d) => d.toISOString().slice(0, 10);

/** Nulls/blanks sort last regardless of direction. */
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

/** KPI tile (non-clickable variant of the dashboard card). */
function Kpi({ label, value, hint }) {
  return (
    <Card>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

// ---- breakdown table column specs per level ----
const COLUMNS = {
  product: [
    { key: 'name', header: 'Product', get: (r) => r.name, cell: (r) => r.name },
    {
      key: 'product_type',
      header: 'Type',
      get: (r) => r.product_type,
      cell: (r) => PRODUCT_TYPE_LABEL[r.product_type] ?? r.product_type ?? '—',
      csv: (r) => PRODUCT_TYPE_LABEL[r.product_type] ?? r.product_type ?? ''
    },
    {
      key: 'espr_compliance',
      header: 'ESPR',
      get: (r) => r.espr_compliance,
      cell: (r) => ESPR_LABEL[r.espr_compliance] ?? r.espr_compliance ?? '—',
      csv: (r) => ESPR_LABEL[r.espr_compliance] ?? r.espr_compliance ?? ''
    },
    { key: 'passports', header: 'Passports', get: (r) => r.passports, cell: (r) => r.passports, num: true },
    { key: 'co2_kg', header: 'Avg CO₂ (kg)', get: (r) => r.co2_kg, cell: (r) => fmtNum(r.co2_kg), csv: (r) => csvNum(r.co2_kg), num: true },
    { key: 'recycled_pct', header: 'Avg recycled (%)', get: (r) => r.recycled_pct, cell: (r) => fmtNum(r.recycled_pct, 1), csv: (r) => csvNum(r.recycled_pct, 1), num: true },
    { key: 'durability_score', header: 'Durability', get: (r) => r.durability_score, cell: (r) => fmtNum(r.durability_score, 1), csv: (r) => csvNum(r.durability_score, 1), num: true },
    { key: 'repairability_score', header: 'Repairability', get: (r) => r.repairability_score, cell: (r) => fmtNum(r.repairability_score, 1), csv: (r) => csvNum(r.repairability_score, 1), num: true }
  ],
  variant: [
    { key: 'label', header: 'Variant', get: (r) => r.label, cell: (r) => r.label ?? '—' },
    { key: 'product_name', header: 'Product', get: (r) => r.product_name, cell: (r) => r.product_name },
    { key: 'passports', header: 'Passports', get: (r) => r.passports, cell: (r) => r.passports, num: true },
    { key: 'co2_kg', header: 'Avg CO₂ (kg)', get: (r) => r.co2_kg, cell: (r) => fmtNum(r.co2_kg), csv: (r) => csvNum(r.co2_kg), num: true },
    { key: 'recycled_pct', header: 'Avg recycled (%)', get: (r) => r.recycled_pct, cell: (r) => fmtNum(r.recycled_pct, 1), csv: (r) => csvNum(r.recycled_pct, 1), num: true }
  ],
  batch: [
    { key: 'batch_number', header: 'Batch', get: (r) => r.batch_number, cell: (r) => r.batch_number ?? '—' },
    { key: 'product_name', header: 'Product', get: (r) => r.product_name, cell: (r) => r.product_name },
    { key: 'variant_label', header: 'Variant', get: (r) => r.variant_label, cell: (r) => r.variant_label ?? '—' },
    { key: 'production_date', header: 'Date', get: (r) => r.production_date, cell: (r) => fmtDate(r.production_date), csv: (r) => r.production_date ?? '' },
    { key: 'status', header: 'Status', get: (r) => r.status, cell: (r) => r.status ?? '—' },
    { key: 'co2_kg', header: 'CO₂ rolled (kg)', get: (r) => r.co2_kg, cell: (r) => fmtNum(r.co2_kg), csv: (r) => csvNum(r.co2_kg), num: true },
    { key: 'recycled_pct', header: 'Recycled rolled (%)', get: (r) => r.recycled_pct, cell: (r) => fmtNum(r.recycled_pct, 1), csv: (r) => csvNum(r.recycled_pct, 1), num: true },
    { key: 'batch_co2_kg', header: 'CO₂ recorded (own)', get: (r) => r.batch_co2_kg, cell: (r) => fmtNum(r.batch_co2_kg), csv: (r) => csvNum(r.batch_co2_kg), num: true },
    { key: 'batch_recycled_pct', header: 'Recycled recorded (%)', get: (r) => r.batch_recycled_pct, cell: (r) => fmtNum(r.batch_recycled_pct, 1), csv: (r) => csvNum(r.batch_recycled_pct, 1), num: true }
  ]
};

const LEVELS = [
  { value: 'product', label: 'By product', rowsKey: 'by_product' },
  { value: 'variant', label: 'By variant', rowsKey: 'by_variant' },
  { value: 'batch', label: 'By batch', rowsKey: 'by_batch' }
];

export function SustainabilityAnalytics() {
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
  const [sortConfig, setSortConfig] = useState({ column: 'co2_kg', direction: 'desc' });
  const [topOnly, setTopOnly] = useState(false);
  const [topCriterion, setTopCriterion] = useState('co2_desc');

  const query = useQuery({
    queryKey: ['sustainabilityAnalytics', dateFrom, dateTo, productType, esprStatus],
    enabled: isAdvanced,
    queryFn: async () => {
      const raw = await callUnboundAction('sustainabilityAnalytics', {
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

  function handleSort(column) {
    setSortConfig((cur) =>
      cur.column === column
        ? { column, direction: cur.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'desc' }
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
    if (col) {
      rows = [...rows].sort((a, b) => compareVals(col.get(a), col.get(b), sortConfig.direction));
    }
    return topOnly ? rows.slice(0, 10) : rows;
  }, [rawRows, columns, search, sortConfig, topOnly]);

  // Top-N ranking chart is always product-level.
  const topData = useMemo(() => {
    if (!data) return [];
    const crit = TOP_CRITERIA.find((c) => c.value === topCriterion);
    return [...(data.by_product ?? [])]
      .sort((a, b) => compareVals(a[crit.field], b[crit.field], crit.dir))
      .filter((p) => p[crit.field] != null)
      .slice(0, 10)
      .map((p) => ({ label: p.name, value: p[crit.field] }));
  }, [data, topCriterion]);

  const topUnit = TOP_CRITERIA.find((c) => c.value === topCriterion).unit;
  const topFormat = (v) => (topUnit === '/10' ? `${fmtNum(v, 1)} /10` : topUnit === '%' ? `${fmtNum(v, 1)} %` : `${fmtNum(v)} kg`);

  function handleExport() {
    const cols = columns.map((c) => ({ key: c.key, label: c.header }));
    const rows = visibleRows.map((r) =>
      Object.fromEntries(columns.map((c) => [c.key, c.csv ? c.csv(r) : c.get(r) ?? '']))
    );
    exportCsv(`sustainability-${level}-${dateFrom}_${dateTo}.csv`, cols, rows);
  }

  if (!isAdvanced) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sustainability reports" />
        <Banner kind="error">You don&apos;t have permission to view sustainability reports.</Banner>
      </div>
    );
  }

  const kpis = data?.kpis;
  const espr = data?.espr_distribution ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Sustainability reports" subtitle="Cradle-to-gate footprint, recycled content & ESPR readiness" />
        <Link to="/reports">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Reports
          </Button>
        </Link>
      </div>

      {/* Filters */}
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

      {query.isError && <Banner kind="error">Could not load the analytics. Please try again.</Banner>}
      {query.isLoading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : !data ? null : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Passports analysed" value={kpis.passports} hint={`${kpis.products} products · ${kpis.variants} variants · ${kpis.batches} batches`} />
            <Kpi label="Avg CO₂ / passport" value={`${fmtNum(kpis.avg_co2_kg)} kg`} hint="Cradle-to-gate (rolled up)" />
            <Kpi label="Σ CO₂ footprint" value={`${fmtNum(kpis.total_co2_kg)} kg`} hint="Sum of per-unit footprints" />
            <Kpi label="Avg recycled content" value={`${fmtNum(kpis.avg_recycled_pct, 1)} %`} />
            <Kpi label="ESPR compliant" value={`${fmtNum(kpis.espr_compliant_pct, 1)} %`} hint={`${espr.compliant ?? 0} of ${kpis.products} products`} />
            <Kpi label="Avg durability" value={`${fmtNum(kpis.avg_durability, 1)} /10`} />
            <Kpi label="Avg repairability" value={`${fmtNum(kpis.avg_repairability, 1)} /10`} />
            <Kpi label="Incomplete data" value={kpis.incomplete} hint="Passports with unresolved BOM edges" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="text-sm font-semibold text-ink">Avg CO₂ footprint per month (kg)</h3>
              <p className="mb-3 text-xs text-ink-muted">Bucketed by production date</p>
              <BarChart
                data={(data.time_series ?? []).map((t) => ({ label: t.month, value: t.avg_co2_kg ?? 0 }))}
                color="#16a34a"
                format={(v) => fmtNum(v, 1)}
              />
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-ink">Avg recycled content per month (%)</h3>
              <p className="mb-3 text-xs text-ink-muted">Bucketed by production date</p>
              <BarChart
                data={(data.time_series ?? []).map((t) => ({ label: t.month, value: t.avg_recycled_pct ?? 0 }))}
                color="#0ea5e9"
                format={(v) => fmtNum(v, 1)}
              />
            </Card>
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-ink">ESPR compliance mix</h3>
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
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">Top 10 products</h3>
                <Select
                  className="max-w-[16rem]"
                  value={topCriterion}
                  onChange={(e) => setTopCriterion(e.target.value)}
                  options={TOP_CRITERIA.map((c) => ({ value: c.value, label: c.label }))}
                />
              </div>
              <HBars data={topData} color="#16a34a" format={topFormat} empty="No products in this period." />
            </Card>
          </div>

          {/* Breakdown table */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg border border-black/10 p-0.5">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLevel(l.value)}
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
              CO₂ and recycled figures are the cradle-to-gate rollup across the bill of materials. A batch&apos;s
              own recorded values (own production) are shown separately at batch level. Figures support internal
              monitoring; confirm regulatory suitability with your compliance advisor.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
