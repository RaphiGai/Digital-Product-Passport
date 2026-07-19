'use strict';

const session = require('../../srv/lib/session');

describe('session', () => {
  test('sign + verify round-trips the claims and scope', () => {
    const tok = session.sign({ uid: 'u1', sub: 'alice.advanced', role: 'company_advanced', tenant: 'ORG-A' });
    const payload = session.verify(tok);
    expect(payload).toMatchObject({
      uid: 'u1',
      sub: 'alice.advanced',
      role: 'company_advanced',
      tenant: 'ORG-A',
      scope: 'full',
    });
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  test('pwreset scope is preserved', () => {
    const tok = session.sign({ uid: 'u1', sub: 'bob' }, { scope: 'pwreset' });
    expect(session.verify(tok).scope).toBe('pwreset');
  });

  test('verify rejects a tampered token', () => {
    const tok = session.sign({ uid: 'u1' });
    const tampered = tok.slice(0, -1) + (tok.slice(-1) === 'A' ? 'B' : 'A');
    expect(session.verify(tampered)).toBeNull();
  });

  test('verify rejects an expired token', () => {
    const past = Date.now() - 60 * 1000;
    const tok = session.sign({ uid: 'u1' }, { ttlSeconds: 1, now: past });
    expect(session.verify(tok)).toBeNull();
  });

  test('verify rejects malformed input', () => {
    expect(session.verify('no-dot')).toBeNull();
    expect(session.verify('')).toBeNull();
    expect(session.verify(null)).toBeNull();
  });

  test('verify rejects a wrong-secret signature', () => {
    const tok = session.sign({ uid: 'u1' });
    const prev = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'a-completely-different-secret-value';
    expect(session.verify(tok)).toBeNull();
    process.env.SESSION_SECRET = prev;
  });
});
