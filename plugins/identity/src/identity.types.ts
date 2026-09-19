/**
 * identity row and input types.
 *
 * The legacy module typed almost nothing (`any` everywhere) and reached the database through
 * Prisma. Here the rows are explicit, because the repository is hand-written SQL and the column
 * names are the contract with `prisma/schema.prisma` (which still models these tables and which
 * G13 checks has a table for every model).
 */

/** Raw `users` row, as stored. `password_hash` is either a scrypt hash or legacy plaintext. */
export interface UserRow {
  id: number;
  role: string;
  username: string;
  password_hash: string;
  is_activated: number | null;
}

/** Raw `activation_codes` row. */
export interface ActivationCodeRow {
  id: number;
  code: string;
  status: string | null;
  used_by: number | null;
  created_at?: string | null;
  used_at?: string | null;
}

/** Raw `activation_events` row. */
export interface ActivationEventRow {
  id: number;
  user_id: number;
  source: string;
  activation_code: string | null;
  order_id: number | null;
  remark: string | null;
  created_at: string;
}

/** The caller, as `api/utils/requestAuth.ts` resolved it. */
export interface RequestActor {
  id: number | null;
  role: string | null;
}

/**
 * What the login route serialises.
 *
 * Two spellings of the class id (`classId` *and* `class_id`) are not an accident: the legacy
 * response carried both and the frontend reads both, so dropping either is a client-visible
 * change. `name` is the *decrypted* student name, or absent for an account with no student row.
 */
export interface LoginUserPayload {
  id: number;
  role: string;
  username: string;
  studentId?: number;
  parentId?: number;
  classId?: number;
  class_id?: number;
  name?: string;
  is_activated: boolean;
}
