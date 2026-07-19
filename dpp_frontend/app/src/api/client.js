/**
 * Thin fetch wrapper for the DPP backend.
 *
 * All calls use RELATIVE paths so they work identically in:
 *  - local dev  (Vite proxy → http://localhost:4004, Basic Auth injected by the proxy)
 *  - production (Approuter serves the SPA and forwards /odata + /public to dpp-srv)
 *
 * CSRF is disabled on the OData routes (xs-app.json csrfProtection:false), so writes
 * need no CSRF token. The Approuter session cookie travels automatically.
 */

import { toUserMessage } from './errors';

export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {unknown} body
   * @param {string} message
   */
  constructor(status, body, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const ODATA_BASE = '/odata/v4/dpp';

/**
 * Build an ApiError from a failed Response and set a clean, user-facing `message`.
 * The raw OData message / status line is preserved on `body` for debugging, but never
 * shown — `toUserMessage()` decides what the user sees.
 * @param {Response} res
 * @returns {Promise<ApiError>}
 */
async function buildApiError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON / empty / binary error body */
  }
  const rawMessage = body?.error?.message ?? `${res.status} ${res.statusText}`;
  const err = new ApiError(res.status, body, rawMessage);
  err.message = toUserMessage(err);
  return err;
}

/** ApiError for a network-level failure (no HTTP response reached us). Status 0 → network msg. */
function networkError() {
  const err = new ApiError(0, null, '');
  err.message = toUserMessage(err);
  return err;
}

/**
 * Generate a client-side UUID for entity keys.
 *
 * The backend data model uses String(36) keys WITHOUT a UUID default (seed rows carry
 * semantic IDs like `bp-7f3a…`), so CAP does not auto-assign an ID on insert — the client
 * must provide one or the insert fails with a NOT NULL constraint on the key column.
 *
 * @returns {string}
 */
export function newId() {
  return crypto.randomUUID();
}

/**
 * Render an entity key as an OData string literal. All keys in this model are Edm.String(36),
 * so they MUST be single-quoted — unquoted non-GUID keys (e.g. seed IDs like
 * `prod-tshirt-classic`) are rejected with 400. Single quotes are escaped by doubling.
 * @param {string} key
 */
export function keyLiteral(key) {
  return `'${String(key).replace(/'/g, "''")}'`;
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
async function request(path, init) {
  let res;
  try {
    res = await fetch(path, {
      ...init,
      // Send the app-managed dpp_session cookie on every call (same-origin in prod,
      // via the Vite proxy in dev).
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init && init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init && init.headers)
      }
    });
  } catch {
    // fetch rejects only on network-level failures (server unreachable, DNS, offline).
    throw networkError();
  }

  if (!res.ok) {
    // No (valid) session → bounce to the login screen. The /auth/* endpoints
    // handle their own 401s (wrong credentials), so they opt out via init.noAuthRedirect.
    if (res.status === 401 && !(init && init.noAuthRedirect)) {
      redirectToLogin();
    }
    throw await buildApiError(res);
  }

  if (res.status === 204) return undefined;
  return res.json();
}

/** Navigate the browser to the SPA login route (full navigation; guards against loops). */
function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

/**
 * OData GET — returns the `value` array for entity-set queries.
 * @param {string} entitySet
 * @param {ODataQuery} [query]
 * @returns {Promise<any[]>}
 */
export async function odataList(entitySet, query) {
  const qs = query ? buildQuery(query) : '';
  const res = await request(`${ODATA_BASE}/${entitySet}${qs}`);
  return res.value;
}

/**
 * OData GET by key.
 * @param {string} entitySet
 * @param {string} key
 * @param {ODataQuery} [query]
 */
export function odataGet(entitySet, key, query) {
  const qs = query ? buildQuery(query) : '';
  return request(`${ODATA_BASE}/${entitySet}(${keyLiteral(key)})${qs}`);
}

/**
 * OData $count for KPI tiles.
 * @param {string} entitySet
 * @param {string} [filter]
 * @returns {Promise<number>}
 */
export async function odataCount(entitySet, filter) {
  const qs = filter ? `?$filter=${encodeURIComponent(filter)}` : '';
  const res = await request(`${ODATA_BASE}/${entitySet}/$count${qs}`);
  return Number(res);
}

/**
 * @param {string} entitySet
 * @param {unknown} payload
 */
export function odataCreate(entitySet, payload) {
  return request(`${ODATA_BASE}/${entitySet}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/**
 * @param {string} entitySet
 * @param {string} key
 * @param {unknown} payload
 */
export function odataUpdate(entitySet, key, payload) {
  return request(`${ODATA_BASE}/${entitySet}(${keyLiteral(key)})`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

/**
 * Delete an entity by key.
 * @param {string} entitySet
 * @param {string} key
 */
export function odataDelete(entitySet, key) {
  return request(`${ODATA_BASE}/${entitySet}(${keyLiteral(key)})`, { method: 'DELETE' });
}

/**
 * Upload raw bytes to a CAP media stream, e.g. Documents(ID)/content. Unlike the
 * JSON helpers above this sends the file body verbatim (no base64, no JSON), with the
 * file's own MIME type — CAP stores that into the @Core.IsMediaType element. The two-step
 * pattern is: odataCreate the metadata row first, then PUT the bytes to this endpoint.
 * @param {string} entitySet
 * @param {string} key
 * @param {string} mediaProp   media stream property name, e.g. 'content'
 * @param {File|Blob} file
 */
export async function odataUploadMedia(entitySet, key, mediaProp, file) {
  let res;
  try {
    res = await fetch(`${ODATA_BASE}/${entitySet}(${keyLiteral(key)})/${mediaProp}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
  } catch {
    throw networkError();
  }
  if (!res.ok) {
    if (res.status === 401) redirectToLogin();
    throw await buildApiError(res);
  }
}

/**
 * Invoke a bound action, e.g. callAction('DPPs', id, 'publishDPP', { change_reason }).
 * @param {string} entitySet
 * @param {string} key
 * @param {string} action
 * @param {unknown} [payload]
 */
export function callAction(entitySet, key, action, payload) {
  return request(`${ODATA_BASE}/${entitySet}(${keyLiteral(key)})/DPPService.${action}`, {
    method: 'POST',
    body: payload ? JSON.stringify(payload) : JSON.stringify({})
  });
}

/**
 * Invoke an unbound function such as me().
 * @param {string} fn
 */
export function callFunction(fn) {
  return request(`${ODATA_BASE}/${fn}`);
}

/**
 * Unwrap a CAP function result that returns JSON as a LargeString — e.g.
 * validationStatus() / validationOverview(). OData wraps the string in
 * `{ value: "..." }`; parse it into the actual object.
 * @param {unknown} raw
 */
export function parseJsonFunctionResult(raw) {
  const j = raw?.value ?? raw;
  return typeof j === 'string' ? JSON.parse(j) : j;
}

/**
 * Invoke an unbound action, e.g. callUnboundAction('createUser', { username, … }).
 * Unbound actions POST to `${ODATA_BASE}/${action}` (no DPPService. prefix, no key).
 * @param {string} action
 * @param {unknown} [payload]
 */
export function callUnboundAction(action, payload) {
  return request(`${ODATA_BASE}/${action}`, {
    method: 'POST',
    body: JSON.stringify(payload || {})
  });
}

/**
 * @typedef {Object} ODataQuery
 * @property {string[]} [select]
 * @property {string[]} [expand]
 * @property {string} [filter]
 * @property {string} [orderby]
 * @property {number} [top]
 * @property {number} [skip]
 * @property {boolean} [count]
 */

/** @param {ODataQuery} q */
function buildQuery(q) {
  const params = new URLSearchParams();
  if (q.select?.length) params.set('$select', q.select.join(','));
  if (q.expand?.length) params.set('$expand', q.expand.join(','));
  if (q.filter) params.set('$filter', q.filter);
  if (q.orderby) params.set('$orderby', q.orderby);
  if (q.top != null) params.set('$top', String(q.top));
  if (q.skip != null) params.set('$skip', String(q.skip));
  if (q.count) params.set('$count', 'true');
  // URLSearchParams encodes spaces as '+', which the OData $filter parser rejects.
  // Replace with %20 (safe: literal '+' in a value is already encoded as %2B).
  const s = params.toString().replace(/\+/g, '%20');
  return s ? `?${s}` : '';
}
