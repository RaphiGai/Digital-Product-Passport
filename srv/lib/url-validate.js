'use strict';

/**
 * URL validation for consumer-facing link fields.
 *
 * Several product/BOM/marketing URL fields are rendered as `<a href>` on the
 * UNAUTHENTICATED public passport page. Only http(s) URLs may be stored — a
 * `javascript:` / `data:` / `vbscript:` value would become a clickable stored-XSS
 * vector. The frontend already checks this, but that check is client-only and
 * bypassable via raw OData, so it must be enforced server-side too.
 */

/** True when a value is empty/null or a well-formed http(s) URL. */
function isHttpUrl(v) {
  if (v === undefined || v === null || v === '') return true;
  return /^https?:\/\//i.test(String(v).trim());
}

/**
 * Reject the request (400) if any of `fields` in `data` is a non-empty, non-http(s) URL.
 * @param {object} req      CAP request
 * @param {object} data     the payload (typically req.data)
 * @param {string[]} fields field names to check
 */
function assertHttpUrls(req, data, fields) {
  if (!data) return;
  for (const f of fields) {
    if (!isHttpUrl(data[f])) {
      const label = f.replace(/_url$/i, '').replace(/_/g, ' ').replace(/\bdpp\b/i, 'DPP');
      req.reject(400, `The ${label} link must be a full web address starting with https:// or http:// (for example https://example.com). Please correct the link and try again.`);
    }
  }
}

module.exports = { isHttpUrl, assertHttpUrls };
