/**
 * classroom row and input types.
 *
 * The legacy service reached every table through one shared connection and typed almost
 * nothing (every row was `any`). These types keep the *shape* that the HTTP surface
 * serialises - the frontend reads these column names verbatim - without pretending the
 * database is normalised.
 */

/** Raw `students` row, as stored. `name` is encrypted at rest for modern rows. */
export interface StudentRow {
  id: number;
  user_id: number | null;
  class_id: number;
  group_id?: number | null;
  name: string;
  total_points: number | null;
  available_points: number | null;
  last_checkin_date?: string | null;
  birthday?: string | null;
  created_at?: string;
  [column: string]: unknown;
}

/** `students` joined with `users` and `student_groups`, which is what the routes return. */
export interface StudentDetailRow extends StudentRow {
  /** Not present when the student has no user row; the legacy JOIN is INNER on `users`. */
  username?: string;
  group_name?: string | null;
}

/** Raw `classes` row. `enable_*` columns are the legacy feature flags. */
export interface ClassRow {
  id: number;
  name: string;
  teacher_id: number | null;
  invite_code: string;
  pet_selection_mode?: string | null;
  created_at?: string;
  [column: string]: unknown;
}

/** One `records` row: the shared point ledger. */
export interface LedgerRow {
  id: number;
  student_id: number;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
  /** Present only on the JOINed `getRecords` reads. */
  student_name?: string;
}

/** A class-scope feature flag map (`enable_shop` -> boolean). */
export type ClassFeatures = Record<string, boolean>;

/** Request identity, as `api/utils/requestAuth.ts` resolved it. */
export interface RequestActor {
  id: number | null;
  role: string | null;
}

/** A student account created by `createStudent` / `batchImport`. */
export interface CreatedStudent {
  id: number;
  user_id: number;
  username: string;
  class_id: number;
  name: string;
}

/** Caller-supplied options for `createStudentAccount`. */
export interface CreateStudentAccountInput {
  username: string;
  name: string;
  classId?: unknown;
  allowUsernameSuffix?: boolean;
  initialPassword?: string;
}
