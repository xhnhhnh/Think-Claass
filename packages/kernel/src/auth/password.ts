/**
 * Password hashing (scrypt).
 *
 * Moved verbatim in behaviour from `api/utils/password.ts` so existing stored
 * hashes keep verifying. `api/utils/password.ts` now re-exports from here, and its
 * test suite continues to guard the wire format.
 */

import crypto from 'node:crypto';

const HASH_PREFIX = 'scrypt';
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString('hex');
  return `${HASH_PREFIX}$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt}$${hash}`;
}

export function isPasswordHash(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${HASH_PREFIX}$`);
}

/**
 * Verify a password against a stored value.
 *
 * Legacy rows hold the plaintext password (the seed code writes `'admin123'`
 * directly), so a non-hash stored value falls back to a plain comparison. That
 * fallback is preserved for compatibility and is upgraded on next login by the
 * identity plugin.
 */
export function verifyPassword(password: string, storedValue: string): boolean {
  if (!isPasswordHash(storedValue)) {
    return timingSafeEqualStrings(password, storedValue);
  }

  const [, n, r, p, salt, expectedHash] = storedValue.split('$');
  if (!n || !r || !p || !salt || !expectedHash) return false;

  try {
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH, { N: Number(n), r: Number(r), p: Number(p) });
    const expected = Buffer.from(expectedHash, 'hex');
    return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

/** Constant-time comparison for the legacy plaintext path. */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}
