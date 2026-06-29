import * as XLSX from 'xlsx';

/**
 * Download rows as an .xlsx file with one or more sheets.
 * @param {Array<{ name: string, rows: object[] }>} sheets
 * @param {string} filename  without extension
 */
export function exportToExcel(sheets, filename) {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows);
    autoWidth(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Download rows as a .csv file.
 * Single sheet → one CSV file. Multiple sheets → sections separated by a blank
 * line and a "# Sheet name" header so the file stays readable in any text tool.
 * @param {Array<{ name: string, rows: object[] }>} sheets
 * @param {string} filename  without extension
 */
export function exportToCsv(sheets, filename) {
  const populated = sheets.filter((s) => s.rows.length > 0);
  let csv;
  if (populated.length === 1) {
    csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(populated[0].rows));
  } else {
    csv = populated
      .map(({ name, rows }) => `# ${name}\n${XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows))}`)
      .join('\n\n');
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export in the given format ('xlsx' | 'csv').
 * @param {Array<{ name: string, rows: object[] }>} sheets
 * @param {string} filename
 * @param {'xlsx'|'csv'} format
 */
export function exportData(sheets, filename, format) {
  if (format === 'csv') exportToCsv(sheets, filename);
  else exportToExcel(sheets, filename);
}

/** Widen columns to fit the longest value in each column. */
function autoWidth(ws, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const isFieldValue = keys.length === 2 && keys[0] === 'Field' && keys[1] === 'Value';

  if (isFieldValue) {
    const fieldW = Math.max(...rows.map((r) => String(r.Field ?? '').length), 10) + 2;
    const valueW = Math.max(...rows.map((r) => String(r.Value ?? '').length), 10) + 2;
    ws['!cols'] = [{ wch: fieldW }, { wch: valueW }];
  } else {
    const colWidths = keys.map((k) => {
      const maxData = Math.max(...rows.map((r) => String(r[k] ?? '').length));
      return Math.min(Math.max(maxData, k.length) + 2, 60);
    });
    ws['!cols'] = colWidths.map((w) => ({ wch: w }));
  }
}
