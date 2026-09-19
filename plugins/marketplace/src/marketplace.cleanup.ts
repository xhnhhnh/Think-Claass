/**
 * marketplace's account-deletion cleanup rule.
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
 * ## `redemption_tickets` has two writers but exactly one cleanup owner
 *
 * `redemption_tickets` is the guardrail's documented `SHARED_WRITE_TABLES` exception: this plugin
 * issues tickets for shop purchases, and `plugins/engagement` issues them as lucky-draw prizes and
 * marks them used. Ownership of the *writes* is therefore still open, but ownership of the
 * *cleanup* cannot be: the registry accepts one cleanup owner per table and rejects a second
 * registration outright, which fails that plugin's `setup()` rather than silently double-deleting.
 * Marketplace is the owner because the table's lifecycle (and its CRUD) lives here - engagement
 * only hands out prizes - so the pre-migration `redemption_tickets.deleteMany({ student_id: {
 * in: studentIds } })` (line 472) is ported here, and `plugins/engagement` must not register a rule
 * naming this table.
 *
 * ## Order inside this rule
 *
 * `redemption_tickets` before `shop_items`: `redemption_tickets.item_id -> shop_items.id`, so a
 * ticket that is not deleted first would refuse to let its shop item go. This is also the
 * pre-migration order (line 472 against line 554). The registry orders *rules*; ordering within one
 * owner's set of tables is the owner's job.
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';
import { inList } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = ['redemption_tickets', 'shop_items'];

export function createMarketplaceCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      // redemption_tickets: `deleteMany({ student_id: { in: studentIds } })`, inside the
      // `studentIds.length` block (line 472).
      const students = inList('student_id', subject.studentIds);
      if (students) {
        tx.run(`DELETE FROM redemption_tickets WHERE ${students.sql}`, students.params);
      }

      // shop_items: `deleteMany({ teacher_id: teacherId })`, unconditional in the pre-migration
      // cascade (line 554).
      const teachers = inList('teacher_id', subject.teacherIds);
      if (teachers) {
        tx.run(`DELETE FROM shop_items WHERE ${teachers.sql}`, teachers.params);
      }
    },
  };
}
