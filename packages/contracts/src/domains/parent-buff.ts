/**
 * parent-buff domain contracts.
 *
 * The blessing itself (`POST /api/parent-buff`) stays inside its plugin: nothing else needs to
 * create one. What *is* cross-domain is the parent-login activity record.
 *
 * ## Why this port exists
 *
 * `api/modules/auth/auth.service.ts` writes a `parent_activity` row on every parent login
 * (`INSERT ... ON CONFLICT(parent_id, student_id) DO UPDATE SET last_active_date = ?`), while
 * `plugins/parent-buff` owns that table and writes a *different* kind of row into it
 * (`activity_type = 'PARENT_BUFF'`, no `parent_id`). Two writers of one table is exactly what
 * the ownership model forbids, and identity cannot simply adopt the table: it is parent-buff's
 * storage, and `parentBuff.repository.ts` reads today's blessing out of it.
 *
 * So the owner publishes the narrow operation the other domain actually needs, and identity
 * calls it instead of writing the table. The alternative - letting identity declare
 * `parent_activity` as adopted too - would make "one writer per table" false for a table two
 * plugins write, which is the state `redemption_tickets` is already in and which HANDOFF
 * section 8.9 records as the model's worst wart.
 *
 * Type-only: guardrail G6.
 */

export interface ParentActivityRecorder {
  /**
   * Record that a parent was active with one of their students today.
   *
   * `day` is passed in rather than computed here so the caller owns the clock: the legacy call
   * site derived it from `new Date().toISOString().split('T')[0]` (UTC), and a port that
   * invented its own notion of "today" would silently change which day a login lands on.
   *
   * Upserts on `(parent_id, student_id)` - the pair the UNIQUE index
   * `idx_parent_activity_parent_student` covers - so repeated logins update one row instead of
   * appending.
   */
  touchParentLogin(parentId: number, studentId: number, day: string): Promise<void>;
}
