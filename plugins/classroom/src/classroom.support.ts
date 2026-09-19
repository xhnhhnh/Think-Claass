/**
 * Small domain helpers that the legacy code reached for through `api/**`.
 *
 * Both exist because the plugin boundary is real: `api/db.ts` and `api/utils/requestAuth.ts`
 * are not importable from `plugins/**`, and copying their *behaviour* here is the only way
 * to keep the endpoints byte-for-byte identical.
 */

import { createCipheriv, randomBytes } from 'node:crypto';

import type { Request } from 'express';

import { getRequestContext } from '@thinkclass/kernel';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { RequestActor } from './classroom.types.js';

/** The key `api/db.ts` falls back to when `ENCRYPTION_KEY` is unset. */
const DEFAULT_ENCRYPTION_KEY = '12345678901234567890123456789012';
const IV_LENGTH = 16;

export interface NameCipher {
  decrypt(value: string): string;
  encrypt(value: string): string;
}

/**
 * At-rest cipher for `students.name`.
 *
 * The read half is injected by the host (`ctx.config.decryptName`), which is how the port
 * publishes readable names without importing `api/**`.
 *
 * The write half is the one gap this migration could not close from inside the plugin:
 * the kernel injects a decryptor but no encryptor, and `POST /api/students` must keep
 * storing names the same way the legacy service did (`encrypt()` in `api/db.ts`, AES-256-CBC,
 * `iv:hex` format). Storing plaintext instead would silently drop at-rest encryption for
 * every new student, which is a security regression dressed up as an implementation detail.
 *
 * So: if the host ever injects `encryptName` (duck-typed, so a kernel change is picked up
 * with no further edit here) that is used; otherwise this mirrors `api/db.ts` exactly,
 * same key source and same wire format, so existing readers decrypt it unchanged. When no
 * decryptor is injected at all the database is unencrypted (the in-memory test databases,
 * and every existing test), and the identity cipher is correct - the same reasoning the
 * port already documents for names.
 */
export function createNameCipher(ctx: KernelContext): NameCipher {
  const decrypt = ctx.config.decryptName;
  if (!decrypt) {
    return { decrypt: (value: string) => value, encrypt: (value: string) => value };
  }

  const injected = (ctx.config as unknown as { encryptName?: (value: string) => string }).encryptName;
  if (typeof injected === 'function') {
    return { decrypt, encrypt: injected };
  }

  const key = Buffer.from(String(ctx.config.get('ENCRYPTION_KEY', DEFAULT_ENCRYPTION_KEY)));
  return {
    decrypt,
    encrypt(text: string) {
      if (!text) return text;
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv('aes-256-cbc', key, iv);
      const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
      return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
    },
  };
}

/**
 * Resolve the caller, with the same precedence `api/utils/requestAuth.ts` used:
 *
 *   1. the kernel's verified request context, including a verdict of "anonymous";
 *   2. only when the middleware did not run, the legacy `x-user-*` headers.
 *
 * The kernel's `getRequestContext()` throws when the middleware was absent, hence the
 * explicit presence check - the same shape the legacy carrier check had.
 */
export function requestActor(req: Request): RequestActor {
  const carrier = req as Request & { context?: unknown };

  if (carrier?.context) {
    const { actor } = getRequestContext(req);
    return actor ? { id: actor.userId, role: actor.role } : { id: null, role: null };
  }

  const header = typeof (req as Request)?.header === 'function' ? (req as Request).header.bind(req) : null;
  const roleHeader = header ? header('x-user-role') : null;
  const idHeader = header ? header('x-user-id') : undefined;
  const parsedId = idHeader ? Number(idHeader) : null;

  return {
    id: parsedId !== null && Number.isFinite(parsedId) ? parsedId : null,
    role: roleHeader ?? null,
  };
}
