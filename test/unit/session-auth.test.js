'use strict';

const session = require('../../srv/lib/session');
const sessionAuthFactory = require('../../srv/auth/session-auth');

function run(cookieValue) {
  const mw = sessionAuthFactory({});
  const req = { headers: cookieValue ? { cookie: `dpp_session=${cookieValue}` } : {} };
  let nexted = false;
  mw(req, {}, () => { nexted = true; });
  return { req, nexted };
}

describe('session-auth middleware', () => {
  test('factory has arity < 3 so CAP treats it as a factory', () => {
    expect(sessionAuthFactory.length).toBeLessThan(3);
  });

  test('valid full session sets req.user matching the token subject', () => {
    const token = session.sign({ uid: 'u1', sub: 'alice.advanced', role: 'company_advanced', tenant: 'ORG-A' });
    const { req, nexted } = run(token);
    expect(nexted).toBe(true);
    expect(req.user).toBeTruthy();
    expect(req.user.id).toBe('alice.advanced');
    expect(req.user.is('company_advanced')).toBe(true);
  });

  test('no cookie leaves req.user unset (anonymous) and calls next', () => {
    const { req, nexted } = run(null);
    expect(nexted).toBe(true);
    expect(req.user).toBeUndefined();
  });

  test('pwreset-scoped token does NOT grant a user (app stays blocked)', () => {
    const token = session.sign({ uid: 'u1', sub: 'alice.advanced' }, { scope: 'pwreset' });
    const { req, nexted } = run(token);
    expect(nexted).toBe(true);
    expect(req.user).toBeUndefined();
  });

  test('tampered token leaves req.user unset', () => {
    const token = session.sign({ uid: 'u1', sub: 'alice.advanced', role: 'company_advanced' });
    const tampered = token.slice(0, -1) + (token.slice(-1) === 'A' ? 'B' : 'A');
    const { req } = run(tampered);
    expect(req.user).toBeUndefined();
  });
});
