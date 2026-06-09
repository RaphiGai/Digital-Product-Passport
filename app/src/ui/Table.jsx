import { Card } from './Card';

/**
 * Clickable column header that drives a `{ column, direction }` sort state.
 * Shared by the list pages so search + per-column sort behave identically.
 * @param {{
 *   label: string, column: string,
 *   sortConfig: { column: string, direction: 'asc' | 'desc' },
 *   onSort: (column: string) => void
 * }} props
 */
export function SortHeader({ label, column, sortConfig, onSort }) {
  const isActive = sortConfig.column === column;
  const icon = !isActive ? '↕' : sortConfig.direction === 'asc' ? '↑' : '↓';

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="inline-flex items-center gap-1 font-medium text-ink hover:text-brand-700"
    >
      {label}
      <span className="text-xs text-ink-muted">{icon}</span>
    </button>
  );
}

/**
 * @template T
 * @typedef {Object} Column
 * @property {string} header
 * @property {(row: T) => React.ReactNode} cell
 */

/**
 * Minimal data table used by the list pages.
 * @template T
 * @param {{ columns: Column<T>[], rows: T[], empty?: string, loading?: boolean }} props
 */
export function DataTable({ columns, rows, empty = 'No records found.', loading }) {
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/5 text-left text-xs uppercase tracking-wider text-ink-muted">
            {columns.map((c, i) => (
              <th key={i} className="px-5 py-3 font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-8 text-center text-ink-muted">
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-8 text-center text-ink-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, ri) => (
              <tr key={ri} className="border-b border-black/5 last:border-0 hover:bg-gray-50">
                {columns.map((c, ci) => (
                  <td key={ci} className="px-5 py-3.5 text-ink">
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}
