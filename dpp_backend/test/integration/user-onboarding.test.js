'use strict';

const cds = require('@sap/cds');
const { GET, POST, expect } = cds.test().in(__dirname + '/../..');
const loadDemoFixtures = require('../helpers/loadDemoFixtures');

// Restore the demo rows removed from the shipped seed (second tenant + jacket/hoodie chains).
beforeAll(loadDemoFixtures);

const alice = { auth: { username: 'alice.advanced', password: 'x' } }; // company_advanced, ORG-A
const carol = { auth: { username: 'carol.user',     password: 'x' } }; // company_user,     ORG-A

const base = '/odata/v4/dpp';

const expectStatus = async (promise, status) => {
  try {
    await promise;
    throw new Error(`Expected status ${status}, but request succeeded.`);
  } catch (err) {
    expect(err.response?.status || err.status || err.code).toBe(status);
  }
};

describe('User onboarding & management (own auth)', () => {
  describe('createUser', () => {
    test('company_advanced creates a read-only user and gets a one-time temp password', async () => {
      const { data } = await POST(`${base}/createUser`, {
        username: 'reader1', email: 'reader1@greenline.example', displayName: 'Reader One', role: 'company_user',
      }, alice);
      expect(data.userId).toBeTruthy();
      expect(data.role).toBe('company_user');
      expect(typeof data.tempPassword).toBe('string');
      expect(data.tempPassword.length).toBeGreaterThanOrEqual(10);

      // The created row is in the caller's org, flagged must-reset, and exposes NO credential fields.
      const { data: row } = await GET(`${base}/Users('${data.userId}')`, alice);
      expect(row.username).toBe('reader1');
      expect(row.organization_ID).toBe('org-greenline');
      expect(row.must_reset_password).toBe(true);
      expect(row).not.toHaveProperty('password_hash');
    });

    test('company_user cannot create users (403)', async () => {
      await expectStatus(POST(`${base}/createUser`, {
        username: 'nope', email: 'nope@greenline.example', displayName: 'Nope', role: 'company_user',
      }, carol), 403);
    });

    test('invalid role is rejected (400)', async () => {
      await expectStatus(POST(`${base}/createUser`, {
        username: 'badrole', email: 'badrole@greenline.example', displayName: 'Bad', role: 'superuser',
      }, alice), 400);
    });

    test('duplicate username is rejected (409)', async () => {
      await POST(`${base}/createUser`, {
        username: 'dupe', email: 'dupe1@greenline.example', displayName: 'Dupe', role: 'company_user',
      }, alice);
      await expectStatus(POST(`${base}/createUser`, {
        username: 'dupe', email: 'dupe2@greenline.example', displayName: 'Dupe2', role: 'company_user',
      }, alice), 409);
    });
  });

  describe('resetUserPassword (admin-mediated)', () => {
    test('company_advanced resets a user in their own org', async () => {
      const { data: created } = await POST(`${base}/createUser`, {
        username: 'resetme', email: 'resetme@greenline.example', displayName: 'Reset Me', role: 'company_user',
      }, alice);
      const { data } = await POST(`${base}/resetUserPassword`, { userId: created.userId }, alice);
      expect(data.userId).toBe(created.userId);
      expect(data.tempPassword.length).toBeGreaterThanOrEqual(10);
    });

    test('cannot reset a user from another organization (403)', async () => {
      await expectStatus(POST(`${base}/resetUserPassword`, { userId: 'usr-dan' }, alice), 403);
    });
  });

  describe('changePassword (own account)', () => {
    test('company_advanced changes own password with correct current', async () => {
      const { data } = await POST(`${base}/changePassword`, {
        currentPassword: 'DPP', newPassword: 'Brandnew123',
      }, alice);
      expect(data.value).toBe(true);
    });

    test('wrong current password is rejected (400)', async () => {
      await expectStatus(POST(`${base}/changePassword`, {
        currentPassword: 'definitely-wrong', newPassword: 'Brandnew123',
      }, alice), 400);
    });

    test('weak new password is rejected (400)', async () => {
      await expectStatus(POST(`${base}/changePassword`, {
        currentPassword: 'DPP', newPassword: 'short',
      }, alice), 400);
    });

    test('company_user is allowed to reach changePassword (not 403) — fails only on wrong current (400)', async () => {
      // carol has no usable password hash in seed, so this fails with 400 (wrong current),
      // proving the role gate does NOT block read-only users from changing their own password.
      await expectStatus(POST(`${base}/changePassword`, {
        currentPassword: 'whatever', newPassword: 'Brandnew123',
      }, carol), 400);
    });
  });

  describe('deactivateUser / reactivateUser', () => {
    test('deactivating a user locks them (active=false), reactivating restores', async () => {
      const { data: created } = await POST(`${base}/createUser`, {
        username: 'todeact', email: 'todeact@greenline.example', displayName: 'To Deact', role: 'company_user',
      }, alice);

      expect((await POST(`${base}/deactivateUser`, { userId: created.userId }, alice)).data.value).toBe(true);
      const { data: row } = await GET(`${base}/Users('${created.userId}')`, alice);
      expect(row.active).toBe(false);

      expect((await POST(`${base}/reactivateUser`, { userId: created.userId }, alice)).data.value).toBe(true);
      const { data: row2 } = await GET(`${base}/Users('${created.userId}')`, alice);
      expect(row2.active).toBe(true);
    });

    test('cannot deactivate your own account (400)', async () => {
      await expectStatus(POST(`${base}/deactivateUser`, { userId: 'usr-alice' }, alice), 400);
    });

    test('cannot deactivate a user from another organization (403)', async () => {
      await expectStatus(POST(`${base}/deactivateUser`, { userId: 'usr-dan' }, alice), 403);
    });
  });

  describe('me().mustResetPassword', () => {
    test('bootstrap admin alice is not flagged for reset', async () => {
      const { data } = await GET(`${base}/me()`, alice);
      expect(data.mustResetPassword).toBe(false);
    });
  });
});
