// Jest global setup. Mutes blockchain in tests by default; individual tests can opt-in.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.CDS_ENV = process.env.CDS_ENV || 'development';
// Auth is the app-managed custom kind in every profile. This explicit flag tells
// the custom middleware (srv/auth/session-auth.js) to accept HTTP Basic Auth and
// resolve the username against the Users table — so the cds.test() suite keeps
// authenticating via { auth: { username, password } } without a real cookie.
// (cds.test() resets NODE_ENV to 'development', so we can't key the shim on that.)
// This flag is NEVER set in dev/prod.
process.env.DPP_TEST_AUTH = 'basic';
process.env.BLOCKCHAIN_ENABLED = process.env.BLOCKCHAIN_ENABLED || 'false';
process.env.QR_TOKEN_HMAC_SECRET =
  process.env.QR_TOKEN_HMAC_SECRET || 'test-secret-please-do-not-use-in-production';
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || 'test-session-secret-please-do-not-use-in-production';
// Keep bcrypt fast in tests.
process.env.BCRYPT_COST = process.env.BCRYPT_COST || '4';
