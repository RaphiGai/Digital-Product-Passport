import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckSquare } from 'lucide-react';
import { odataList } from '@/api/client';
import { DataTable } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
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
      map.set(vid, { id: vid, variant: line.parent, product: line.parent?.product, lines: [] });
    }
    map.get(vid).lines.push(line);
  }
  return [...map.values()];
}

export function Boms() {
  const [search, setSearch] = useState('');
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

  const groups = groupByVariant(data ?? []);

  const filtered = search.trim()
    ? groups.filter((g) => {
        const q = search.toLowerCase();
        return (
          g.product?.name?.toLowerCase().includes(q) ||
          g.product?.brand?.toLowerCase().includes(q) ||
          variantLabel(g.variant).toLowerCase().includes(q)
        );
      })
    : groups;

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() { setSelectedIds(new Set(filtered.map((g) => g.id))); }
  function deselectAll() { setSelectedIds(new Set()); }
  function exitSelectionMode() { setSelectionMode(false); setSelectedIds(new Set()); }

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

  function handleExport(format = 'xlsx') {
    exportData([{ name: 'BOM', rows: bomRows(filtered) }], 'bom-export', format);
  }

  function handleExportSelected(format = 'xlsx') {
    const selected = filtered.filter((g) => selectedIds.has(g.id));
    exportData([{ name: 'BOM', rows: bomRows(selected) }], 'bom-export', format);
    exitSelectionMode();
  }

  const columns = useMemo(() => {
    const base = [
      {
        header: 'BOM',
        cell: (g) =>
          g.variant ? (
            <Link
              to={`/products/${g.product?.ID}/variants/${g.variant.ID}/view`}
              className="font-medium text-ink hover:text-brand-700"
            >
              BOM for {variantLabel(g.variant)}
            </Link>
          ) : (
            '—'
          )
      },
      {
        header: 'Product',
        cell: (g) =>
          g.product ? (
            <Link to={`/products/${g.product.ID}`} className="text-brand-700 hover:underline">
              {g.product.name}
            </Link>
          ) : (
            '—'
          )
      },
      {
        header: 'Brand',
        cell: (g) => g.product?.brand ?? '—'
      },
      {
        header: 'Components',
        cell: (g) => g.lines.length
      },
      {
        header: 'Variant status',
        cell: (g) => g.variant?.status ? <StatusBadge status={g.variant.status} /> : '—'
      }
    ];

    if (!selectionMode) return base;

    return [
      {
        header: '',
        cell: (g) => (
          <input
            type="checkbox"
            checked={selectedIds.has(g.id)}
            onChange={() => toggleSelect(g.id)}
            className="h-4 w-4 cursor-pointer accent-brand-600"
          />
        )
      },
      ...base
    ];
  }, [selectionMode, selectedIds]);

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
              <ExportDropdown onExport={handleExport} label="Export All" disabled={!filtered.length} />
              <Button variant="outline" onClick={() => setSelectionMode(true)} disabled={!filtered.length}>
                <CheckSquare className="h-4 w-4" /> Select
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-sm">
        <input
          type="search"
          placeholder="Search by product, brand or variant…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-black/15 px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        loading={isLoading}
        empty="No BOMs found."
      />
    </div>
  );
}
