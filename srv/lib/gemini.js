'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('dpp/ai');

/**
 * Google Gemini (Google AI Studio) client — thin wrapper over the REST API.
 *
 * Auth: the API key is read from `process.env.GEMINI_API_KEY` (projected from the
 * bound `dpp-secrets` service by srv/lib/secrets.js on BTP, or from local `.env`
 * in dev). The key is NEVER sent to the frontend and NEVER logged. Requests use
 * Node 20's global `fetch` — no extra dependency.
 *
 * DSGVO / logging: this module logs only model name, latency, token usage and
 * outcome — never the prompt payload, file bytes or extracted field values.
 *
 * Two entry points:
 *   - generate({ system, contents, tools })  → one function-calling round-trip.
 *   - extractFromFile({ buffer, mimeType, schema, hint }) → multimodal structured
 *     extraction (Gemini reads PDF/PNG/JPEG natively — no separate OCR step).
 */

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 60000);
const MAX_RETRIES = 2;
// 429 is deliberately NOT retried in-line: free-tier quota is per-minute, so a
// quick retry just burns another rejected call — surface it to the caller instead.
const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

function apiKey() {
  return process.env.GEMINI_API_KEY || '';
}

/** Whether an API key is configured (real calls possible). */
function isConfigured() {
  return !!apiKey();
}

function baseUrl() {
  return (process.env.GEMINI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function chatModel() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function extractModel() {
  return process.env.GEMINI_MODEL_EXTRACT || chatModel();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * POST a request body to a Gemini model endpoint with timeout + bounded retries.
 * @param {string} model
 * @param {object} body     the request payload
 * @param {AbortSignal} [signal]  optional caller cancellation
 * @returns {Promise<object>} the parsed Gemini response JSON
 */
async function callModel(model, body, signal) {
  if (!isConfigured()) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  const url = `${baseUrl()}/models/${encodeURIComponent(model)}:generateContent`;

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey() },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const status = res.status;
        // Read (and discard) the body for diagnostics — do NOT log its content (may echo input).
        let detail = '';
        try {
          const j = await res.json();
          detail = j?.error?.status || j?.error?.message ? String(j.error.status || '') : '';
        } catch {
          /* ignore non-JSON error body */
        }
        if (RETRYABLE_STATUS.has(status) && attempt < MAX_RETRIES) {
          LOG.warn('gemini call retryable failure', { model, status, attempt });
          await sleep(300 * Math.pow(2, attempt));
          continue;
        }
        const err = new Error(`Gemini request failed (${status})`);
        err.code = 'AI_UPSTREAM';
        err.status = status;
        err.detail = detail;
        throw err;
      }
      const json = await res.json();
      LOG.debug('gemini call ok', {
        model,
        ms: Date.now() - startedAt,
        prompt_tokens: json?.usageMetadata?.promptTokenCount,
        output_tokens: json?.usageMetadata?.candidatesTokenCount,
      });
      return json;
    } catch (e) {
      lastErr = e;
      const aborted = e.name === 'AbortError';
      if (aborted && signal && signal.aborted) throw e; // caller cancelled — do not retry
      if (attempt < MAX_RETRIES && (aborted || e.code === undefined)) {
        LOG.warn('gemini call transient error, retrying', { model, attempt, aborted });
        await sleep(300 * Math.pow(2, attempt));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr || new Error('Gemini request failed');
}

/** Normalize a Gemini response into { text, functionCalls[], usage }. */
function normalize(json) {
  const cand = json?.candidates?.[0];
  const parts = cand?.content?.parts || [];
  const text = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('').trim();
  const functionCalls = parts
    .filter((p) => p.functionCall)
    .map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
  return {
    text,
    functionCalls,
    // Raw model parts, echoed back verbatim as the model turn so thinking-model
    // metadata (e.g. thoughtSignature on gemini-2.5-*) is preserved — required for
    // multi-turn function calling to work reliably.
    parts,
    finishReason: cand?.finishReason || null,
    usage: {
      prompt: json?.usageMetadata?.promptTokenCount ?? null,
      output: json?.usageMetadata?.candidatesTokenCount ?? null,
    },
  };
}

/**
 * One function-calling round-trip.
 * @param {object} opts
 * @param {string} opts.system          system instruction
 * @param {Array}  opts.contents        Gemini contents array (role/parts)
 * @param {Array}  [opts.tools]         function declarations
 * @param {string} [opts.model]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{text, functionCalls, finishReason, usage}>}
 */
async function generate({ system, contents, tools, model, signal } = {}) {
  const body = {
    contents,
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools && tools.length) {
    body.tools = [{ functionDeclarations: tools }];
    body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  }
  const json = await callModel(model || chatModel(), body, signal);
  return normalize(json);
}

/**
 * Multimodal structured extraction from an uploaded file.
 * @param {object} opts
 * @param {Buffer} opts.buffer
 * @param {string} opts.mimeType    application/pdf | image/png | image/jpeg
 * @param {object} opts.schema      Gemini responseSchema (OpenAPI subset)
 * @param {string} opts.hint        instruction describing what to extract
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<object>} parsed JSON matching the schema
 */
async function extractFromFile({ buffer, mimeType, schema, hint, signal } = {}) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: Buffer.from(buffer).toString('base64') } },
          { text: hint || 'Extract the requested fields from this document.' },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      ...(schema ? { responseSchema: schema } : {}),
    },
  };
  const json = await callModel(extractModel(), body, signal);
  const { text } = normalize(json);
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('Gemini returned malformed extraction output');
    err.code = 'AI_BAD_OUTPUT';
    throw err;
  }
}

module.exports = {
  isConfigured,
  generate,
  extractFromFile,
  chatModel,
  extractModel,
};
