'use strict';

// Self-service profile maintenance: a user updates their own name + email, which
// persists (visible via me()). Works for read-only company_user too; email stays
// unique within the organization.

const cds = require('@sap/cds');

const { GET, POST } = cds.test().in(__dirname + '/../..');

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // ORG-A advanced
const carol = { auth: { username: 'carol.user', password: 'x' } };     // ORG-A read-only
const dan = { auth: { username: 'dan.advanced.b', password: 'x' } };    // ORG-B advanced

const expectStatus = async (promise, status) => {
  try {
    await promise;
    throw new Error(`Expected status ${status}, but the request succeeded.`);
  } catch (err) {
    expect(err.response?.status || err.status || err.code).toBe(status);
  }
};

describe('updateProfile (self-service name + email)', () => {
  test('a user updates their own name and email, and me() reflects it', async () => {
    await POST('/odata/v4/dpp/updateProfile', { displayName: 'Alice Updated', email: 'alice.updated@greenline.test' }, alice);
    const me = await GET('/odata/v4/dpp/me()', alice);
    expect(me.data.displayName).toBe('Alice Updated');
    expect(me.data.email).toBe('alice.updated@greenline.test');
  });

  test('a read-only company_user may update their own profile', async () => {
    await POST('/odata/v4/dpp/updateProfile', { displayName: 'Carol C', email: 'carol.new@greenline.test' }, carol);
    const me = await GET('/odata/v4/dpp/me()', carol);
    expect(me.data.displayName).toBe('Carol C');
    expect(me.data.email).toBe('carol.new@greenline.test');
  });

  test('email must stay unique within the organization', async () => {
    const aliceMe = await GET('/odata/v4/dpp/me()', alice);
    await expectStatus(
      POST('/odata/v4/dpp/updateProfile', { displayName: 'Carol', email: aliceMe.data.email }, carol),
      409
    );
  });

  test('the same email may exist in a different organization', async () => {
    const aliceMe = await GET('/odata/v4/dpp/me()', alice);
    // dan is ORG-B → no clash with an ORG-A email.
    await POST('/odata/v4/dpp/updateProfile', { displayName: 'Dan B', email: aliceMe.data.email }, dan);
    const danMe = await GET('/odata/v4/dpp/me()', dan);
    expect(danMe.data.email).toBe(aliceMe.data.email);
  });

  test('name and a valid email are required', async () => {
    await expectStatus(POST('/odata/v4/dpp/updateProfile', { displayName: '', email: 'a@b.com' }, alice), 400);
    await expectStatus(POST('/odata/v4/dpp/updateProfile', { displayName: 'A', email: 'not-an-email' }, alice), 400);
  });

  test('appearance theme defaults to green and is updatable on its own (partial)', async () => {
    const before = await GET('/odata/v4/dpp/me()', alice);
    expect(before.data.appearanceTheme).toBe('green');

    // Send ONLY the theme — name and email must stay unchanged (partial update).
    await POST('/odata/v4/dpp/updateProfile', { appearanceTheme: 'blue' }, alice);
    const after = await GET('/odata/v4/dpp/me()', alice);
    expect(after.data.appearanceTheme).toBe('blue');
    expect(after.data.email).toBe(before.data.email);
    expect(after.data.displayName).toBe(before.data.displayName);
  });

  test('an unsupported appearance theme is rejected', async () => {
    await expectStatus(POST('/odata/v4/dpp/updateProfile', { appearanceTheme: 'rainbow' }, alice), 400);
  });
});
