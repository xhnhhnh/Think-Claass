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
  };
}
