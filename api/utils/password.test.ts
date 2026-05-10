import { describe, expect, it } from 'vitest';

import { hashPassword, isPasswordHash, verifyPassword } from './password';

describe('password utilities', () => {
  it('hashes and verifies new passwords', () => {
    const hash = hashPassword('secret-pass');

    expect(isPasswordHash(hash)).toBe(true);
    expect(verifyPassword('secret-pass', hash)).toBe(true);
    expect(verifyPassword('wrong-pass', hash)).toBe(false);
  });

  it('keeps legacy plaintext verification compatible', () => {
    expect(isPasswordHash('123456')).toBe(false);
    expect(verifyPassword('123456', '123456')).toBe(true);
    expect(verifyPassword('wrong', '123456')).toBe(false);
  });
});

