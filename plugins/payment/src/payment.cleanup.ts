/**
 * payment's account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` deletes a teacher, their classes, their students and everything
 * those students own. Before this round the whole cascade was one Prisma transaction inside
 * `api/modules/admin/admin.repository.ts` that deleted from 58 tables by hard-coded name - atomic,
 * but invisible to every ownership check the plugin runtime enforces. The ruling in
 * `docs/migration/admin-cascade-decision.md` hands each table back to its owner and keeps the
 * atomicity by running the owners' rules in one transaction.
 *
 * ## Why an infrastructure plugin still has to be reached
 *
 * This plugin is `tier: "infrastructure"` and `required: true`, which changes nothing about the rule
 * itself but does change the answer to "can the account deletion skip it": it cannot. A required
 * plugin is started by every composition, so its rule is always registered, and the executor's
 * coverage check (a table with no rule is a named failure) would catch a build where it was not.
 * That matters here because `payment_orders.user_id -> users.id` and
 * `payment_transactions.order_id -> payment_orders.id`: an account whose orders survived the purge
 * would make the `users` delete fail on a foreign key, and the failure would surface far from its
 * cause. An optional plugin's tables would be a deployment-dependent orphan; these cannot be.
 *
 * ## The two statements
 *
 * Ported verbatim from `admin.repository.ts` - the ids are derived once, near the top of the
 * pre-migration cascade (lines 338-345), and the deletes run at its end (lines 556-561):
 *
 *   const paymentOrderIds = SELECT id FROM payment_orders WHERE user_id IN affectedUserIds
 *   if (paymentOrderIds.length) DELETE FROM payment_transactions WHERE order_id IN paymentOrderIds
 *   if (affectedUserIds.length) DELETE FROM payment_orders WHERE user_id IN affectedUserIds
 *
 * `affectedUserIds` is `subject.userIds` (the teacher's login row plus the login rows of their
 * students). Child before parent, and both deletes keep their pre-migration guards: the id list is
 * derived first so the transaction delete stays exactly "the transactions of the orders I am about
 * to delete", and neither statement runs on an empty set.
 *
 * Deriving the ids inside the rule is safe under the executor's ordering: a rule is the only writer
 * of its own tables, so nothing between the SELECT and the DELETE can change what the SELECT saw.
 * The registry orders this rule before identity's `users` rule, because `payment_orders` references
 * `users`.
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';
import { inList } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Every one is declared in the manifest, and the runtime refuses to
 * register a rule that names anything else - which is what makes "it only touches its own data" a
 * checked property instead of a review habit.
 */
const TABLES = ['payment_orders', 'payment_transactions'];

export function createPaymentCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const users = inList('user_id', subject.userIds);

      // `SELECT` first, delete second - the pre-migration order (lines 338-345 then 556-561). The
      // query only runs when there are user ids at all, which is also the outer guard.
      const orderIds = users
        ? tx
            .query<{ id: number }>(`SELECT id FROM payment_orders WHERE ${users.sql}`, users.params)
            .map((row) => row.id)
        : [];

      const orders = inList('order_id', orderIds);
      if (orders) {
        tx.run(`DELETE FROM payment_transactions WHERE ${orders.sql}`, orders.params);
      }

      if (users) {
        tx.run(`DELETE FROM payment_orders WHERE ${users.sql}`, users.params);
      }
    },
  };
}
