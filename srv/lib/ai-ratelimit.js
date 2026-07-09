'use strict';

/**
 * Minimal in-memory per-user sliding-window rate limiter for the AI endpoints.
 *
 * Protects against runaway cost/latency from a single account. In-memory (per
 * app instance) is sufficient as a basic guard; on a scaled-out deployment each
 * instance limits independently, which is acceptable for this control. Tune via
 * AI_RATE_LIMIT_PER_MIN (default 20 requests/minute per user per bucket).
 */

const WINDOW_MS = 60000;
const MAX = Number(process.env.AI_RATE_LIMIT_PER_MIN || 20);
const hits = new Map();

/**
 * @param {string} key  bucket key, e.g. `chat:<userId>` or `extract:<userId>`
 * @returns {boolean} true if allowed, false if the limit is exceeded
 */
function allow(key) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

module.exports = { allow, MAX };
