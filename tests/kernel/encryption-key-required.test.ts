/**
 * The at-rest key is required, and its absence is loud.
 *
 * Companion to `tests/guardrails/no-default-encryption-key.test.ts`: that one keeps a literal default
 * out of the source, this one pins what happens at runtime when the variable is simply not set -
 * which is the state the audited deployment was in.
 *
 * The distinction matters because the previous behaviour was *silent*: `decrypt()` catches its own
 * errors and returns the input unchanged (a legacy-plaintext fallback), so a missing key would have
 * turned "the key is not configured" into "the ciphertext is the child's name". Resolving the key
 * before that try/catch is what makes the failure visible, and this test asserts it from both
 * directions: the accessor throws, and `decrypt` does not swallow it.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { decrypt, encrypt, encryptionKey } from '../../api/db.js';

const KEY = 'unit-test-encryption-key-0000000';

afterEach(() => {
  process.env.ENCRYPTION_KEY = KEY;
});

process.env.ENCRYPTION_KEY = KEY;

describe('at-rest encryption key', () => {
  it('throws when the key is not configured', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptionKey()).toThrow(/ENCRYPTION_KEY is not set/);
  });

  it('refuses a key that is not 32 bytes for aes-256-cbc', () => {
    process.env.ENCRYPTION_KEY = 'too-short';
    expect(() => encryptionKey()).toThrow(/must be 32 bytes/);
  });

  it('round-trips a value with a 32-byte key', () => {
    const ciphertext = encrypt('小明');
    expect(ciphertext).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
    expect(ciphertext).not.toContain('小明');
    expect(decrypt(ciphertext)).toBe('小明');
  });

  it('does not swallow a missing key inside decrypt()', () => {
    const ciphertext = encrypt('小红');
    delete process.env.ENCRYPTION_KEY;

    // The legacy-plaintext fallback must not be able to turn a configuration error into a
    // successful read that returns the ciphertext as if it were the name.
    expect(() => decrypt(ciphertext)).toThrow(/ENCRYPTION_KEY is not set/);
  });

  it('still passes through a legacy plaintext value', () => {
    // Rows written before encryption existed are stored as-is; `decrypt` returns them unchanged.
    expect(decrypt('小明')).toBe('小明');
  });
});
