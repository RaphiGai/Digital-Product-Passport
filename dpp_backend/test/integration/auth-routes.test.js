'use strict';

const cds = require('@sap/cds');
const { POST, expect } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // mocked auth (test profile)
const json = { headers: { Accept: 'application/json' } };

const expectStatus = async (promise, status) => {
  try {
    await promise;
    throw new Error(`Expected status ${status}, but request succeeded.`);
  } catch (err) {
    expect(err.response?.status || err.status).toBe(status);
  }
};

describe('POST /auth/login (JSON content negotiation)', () => {
  test('valid bootstrap admin (alice.advanced / DPP) → { ok:true, mustReset:false } + cookie', async () => {
    const res = await POST('/auth/login', { username: 'alice.advanced', password: 'DPP' }, json);
    expect(res.data).toMatchObject({ ok: true, mustReset: false });
    const setCookie = res.headers['set-cookie']?.join(';') || '';
    expect(setCookie).toContain('dpp_session=');
  });

  test('wrong password → 401', async () => {
    await expectStatus(POST('/auth/login', { username: 'alice.advanced', password: 'nope' }, json), 401);
  });

  test('a freshly created user must reset on first login → { ok:true, mustReset:true }', async () => {
    const { data: created } = await POST('/odata/v4/dpp/createUser', {
      username: 'firstlogin', email: 'firstlogin@greenline.example', displayName: 'First Login', role: 'company_user',
    }, alice);
    const res = await POST('/auth/login', { username: 'firstlogin', password: created.tempPassword }, json);
    expect(res.data).toMatchObject({ ok: true, mustReset: true });
  });

  test('unknown user → 401 (no enumeration)', async () => {
    await expectStatus(POST('/auth/login', { username: 'nobody', password: 'whatever' }, json), 401);
  });
});
