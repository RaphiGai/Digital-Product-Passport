'use strict';

/**
 * DB-free catalogue fixture for unit tests: parses the REAL seed CSVs
 * (db/data/dpp-AttributeDefinitions.csv / dpp-AttributeSections.csv) into the
 * exact shape srv/lib/catalogue.js#loadCatalogue returns. Unit tests therefore
 * run against the same definitions the app deploys — and the parity test pins
 * those seeds against the legacy hardcoded catalogues, closing the loop.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'db', 'data');

function parseCsv(file) {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8').replace(/^﻿/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split(';');
  return lines.slice(1).map((line) => {
    const cells = line.split(';');
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

const bool = (v) => v === 'true';
const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
const strOrNull = (v) => (v === '' || v == null ? null : v);

/**
 * Build the merged catalogue for a category from the seed CSVs (core ∪ category),
 * mirroring loadCatalogue()'s output shape. Default: 'textiles'.
 */
function catalogueFixture(categoryCode = 'textiles') {
  const defRows = parseCsv('dpp-AttributeDefinitions.csv');
  const sectionRows = parseCsv('dpp-AttributeSections.csv');

  const inScope = (r) => r.category_code === '' || r.category_code === categoryCode;

  const sections = sectionRows
    .filter(inScope)
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map((s) => ({
      key: s.key,
      title: s.title,
      icon: strOrNull(s.icon),
      sort_order: Number(s.sort_order) || 0,
      show_on_consumer: s.show_on_consumer !== 'false',
    }));
  const sectionById = Object.fromEntries(
    sectionRows.map((s) => [s.ID, s])
  );

  const fields = defRows
    .filter((d) => inScope(d) && d.is_active !== 'false')
    .sort((a, b) => {
      const sa = Number(sectionById[a.section_ID]?.sort_order) || 0;
      const sb = Number(sectionById[b.section_ID]?.sort_order) || 0;
      if (sa !== sb) return sa - sb;
      return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
    })
    .map((d) => ({
      key: d.key,
      level: d.level,
      storage: d.storage,
      label: d.label,
      description: strOrNull(d.description),
      datatype: d.datatype,
      widget: strOrNull(d.widget),
      section: sectionById[d.section_ID]?.key ?? null,
      grp: strOrNull(d.grp),
      sort_order: Number(d.sort_order) || 0,
      unit: strOrNull(d.unit),
      min_value: numOrNull(d.min_value),
      max_value: numOrNull(d.max_value),
      max_length: numOrNull(d.max_length),
      regex: strOrNull(d.regex),
      options: d.options ? JSON.parse(d.options) : null,
      mandatory: bool(d.mandatory),
      fix_hint: strOrNull(d.fix_hint),
      validation_section: strOrNull(d.validation_section),
      visibility: d.default_visibility || 'public',
      locked: bool(d.locked_public),
    }));

  const byLevel = { product: [], variant: [], batch: [] };
  for (const f of fields) byLevel[f.level].push(f);

  return { category: categoryCode, sections, fields, byLevel };
}

module.exports = { catalogueFixture, parseCsv };
