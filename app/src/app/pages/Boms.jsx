import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckSquare } from 'lucide-react';
import { odataList } from '@/api/client';
import { SortHeader } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageHeader } from './ComingSoon';
import { ExportDropdown } from '@/ui/ExportDropdown';
import { exportData } from '@/lib/exportExcel';

const variantLabel = (v) =>
  v ? [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID : '—';

function groupByVariant(lines) {
  const map = new Map();

  for (const line of lines) {
    const vid = line.parent_ID;

    if (!map.has(vid)) {
      map.set(vid, {
        variant: line.parent,
        product: line.parent?.product,
        lines: []
      });
    }

    map.get(vid).lines.push(line);
  }

  return [...map.values()];
}

// The raw ProductBOMs line IDs of a variant's BOM (shown as a tooltip / used in search).
function bomIds(g) {
  return g.lines.map((l) => l.ID).filter(Boolean).join(', ');
}

// A BOM is the set of lines of exactly one variant → derive a single, convention-
// consistent identifier from the variant ID (prod-… / var-… → bom-…). The real
// ProductBOMs line IDs (also bom-…) stay available as a tooltip and in search.
const bomKey = (g) => {
  const vid = g.variant?.ID || '';
  if (!vid) return '';
  return /^var-/.test(vid) ? vid.replace(/^var-/, 'bom-') : `bom-${vid}`;
};

// Stable identity for a BOM group — also used as the row key and the selection key.
const bomGroupId = (g) => g.variant?.ID ?? bomIds(g);

function getSortValue(g, column) {
  if (column === 'bom_id') return bomKey(g);
  if (column === 'bom') return variantLabel(g.variant);
  if (column === 'product') return g.product?.name ?? '';
  if (column === 'brand') return g.product?.brand ?? '';
  if (column === 'components') return g.lines.length;
  if (column === 'status') return g.variant?.status ?? '';
  return '';
}

// Flatten BOM groups to one export row per component line.
function bomRows(groups) {
  return groups.flatMap((g) =>
    g.lines.map((line) => ({
      Product: g.product?.name ?? '—',
      Variant: variantLabel(g.variant),
      Component: line.component_name ?? '—',
      Category: line.component_category ?? '',
      Role: line.component_role ?? '',
      Quantity: line.quantity ?? '',
      Unit: line.unit ?? '',
      'CO₂ (kg)': line.ext_co2_footprint ?? '',
      'Recycled Content (%)': line.ext_recycled_content_pct ?? '',
      'External DPP URL': line.external_dpp_url ?? '',
    }))
  );
}

export function Boms() {
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({
    column: 'product',
    direction: 'asc'
  });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['ProductBOMs', 'all'],
    queryFn: () =>
      odataList('ProductBOMs', {
        expand: ['parent($expand=product)'],
        top: 1000
      })
  });

  const groups = useMemo(() => groupByVariant(data ?? []), [data]);

  function handleSort(column) {
    setSortConfig((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return groups;

    return groups.filter((g) =>
      [
        bomKey(g),
        g.variant?.ID,
        bomIds(g),
        variantLabel(g.variant),
        g.product?.name,
        g.product?.brand,
        g.variant?.status
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [groups, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aValue = String(getSortValue(a, sortConfig.column)).toLowerCase();
      const bValue = String(getSortValue(b, sortConfig.column)).toLowerCase();

      const result = aValue.localeCompare(bValue, 'en', {
        numeric: true,
        sensitivity: 'base'
      });

      return sortConfig.direction === 'asc' ? result : -result;
    });
  }, [filtered, sortConfig]);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() { setSelectedIds(new Set(sorted.map(bomGroupId))); }
  function deselectAll() { setSelectedIds(new Set()); }
  function exitSelectionMode() { setSelectionMode(false); setSelectedIds(new Set()); }

  function handleExport(format = 'xlsx') {
    exportData([{ name: 'BOM', rows: bomRows(sorted) }], 'bom-export', format);
  }

  function handleExportSelected(format = 'xlsx') {
    const selected = sorted.filter((g) => selectedIds.has(bomGroupId(g)));
    exportData([{ name: 'BOM', rows: bomRows(selected) }], 'bom-export', format);
    exitSelectionMode();
  }

  const gridCols = selectionMode
    ? 'grid-cols-[40px_1.5fr_2fr_1.5fr_1fr_1fr_1fr]'
    : 'grid-cols-[1.5fr_2fr_1.5fr_1fr_1fr_1fr]';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Bill of materials"
          subtitle={`${groups.length} variant BOM${groups.length !== 1 ? 's' : ''} across all products`}
        />
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <span className="text-sm text-ink-muted">{selectedIds.size} selected</span>
              <Button variant="outline" size="sm" onClick={selectAll}>Select all</Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>Deselect all</Button>
              <ExportDropdown
                onExport={handleExportSelected}
                label="Export selected"
                disabled={selectedIds.size === 0}
                size="sm"
              />
              <Button variant="ghost" size="sm" onClick={exitSelectionMode}>Cancel</Button>
            </>
          ) : (
            <>
              <ExportDropdown onExport={handleExport} label="Export All" disabled={!sorted.length} />
              <Button variant="outline" onClick={() => setSelectionMode(true)} disabled={!sorted.length}>
                <CheckSquare className="h-4 w-4" /> Select
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-sm">
        <input
          type="search"
          placeholder="Search by BOM ID, product, brand or variant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-black/15 px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <Card className="p-0">
        <div className={`grid ${gridCols} gap-4 border-b border-black/5 px-5 py-2.5 text-xs uppercase tracking-wider text-ink-muted`}>
          {selectionMode && <span />}
          <SortHeader label="BOM ID" column="bom_id" sortConfig={sortConfig} onSort={handleSort} />
          <SortHeader label="BOM" column="bom" sortConfig={sortConfig} onSort={handleSort} />
          <SortHeader label="Product" column="product" sortConfig={sortConfig} onSort={handleSort} />
          <SortHeader label="Brand" column="brand" sortConfig={sortConfig} onSort={handleSort} />
          <SortHeader label="Components" column="components" sortConfig={sortConfig} onSort={handleSort} />
          <SortHeader label="Variant status" column="status" sortConfig={sortConfig} onSort={handleSort} />
        </div>

        {isLoading ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">No BOMs found.</p>
        ) : (
          sorted.map((g) => {
            const id = bomGroupId(g);
            return (
              <div
                key={id}
                className={`grid ${gridCols} items-center gap-4 border-b border-black/5 px-5 py-3 text-sm last:border-0`}
              >
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(id)}
                    onChange={() => toggleSelect(id)}
                    className="h-4 w-4 cursor-pointer accent-brand-600"
                  />
                )}

                <span className="font-mono text-xs text-ink-muted" title={bomIds(g) || undefined}>
                  {bomKey(g) || '—'}
                </span>

                <span>
                  {g.variant ? (
                    <Link
                      to={`/products/${g.product?.ID}/variants/${g.variant.ID}/view`}
                      className="font-medium text-ink hover:text-brand-700"
                    >
                      BOM for {variantLabel(g.variant)}
                    </Link>
                  ) : (
                    '—'
                  )}
                </span>

                <span>
                  {g.product ? (
                    <Link to={`/products/${g.product.ID}`} className="text-brand-700 hover:underline">
                      {g.product.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </span>

                <span>{g.product?.brand ?? '—'}</span>
                <span>{g.lines.length}</span>
                <span>{g.variant?.status ? <StatusBadge status={g.variant.status} /> : '—'}</span>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
