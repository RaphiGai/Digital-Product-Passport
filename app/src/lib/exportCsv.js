/**
 * Client-side CSV export — no dependency. Builds a CSV from row objects + a column
 * spec and triggers a browser download via a Blob URL.
 *
 * Tuned for German Excel: `;` list separator (so comma decimals stay in one cell),
 * UTF-8 BOM (so umlauts/€/CO₂ render) and CRLF line endings. A real `.xlsx` would
 * need a library (out of scope; overlaps with the deferred US5.12 export work).
 */

// UTF-8 byte-order mark, prepended so Excel detects UTF-8. Built from the escape
// (not a literal char) to keep the source free of irregular whitespace.
const BOM = '\uFEFF';

/** Escape one CSV cell: quote if it contains the separator, a quote or a newline. */
function csvCell(value) {
  if (value == null) return '';
  const s = String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {string} filename                          e.g. 'sustainability-products.csv'
 * @param {{ key: string, label: string }[]} columns column order + header labels
 * @param {Record<string, unknown>[]} rows           values keyed by column.key
 */
export function exportCsv(filename, columns, rows) {
  const sep = ';';
  const header = columns.map((c) => csvCell(c.label)).join(sep);
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(sep)).join('\r\n');
  const csv = `${BOM}${header}\r\n${body}\r\n`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
