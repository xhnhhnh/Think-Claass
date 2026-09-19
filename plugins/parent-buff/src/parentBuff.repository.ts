/**
 * Parent-buff repository.
 *
 * The SQL is relocated from `api/modules/platform/platform.service.ts` unchanged; only the
 * connection changes - `ctx.db` instead of the raw `api/db.ts` handle.
 *
 * The "already blessed today?" check is `date(created_at) = ?`, not a range comparison:
 * that is what the original did, and it keeps working because `created_at` is stored by
 * SQLite's CURRENT_TIMESTAMP as a UTC `YYYY-MM-DD HH:MM:SS` string that `date()` parses.
 */

import type { DbApi, SqlParam } from '@thinkclass/plugin-sdk';

export interface ParentBuffRepository {
  /** Id of today's existing blessing for this student, if any. */
  findToday(studentId: SqlParam, today: string): { id: number } | undefined;
  insert(studentId: SqlParam): void;
  /**
   * Record the parent's activity for today: one row per `(parent_id, student_id)`.
   *
   * The conflict target is the pair the UNIQUE index `idx_parent_activity_parent_student`
   * covers - NOT the student alone. The blessing rows this plugin also writes carry a
   * `student_id` with a NULL `parent_id` and `activity_type = 'PARENT_BUFF'`, so an upsert
   * keyed on the student would overwrite a blessing with a login.
   *
   * This is the write `api/modules/auth/auth.service.ts` performed through Prisma; it moved
   * here because this plugin owns the table (P4.3b.7).
   */
  upsertParentLogin(parentId: SqlParam, studentId: SqlParam, day: string): void;
}

export function createParentBuffRepository(db: DbApi): ParentBuffRepository {
  return {
    findToday(studentId, today) {
      return db.get<{ id: number }>(
        'SELECT id FROM parent_activity WHERE student_id = ? AND date(created_at) = ?',
        [studentId, today],
      );
    },

    /**
     * `(student_id, activity_type, points_awarded)` - deliberately NOT `parent_id`, which is
     * nullable in the schema and which the original never set either. The blessing is
     * recorded against the *student*; who cast it is not tracked here.
     */
    insert(studentId) {
      db.run('INSERT INTO parent_activity (student_id, activity_type, points_awarded) VALUES (?, ?, ?)', [
        studentId,
        'PARENT_BUFF',
        0,
      ]);
    },

    upsertParentLogin(parentId, studentId, day) {
      db.run(
        `INSERT INTO parent_activity (parent_id, student_id, activity_type, last_active_date)
         VALUES (?, ?, 'login', ?)
         ON CONFLICT(parent_id, student_id) DO UPDATE SET last_active_date = excluded.last_active_date`,
        [parentId, studentId, day],
      );
    },
  };
}
