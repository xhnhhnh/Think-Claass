import crypto from 'crypto';

const HASH_PREFIX = 'scrypt';
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
} as const;

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString('hex');
  return `${HASH_PREFIX}$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt}$${hash}`;
}

export function isPasswordHash(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith(`${HASH_PREFIX}$`);
}

export function verifyPassword(password: string, storedValue: string) {
  if (!isPasswordHash(storedValue)) {
    return password === storedValue;
  }

  const [, n, r, p, salt, expectedHash] = storedValue.split('$');
  if (!n || !r || !p || !salt || !expectedHash) {
    return false;
  }

  try {
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    const expected = Buffer.from(expectedHash, 'hex');

    return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}
