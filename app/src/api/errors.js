/**
 * Central translation of any backend / network error into a clean, user-facing message.
 *
 * api/client.js runs every failed request through toUserMessage() and stores the result
 * in ApiError.message, so that NO raw technical text ever reaches the user — neither HTTP
 * status lines ("500 Internal Server Error"), nor CAP/OData (de)serialization errors, SQL
 * constraint messages or stack traces. Because all forms display `err.message`, improving
 * this one function cleans up every error banner in the app at once.
 *
 * Duck-typed on purpose (reads err.status / err.body instead of `instanceof ApiError`) so
 * client.js can import it without creating an import cycle.
 */

const NETWORK_MESSAGE = 'Cannot reach the server. Please check your connection and try again.';
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const SERVER_MESSAGE = 'Something went wrong on the server. Please try again later.';

/** HTTP status → clean fallback shown when the backend gives no usable message. */
const STATUS_MESSAGES = {
  400: 'Some of the information is missing or invalid. Please check your input and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have permission to perform this action.",
  404: 'The requested item could not be found.',
  409: 'This action conflicts with the current data (for example, the entry already exists).',
  413: 'The file is too large (max. 20 MB).',
  415: 'This file type is not supported. Allowed: PDF, PNG, JPEG.',
  422: 'The data could not be processed. Please check your input.',
  500: SERVER_MESSAGE,
  502: SERVER_MESSAGE,
  503: SERVER_MESSAGE,
  504: SERVER_MESSAGE
};

/**
 * Does this backend message look like raw technical output that a user should never see?
 * Deliberately conservative — only clear technical markers — so genuinely useful business
 * messages (e.g. "Weight must be a positive number (in grams).") still pass through.
 * @param {unknown} msg
 * @returns {boolean}
 */
function looksTechnical(msg) {
  if (typeof msg !== 'string') return true;
  const m = msg.trim();
  if (!m) return true;
  return (
    /^\d{3}\b/.test(m) ||                                   // "500 Internal Server Error", "400 Bad Request"
    /internal server error/i.test(m) ||
    /\bbad request\b/i.test(m) ||
    /\b(sqlite|sql|constraint|econnrefused|enotfound|etimedout)\b/i.test(m) ||
    /cannot read propert|is not a function|unexpected token|undefined is not/i.test(m) ||
    /\bat\s+\S+:\d+:\d+/.test(m) ||                         // stack-trace frame
    /deserializ|\bedm\./i.test(m)                           // CAP / OData (de)serialization errors
  );
}

/**
 * Translate any thrown error into a clean, user-facing English message.
 * @param {unknown} err
 * @param {string} [fallback]
 * @returns {string}
 */
export function toUserMessage(err, fallback = GENERIC_MESSAGE) {
  const status = typeof err?.status === 'number' ? err.status : null;

  // No HTTP response reached us (fetch threw, or we tagged it status 0) → network problem.
  if (status == null || status === 0) {
    return NETWORK_MESSAGE;
  }

  // Prefer the backend's own message when it is user-friendly (e.g. validation text).
  const backendMsg = err?.body?.error?.message;
  if (!looksTechnical(backendMsg)) {
    return backendMsg;
  }

  return STATUS_MESSAGES[status] || fallback;
}
