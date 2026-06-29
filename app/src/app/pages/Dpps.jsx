import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckSquare } from 'lucide-react';
import { odataList } from '@/api/client';
import { DataTable, SortHeader } from '@/ui/Table';
import { StatusBadge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { ExportDropdown } from '@/ui/ExportDropdown';
import { PageHeader } from './ComingSoon';
import { exportData } from '@/lib/exportExcel';

const variantLabel = (v) =>
  v ? [v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.ID : null;

const fmtDate = (v) => {
  if (!v) return '';
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(v).slice(0, 10);
};

function getSortValue(d, column) {
  switch (column) {
    case 'product': return d.product?.name ?? '';
    case 'variant': return variantLabel(d.variant || d.batch?.variant) ?? '';
    case 'batch':   return d.batch?.batch_number ?? '';
    default:        return d[column] ?? '';
  }
}

function toExportRow(d) {
  return {
    'Passport ID':   d.ID,
    Product:         d.product?.name ?? '',
    Variant:         variantLabel(d.variant || d.batch?.variant) ?? '',
    'Batch Number':  d.batch?.batch_number ?? '',
    Type:            d.dpp_type ?? '',
    Version:         d.current_version ?? '',
    Visibility:      d.visibility ?? '',
    Status:          d.status ?? '',
    Created:         fmtDate(d.createdAt),
  };
}

export function Dpps() {
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ column: 'createdAt', direction: 'desc' });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['DPPs', 'list'],
    queryFn: () =>
      odataList('DPPs', {
        expand: ['product', 'variant', 'batch($expand=variant)', 'item'],
        orderby: 'createdAt desc',
        top: 100
      })
  });

  function handleSort(column) {
    setSortConfig((current) =>
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  }

  const filteredDpps = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data ?? [];
    return (data ?? []).filter((d) => {
      const searchableText = [
        d.ID, d.product?.name, d.product_ID,
        variantLabel(d.variant || d.batch?.variant),
        d.batch?.batch_number, d.item?.serial_number, d.item?.upi,
        d.dpp_type, d.visibility, d.status
      ].filter(Boolean).join(' ').toLowerCase();
      return searchableText.includes(query);
    });
  }, [data, search]);

  const sortedDpps = useMemo(() => {
    return [...filteredDpps].sort((a, b) => {
      const aValue = String(getSortValue(a, sortConfig.column)).toLowerCase();
      const bValue = String(getSortValue(b, sortConfig.column)).toLowerCase();
      const result = aValue.localeCompare(bValue, 'en', { numeric: true, sensitivity: 'base' });
      return sortConfig.direction === 'asc' ? result : -result;
    });
  }, [filteredDpps, sortConfig]);

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll()   { setSelectedIds(new Set(sortedDpps.map((d) => d.ID))); }
  function deselectAll() { setSelectedIds(new Set()); }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function handleExportAll(format = 'xlsx') {
    exportData([{ name: 'DPPs', rows: sortedDpps.map(toExportRow) }], 'dpps-export', format);
  }

  function handleExportSelected(format = 'xlsx') {
    const selected = sortedDpps.filter((d) => selectedIds.has(d.ID));
    exportData([{ name: 'DPPs', rows: selected.map(toExportRow) }], 'dpps-export', format);
    exitSelectionMode();
  }

  const columns = useMemo(() => {
    const base = [
      {
        header: <SortHeader label="Passport" column="ID" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => (
          <Link to={`/dpps/${d.ID}`} className="font-mono text-xs text-ink hover:text-brand-700">
            {d.ID}
          </Link>
        )
      },
      {
        header: <SortHeader label="Product" column="product" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) =>
          d.product?.name ? (
            <Link to={`/products/${d.product_ID}`} className="text-ink hover:text-brand-700">
              {d.product.name}
            </Link>
          ) : '—'
      },
      {
        header: <SortHeader label="Variant" column="variant" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => variantLabel(d.variant || d.batch?.variant) ?? '—'
      },
      {
        header: <SortHeader label="Batch" column="batch" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => d.batch?.batch_number ?? '—'
      },
      {
        header: <SortHeader label="Created" column="createdAt" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => fmtDate(d.createdAt)
      },
      {
        header: <SortHeader label="Type" column="dpp_type" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => d.dpp_type
      },
      {
        header: <SortHeader label="Version" column="current_version" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => d.current_version ?? '—'
      },
      {
        header: <SortHeader label="Visibility" column="visibility" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => <StatusBadge status={d.visibility} />
      },
      {
        header: <SortHeader label="Status" column="status" sortConfig={sortConfig} onSort={handleSort} />,
        cell: (d) => <StatusBadge status={d.status} />
      }
    ];

    if (!selectionMode) return base;

    return [
      {
        header: '',
        cell: (d) => (
          <input
            type="checkbox"
            checked={selectedIds.has(d.ID)}
            onChange={() => toggleSelect(d.ID)}
            className="h-4 w-4 cursor-pointer accent-brand-600"
          />
        )
      },
      ...base
    ];
  }, [sortConfig, selectionMode, selectedIds]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Digital product passports" subtitle="All passports across your products" />

        <div className="flex items-center gap-2">
          {selectionMode ? (
            <>
              <span className="text-sm text-ink-muted">{selectedIds.size} selected</span>
              <Button variant="outline" size="sm" onClick={selectAll}>Select all</Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>Deselect all</Button>
              <ExportDropdown onExport={handleExportSelected} label="Export selected" disabled={selectedIds.size === 0} size="sm" />
              <Button variant="ghost" size="sm" onClick={exitSelectionMode}>Cancel</Button>
            </>
          ) : (
            <>
              <ExportDropdown onExport={handleExportAll} label="Export All" disabled={!sortedDpps.length} />
              <Button variant="outline" onClick={() => setSelectionMode(true)} disabled={!sortedDpps.length}>
                <CheckSquare className="h-4 w-4" /> Select
              </Button>
            </>
          )}
        </div>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search passports..."
        className="w-full rounded-lg border border-black/10 bg-white px-4 py-2 text-sm text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />

      <DataTable columns={columns} rows={sortedDpps} loading={isLoading} empty="No passports found." />
    </div>
  );
}
