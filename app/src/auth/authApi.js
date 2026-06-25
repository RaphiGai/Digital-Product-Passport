/**
 * App-managed authentication endpoints (own login, replaces XSUAA).
 *
 * These talk to the backend /auth/* endpoints, which content-negotiate JSON when
 * called with Accept: application/json. They use their OWN fetch (not api/client's
 * request()) so a 401 (wrong credentials) does NOT trigger the global redirect to
 * /login — the login form surfaces the error inline instead.
 */

async function postAuth(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body || {})
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, data: data || {} };
}

/**
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ ok: true, mustReset: boolean } | { ok: false, error: string }>}
 */
export async function login(username, password) {
  const { status, data } = await postAuth('/auth/login', { username, password });
  if (status === 200 && data.ok) return { ok: true, mustReset: !!data.mustReset };
  return { ok: false, error: data.error || 'Login failed. Please check your credentials.' };
}

/**
 * Set a new password (forced first-login change or voluntary change). Requires a
 * valid session/pwreset cookie, which is set by login().
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function changePassword(currentPassword, newPassword) {
  const { status, data } = await postAuth('/auth/change-password', { currentPassword, newPassword });
  if (status === 200 && data.ok) return { ok: true };
  return { ok: false, error: data.error || 'Could not change the password.' };
}

/** Clear the session cookie on the backend. Errors are ignored (best-effort). */
export async function logout() {
  try {
    await postAuth('/auth/logout', {});
  } catch {
    /* ignore — we navigate to /login regardless */
  }
}

/**
 * Request a self-service password reset. If username + email match an active account,
 * the backend emails a time-limited reset link. A non-match returns a concrete error.
 * @param {string} username
 * @param {string} email
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function requestPasswordReset(username, email) {
  const { status, data } = await postAuth('/auth/request-password-reset', { username, email });
  if (status === 200 && data.ok) return { ok: true };
  return { ok: false, error: data.error || 'Could not request a password reset. Please try again.' };
}

/**
 * Complete a password reset using the single-use token from the emailed link.
 * @param {string} token
 * @param {string} newPassword
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function resetPasswordWithToken(token, newPassword) {
  const { status, data } = await postAuth('/auth/reset-password', { token, newPassword });
  if (status === 200 && data.ok) return { ok: true };
  return { ok: false, error: data.error || 'Could not reset the password. The link may have expired.' };
}
