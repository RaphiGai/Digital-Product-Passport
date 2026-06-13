/**
 * Client-side printable QR labels (US6.13).
 *
 * There is no object store / PDF service in this stack, so labels are rendered in
 * a self-contained print window and sent to the OS print dialog via window.print().
 * QR images are loaded from the public, auth-free endpoint /public/dpp/{token}/qr.png
 * (see srv/handlers/public-handler.js#getQRImage). The new window has no base URL,
 * so the image src must be absolute (window.location.origin + path).
 *
 * @typedef {Object} QrLabel
 * @property {string} token         QR token (required — entries without one are skipped)
 * @property {string} [name]        product name
 * @property {string} [brand]
 * @property {string} [product_id]
 * @property {string} [batch_number]
 * @property {string} [serial_number]
 * @property {string} [upi]
 * @property {string} [dpp_id]
 * @property {string} [website]   company website shown on the label
 */

const FIELDS = [
  ['Product ID', 'product_id'],
  ['Batch', 'batch_number'],
  ['Serial', 'serial_number'],
  ['UPI', 'upi'],
  ['DPP ID', 'dpp_id']
];

function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function labelHtml(label, origin) {
  const qr = `<img class="qr" src="${origin}/public/dpp/${encodeURIComponent(label.token)}/qr.png" alt="QR code" />`;
  const title = [label.name, label.brand].filter(Boolean).map(escapeHtml).join(' · ');
  const rows = FIELDS.filter(([, key]) => label[key])
    .map(
      ([lbl, key]) =>
        `<div class="row"><span class="k">${lbl}</span><span class="v">${escapeHtml(label[key])}</span></div>`
    )
    .join('');
  // Footer: the company website plus the readable token (a human-readable fallback
  // for when the QR cannot be scanned).
  const websiteLine = label.website ? `<div class="url">${escapeHtml(label.website)}</div>` : '';
  const manual = `<div class="manual">${websiteLine}<div class="token">Token: ${escapeHtml(label.token)}</div></div>`;
  return `<div class="label">${title ? `<div class="title">${title}</div>` : ''}${qr}<div class="fields">${rows}</div>${manual}</div>`;
}

/**
 * Open a print window with one QR label per entry and trigger the print dialog.
 * @param {QrLabel[]} labels
 * @param {{ title?: string }} [opts]
 * @returns {boolean} false if there is nothing to print or the popup was blocked
 */
export function printLabels(labels, { title = 'QR labels' } = {}) {
  const printable = (labels || []).filter((l) => l && l.token);
  if (!printable.length) return false;

  const origin = window.location.origin;
  const w = window.open('', '_blank');
  if (!w) return false; // popup blocked

  const body = printable.map((l) => labelHtml(l, origin)).join('');
  const doc = `<!doctype html><html><head><meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; margin: 12mm; color: #111; }
      .sheet { display: flex; flex-wrap: wrap; gap: 8mm; }
      .label { width: 55mm; border: 1px solid #cbd5e1; border-radius: 3mm; padding: 4mm; text-align: center; page-break-inside: avoid; }
      .title { font-size: 10pt; font-weight: 600; margin-bottom: 2mm; }
      .qr { width: 34mm; height: 34mm; object-fit: contain; }
      .fields { margin-top: 2mm; text-align: left; font-family: ui-monospace, monospace; font-size: 7.5pt; }
      .row { display: flex; justify-content: space-between; gap: 2mm; padding: 0.3mm 0; }
      .row .k { color: #64748b; }
      .row .v { word-break: break-all; text-align: right; }
      .manual { margin-top: 2mm; padding-top: 1.5mm; border-top: 1px dashed #cbd5e1; text-align: left; font-size: 6.5pt; color: #334155; }
      .manual .url { font-family: ui-monospace, monospace; word-break: break-all; }
      .manual .token { margin-top: 0.5mm; font-family: ui-monospace, monospace; font-weight: 600; word-break: break-all; }
      @media print { body { margin: 8mm; } }
    </style></head>
    <body>
      <div class="sheet">${body}</div>
      <script>window.onload=function(){try{window.focus();}catch(e){}window.print();};</script>
    </body></html>`;

  w.document.open();
  w.document.write(doc);
  w.document.close();
  return true;
}
