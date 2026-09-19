/**
 * economy's account-deletion cleanup rule.
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
 * ## The stock ids are derived from the classes, inside the transaction
 *
 * `CleanupSubject` names the teacher, their classes, their students and their logins - not stocks.
 * The pre-migration cascade derived them with `SELECT id FROM stocks WHERE class_id IN classIds`
 * (lines 256-263), and only when there was at least one class; this rule repeats that lookup. The
 * read has to happen *inside* the same transaction, because the batch is deleting other domains'
 * rows around it.
 *
 * ## Order inside this rule
 *
 * `student_stocks` before `stocks` - `student_stocks.stock_id -> stocks.id` - and
 * `bank_accounts` last. The registry orders *rules*; the classroom rule that deletes `students`
 * runs after this one because `bank_accounts.student_id -> students.id`, which is the same ordering
 * the pre-migration cascade did by hand.
 */

import type { CleanupRule, DbApi, SqlFragment } from '@thinkclass/plugin-sdk';
import { inList, orAll } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = ['student_stocks', 'stocks', 'bank_accounts'];

/** `SELECT id FROM <table> WHERE <predicate>` - one pre-migration `findMany({ select: { id } })`. */
function idsOf(tx: DbApi, table: string, predicate: SqlFragment): number[] {
  return tx
    .query<{ id: number }>(`SELECT id FROM ${table} WHERE ${predicate.sql}`, predicate.params)
    .map((row) => row.id);
}

export function createEconomyCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const classes = inList('class_id', subject.classIds);
      const students = inList('student_id', subject.studentIds);

      // stockIds: `stocks` where `class_id IN classIds`, only when there is at least one class
      // (lines 256-263 - the pre-migration code used `Promise.resolve([])` in the else branch).
      // `inList` is null for an empty class set, which is exactly that branch.
      const stockIds = classes ? idsOf(tx, 'stocks', classes) : [];

      // student_stocks: `if (stockIds.length || studentIds.length)` -> `deleteMany({ OR: [stock_id
      // IN stockIds, student_id IN studentIds] })` (lines 433-442). `orAll` is null in exactly the
      // case the guard skipped.
      const studentStocks = orAll([inList('stock_id', stockIds), students]);
      if (studentStocks) {
        tx.run(`DELETE FROM student_stocks WHERE ${studentStocks.sql}`, studentStocks.params);
      }

      // stocks: only when the derived set is non-empty (lines 443-445).
      const stockRows = inList('id', stockIds);
      if (stockRows) {
        tx.run(`DELETE FROM stocks WHERE ${stockRows.sql}`, stockRows.params);
      }

      // bank_accounts: `deleteMany({ student_id: { in: studentIds } })`, inside the
      // `studentIds.length` block (lines 457-458).
      if (students) {
        tx.run(`DELETE FROM bank_accounts WHERE ${students.sql}`, students.params);
      }
    },
  };
}
