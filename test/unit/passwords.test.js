'use strict';

const passwords = require('../../srv/lib/passwords');

describe('passwords', () => {
  test('hash produces a bcrypt string that verifies against the plaintext', async () => {
    const h = await passwords.hash('Sup3rSecret!');
    expect(typeof h).toBe('string');
    expect(h).not.toBe('Sup3rSecret!');
    expect(h.startsWith('$2')).toBe(true);
    expect(await passwords.verify('Sup3rSecret!', h)).toBe(true);
  });

  test('verify returns false for a wrong password', async () => {
    const h = await passwords.hash('Sup3rSecret!');
    expect(await passwords.verify('wrong-password-1', h)).toBe(false);
  });

  test('verify returns false (never throws) for empty/null hash or password', async () => {
    expect(await passwords.verify('anything', null)).toBe(false);
    expect(await passwords.verify('anything', '')).toBe(false);
    expect(await passwords.verify('', '$2a$04$abc')).toBe(false);
  });

  test('validateStrength enforces length + letter + digit', () => {
    expect(passwords.validateStrength('short1').ok).toBe(false);       // too short
    expect(passwords.validateStrength('onlyletters').ok).toBe(false);  // no digit
    expect(passwords.validateStrength('1234567890').ok).toBe(false);   // no letter
    expect(passwords.validateStrength('Goodpass12').ok).toBe(true);
  });

  test('generateTempPassword satisfies the strength policy and is random', () => {
    const a = passwords.generateTempPassword();
    const b = passwords.generateTempPassword();
    expect(passwords.validateStrength(a).ok).toBe(true);
    expect(a).not.toBe(b);
  });
});
