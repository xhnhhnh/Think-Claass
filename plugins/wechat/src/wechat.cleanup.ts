/**
 * wechat's account-deletion cleanup rule.
 *
 * `DELETE /api/admin/users/:id` erases a teacher, their classes, their students and everything those
 * students own. Each domain deletes its own rows and the runtime runs every rule inside one
 * transaction (`docs/migration/admin-cascade-decision.md`).
 *
 * ## Why this rule is not optional
 *
 * `p_wechat_accounts.user_id` is a `users` row this plugin does not own and deliberately has no
 * foreign key to. Nothing at the database level would remove it, so without this rule a deleted
 * student leaves a binding behind - and if the same account id is ever reused, the WeChat account
 * that was bound to the deleted user would silently log in as the new one. That is the failure this
 * rule exists to make impossible.
 *
 * Tickets are removed first, by the openids this rule is about to delete: `p_wechat_login_tickets`
 * carries no `user_id`, so after the accounts are gone there is nothing left to join on. They expire
 * in ten minutes anyway, but "expires soon" is not the same as "cannot outlive its account".
 *
 * Every id set is read *inside* the transaction, and the rule is synchronous - the runtime asserts
 * it, because better-sqlite3's transaction callback cannot await.
 */

import type { CleanupRule, DbApi } from '@thinkclass/plugin-sdk';

/**
 * Tables this rule deletes from. Both are declared in `data.tables`, which is what the runtime
 * checks before registering the rule - so "this plugin only erases its own data" is enforced rather
 * than reviewed.
 */
const TABLES = ['p_wechat_login_tickets', 'p_wechat_accounts'];

export function createWechatCleanupRule(): CleanupRule {
  return {
    tables: TABLES,

    run(tx: DbApi, subject): void {
      const userIds = subject.userIds;
      if (userIds.length === 0) return;

      const placeholders = userIds.map(() => '?').join(', ');
      const openids = tx.query<{ openid: string }>(
        `SELECT openid FROM p_wechat_accounts WHERE user_id IN (${placeholders})`,
        userIds,
      );

      if (openids.length > 0) {
        const openidPlaceholders = openids.map(() => '?').join(', ');
        tx.run(
          `DELETE FROM p_wechat_login_tickets WHERE openid IN (${openidPlaceholders})`,
          openids.map((row) => row.openid),
        );
      }

      tx.run(`DELETE FROM p_wechat_accounts WHERE user_id IN (${placeholders})`, userIds);
    },
  };
}
