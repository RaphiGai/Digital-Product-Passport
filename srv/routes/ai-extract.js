'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('dpp/ai');
const express = require('express');
const session = require('../lib/session');
const gemini = require('../lib/gemini');
const rateLimit = require('../lib/ai-ratelimit');

/**
 * Document-extraction endpoint for the AI assistant.
 *
 *   POST /ai/extract?entity=product|variant|batch[&hint=...]
 *   Body: raw file bytes (application/pdf | image/png | image/jpeg)
 *
 * Mounted from srv/server.js `cds.on('bootstrap')` — OUTSIDE the OData body-size
 * limit and the CAP auth gate — so it can accept larger files and do its own
 * cookie-based auth (like /auth/*). Gemini reads the file natively (no OCR) and
 * returns a structured pre-fill draft. The file is NOT persisted.
 *
 * DSGVO/logging: only the entity, mime type, byte size, latency and outcome are
 * logged — never the file bytes or the extracted field values.
 */

const COOKIE_NAME = 'dpp_session';
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);

const STRING = { type: 'STRING' };
const NUMBER = { type: 'NUMBER' };

// Response schemas mirror the propose* tool field names so an extracted draft
// flows straight into the same create path. All fields optional — the model
// fills only what the document actually contains.
const SCHEMAS = {
  product: {
    type: 'OBJECT',
    properties: {
      name: STRING, brand: STRING, category: STRING, product_type: STRING,
      country_of_origin: STRING, fibre_composition: STRING, care_instructions: STRING,
      repair_instructions: STRING, disposal_instructions: STRING, substances_of_concern: STRING,
      espr_compliance: STRING, description: STRING, gtin: STRING,
    },
  },
  variant: {
    type: 'OBJECT',
    properties: { product_name: STRING, sku: STRING, color: STRING, size: STRING, gtin: STRING, weight_g: NUMBER },
  },
  batch: {
    type: 'OBJECT',
    properties: {
      product_name: STRING, variant_sku: STRING, batch_number: STRING, production_date: STRING,
      country_of_origin: STRING, co2_footprint_kg: NUMBER, recycled_content_pct: NUMBER,
    },
  },
};

const HINTS = {
  product:
    'Extract the textile PRODUCT attributes from this document. Only include fields explicitly present; leave others empty. Use ISO-2 country codes. espr_compliance must be one of draft, in_review, compliant, non_compliant.',
  variant: 'Extract PRODUCT VARIANT attributes (SKU, colour, size, GTIN, weight in grams). Only include fields present.',
  batch: 'Extract PRODUCTION BATCH attributes (batch number, production date YYYY-MM-DD, country ISO-2, CO2, recycled %). Only include fields present.',
};

function readCookie(req, name) {
  const header = req.headers && req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Resolve the active app user from the session cookie. Returns null when not authenticated/active. */
async function resolveSessionUser(req) {
  const token = readCookie(req, COOKIE_NAME);
  const payload = token ? session.verify(token) : null;
  if (!payload || !payload.uid || payload.scope !== 'full') return null;

  const { Users } = cds.entities('dpp');
  const user = await SELECT.one.from(Users).where({ ID: payload.uid });
  if (!user || user.active === false || !user.organization_ID) return null;
  // The assistant is for company roles only (mirrors the aiChat scope: business
  // partners have no create/extract surface).
  if (user.role === 'business_partner') return null;
  return { uid: user.ID, orgId: user.organization_ID, role: user.role };
}

function register(app) {
  app.post('/ai/extract', express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
    const startedAt = Date.now();
    let appUser;
    try {
      appUser = await resolveSessionUser(req);
    } catch (e) {
      LOG.error('ai/extract auth error', e);
      return res.status(500).json({ error: { message: 'Something went wrong. Please try again later.' } });
    }
    if (!appUser) {
      return res.status(401).json({ error: { message: 'Your session has expired. Please sign in again.' } });
    }

    if (!rateLimit.allow(`extract:${appUser.uid}`)) {
      return res.status(429).json({ error: { message: 'Too many requests. Please wait a moment and try again.' } });
    }

    const mimeType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(mimeType)) {
      return res.status(415).json({ error: { message: 'Only PDF, PNG or JPEG files are supported.' } });
    }
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ error: { message: 'No file content was received.' } });
    }

    const entity = SCHEMAS[req.query.entity] ? req.query.entity : 'product';
    const hint = typeof req.query.hint === 'string' && req.query.hint.trim() ? req.query.hint.trim() : HINTS[entity];

    if (!gemini.isConfigured()) {
      LOG.warn('ai/extract called but GEMINI_API_KEY is not configured');
      return res.status(503).json({ error: { message: 'The AI assistant is not available right now.' } });
    }

    let fields;
    try {
      fields = await gemini.extractFromFile({ buffer, mimeType, schema: SCHEMAS[entity], hint });
    } catch (e) {
      LOG.error('ai/extract failed', { entity, mimeType, bytes: buffer.length, code: e.code || null, status: e.status || null });
      if (e.status === 429) {
        return res.status(429).json({ error: { message: 'The AI assistant is busy (rate limit reached). Please wait a minute and try again.' } });
      }
      return res.status(502).json({ error: { message: 'The document could not be analysed. Please try again.' } });
    }

    LOG.debug('ai/extract ok', { entity, mimeType, bytes: buffer.length, ms: Date.now() - startedAt });
    return res.json({ entity, fields: fields || {}, model: gemini.extractModel() });
  });
}

module.exports = { register };
