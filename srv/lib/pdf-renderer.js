'use strict';

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

/**
 * Stream a PDFKit doc into a Buffer.
 */
function pdfToBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/**
 * Render the aggregated DPP snapshot as a 1-page consumer PDF (US7.17).
 */
async function renderDPPasPDF(snapshot) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  doc.fontSize(20).text('Digital Product Passport', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#666')
    .text(`ID: ${snapshot.dpp?.id || ''}    Version: ${snapshot.dpp?.version || ''}    Captured: ${snapshot.captured_at || ''}`, { align: 'center' });
  doc.moveDown(1);
  doc.fillColor('black');

  const section = (title) => {
    doc.moveDown(0.6);
    doc.fontSize(13).fillColor('#1a5e9c').text(title);
    doc.moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).strokeColor('#1a5e9c').stroke();
    doc.moveDown(0.4);
    doc.fillColor('black').fontSize(10);
  };

  const kv = (label, value) => {
    if (value === null || value === undefined || value === '') return;
    doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(String(value));
  };

  if (snapshot.product) {
    section('Product Model');
    kv('Name',              snapshot.product.name);
    kv('Brand',             snapshot.product.brand);
    kv('Category',          snapshot.product.category);
    kv('Model',             snapshot.product.model);
    kv('Description',       snapshot.product.description);
    kv('Fibre Composition', snapshot.product.fibre_composition);
    kv('Care',              snapshot.product.care_instructions);
    kv('Repair',            snapshot.product.repair_instructions);
    kv('Disposal',          snapshot.product.disposal_instructions);
    kv('Country of Origin', snapshot.product.country_of_origin);
  }

  if (snapshot.variant) {
    section('Variant');
    kv('Color', snapshot.variant.color);
    kv('Size',  snapshot.variant.size);
    kv('SKU',   snapshot.variant.sku);
    kv('GTIN',  snapshot.variant.gtin);
  }

  if (snapshot.batch) {
    section('Batch');
    kv('Batch Number',         snapshot.batch.batch_number);
    kv('Production Date',      snapshot.batch.production_date);
    kv('Country of Origin',    snapshot.batch.country_of_origin);
    kv('Production Stage',     snapshot.batch.production_stage);
    kv('CO₂ Footprint (kg)',   snapshot.batch.co2_footprint_kg);
    kv('Recycled Content (%)', snapshot.batch.recycled_content_pct);
  }

  if (snapshot.item) {
    section('Item Identity');
    kv('Serial Number', snapshot.item.serial_number);
    kv('UPI',           snapshot.item.upi);
    kv('Status',        snapshot.item.item_status);
  }

  if (Array.isArray(snapshot.bom) && snapshot.bom.length) {
    section('Bill of Materials');
    snapshot.bom.forEach((b) => {
      doc.font('Helvetica').text(`• ${b.component_role || 'Component'}: ${b.quantity ?? ''} ${b.unit ?? ''} (component_ID=${b.component_ID})`);
    });
  }

  if (snapshot.sustainability) {
    section('Sustainability');
    kv('CO₂ (kg)',             snapshot.sustainability.co2_footprint_kg);
    kv('Water (l)',            snapshot.sustainability.water_usage_l);
    kv('Energy (kWh)',         snapshot.sustainability.energy_usage_kwh);
    kv('Recycled Content (%)', snapshot.sustainability.recycled_content_overall);
    kv('Durability Score',     snapshot.sustainability.durability_score);
    kv('Repairability Score',  snapshot.sustainability.repairability_score);
  }

  if (Array.isArray(snapshot.certifications) && snapshot.certifications.length) {
    section('Certifications');
    snapshot.certifications.forEach((c) => {
      doc.font('Helvetica').text(`• ${c.standard || c.certificate_number}: valid ${c.valid_from || '—'} to ${c.valid_until || '—'}`);
    });
  }

  return pdfToBuffer(doc);
}

/**
 * Printable QR label for a Product Item (US6.13). Single-page A6 layout
 * with brand/model/serial + the QR code itself.
 */
async function renderQRLabel({ productName, brand, model, serialNumber, upi, qrPayloadUrl }) {
  const doc = new PDFDocument({ size: 'A6', margin: 12 });

  const qrPng = await QRCode.toBuffer(qrPayloadUrl || '', { type: 'png', margin: 1, scale: 5 });

  doc.fontSize(11).font('Helvetica-Bold').text(productName || 'Product', { align: 'center' });
  if (brand || model) {
    doc.fontSize(8).font('Helvetica').text([brand, model].filter(Boolean).join(' · '), { align: 'center' });
  }
  doc.moveDown(0.3);
  doc.image(qrPng, { fit: [180, 180], align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(8).font('Helvetica').text(`UPI: ${upi || ''}`, { align: 'center' });
  if (serialNumber) doc.fontSize(8).text(`S/N: ${serialNumber}`, { align: 'center' });

  return pdfToBuffer(doc);
}

module.exports = { renderDPPasPDF, renderQRLabel };
