/**
 * identity's account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes, their students and everything
 * those students own. Before this round the whole cascade was one Prisma transaction inside
 * `api/modules/admin/admin.repository.ts` that deleted from 58 tables by hard-coded name - atomic,
 * but invisible to every ownership check the plugin runtime enforces. The ruling in
 * `docs/migration/admin-cascade-decision.md` hands each table back to its owner and keeps the
 * atomicity by running the owners' rules in one transaction.
 *
 * This file is one of those rules. Its statements are the pre-migration ones, ported verbatim from
 * `admin.repository.ts` (the pre-migration line numbers are cited per block below) - the point is
 * *who* deletes, not *what* is deleted.
 *
 * ## What this rule owns, and why it runs last
 *
 * `users` is referenced by 61 tables and `activation_events` / `activation_codes` reference it too,
 * so this is the tail of the cascade: the runtime orders rules from the schema's foreign keys, and
 * every rule whose tables point at `users` runs before this one. Inside the rule the activation
 * rows go first for the same reason - `activation_events.user_id -> users.id`.
 *
 * `activation_events` and `activation_codes` are not deleted: an activation code is a reusable
 * one-time credential, so the pre-migration cascade only cleared `used_by` when the user it was
 * consumed by disappeared (that is the whole point of the column). That asymmetry is preserved.
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';
import { inList } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from or updates. Every one is declared in the manifest, and the runtime
 * refuses to register a rule that names anything else - which is what makes "it only touches its own
 * data" a checked property instead of a review habit.
 */
const TABLES = ['activation_events', 'activation_codes', 'users'];

export function createIdentityCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      // `subject.userIds` plays the role of the pre-migration `affectedUserIds` (line 215): the
      // teacher's own login row plus the login rows of the students in their classes.
      const events = inList('user_id', subject.userIds);
      const codes = inList('used_by', subject.userIds);

      // activation_events: `deleteMany({ user_id: { in: affectedUserIds } })`
      // activation_codes: `updateMany({ where: { used_by: { in: affectedUserIds } }, data:
      // { used_by: null } })` - the code row itself survives, it is the redemption that is
      // forgotten (lines 559-566). Both were inside the same `affectedUserIds.length` guard, which
      // is exactly the null case of `inList`.
      if (events) {
        tx.run(`DELETE FROM activation_events WHERE ${events.sql}`, events.params);
      }
      if (codes) {
        tx.run(`UPDATE activation_codes SET used_by = NULL WHERE ${codes.sql}`, codes.params);
      }

      // users: one statement replaces both pre-migration ones - `deleteMany({ id: { in:
      // studentUserIds } })` followed by the always-run `delete({ id: teacherId })` (lines
      // 568-571). The old code split them only because it held two different sets; `subject.userIds`
      // is already `teacherId + studentUserIds`, so `id IN userIds` deletes exactly the union those
      // two statements deleted, in one pass. The guard is the usual "no ids means no rows" branch:
      // `userIds` always contains the account's own login row, and an empty set must never widen
      // into a full-table delete.
      const userRows = inList('id', subject.userIds);
      if (userRows) {
        tx.run(`DELETE FROM users WHERE ${userRows.sql}`, userRows.params);
      }
    },
  };
}
