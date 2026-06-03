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
  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init && init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init && init.headers)
    }
  });

  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    const message = body?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, body, message);
  }

  if (res.status === 204) return undefined;
  return res.json();
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
  const s = params.toString();
  return s ? `?${s}` : '';
}
