/**
 * Password hashing - compatibility re-export.
 *
 * The implementation now lives in the kernel (`packages/kernel/src/auth/password.ts`).
 * This module is kept so existing imports across `api/**` and the existing test
 * suite keep working unchanged; it will be deleted in P7 once every caller imports
 * the kernel directly.
 */

export { hashPassword, isPasswordHash, verifyPassword } from '@thinkclass/kernel';
