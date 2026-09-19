/**
 * Identity repository - the SQL for `users`, `activation_codes` and `activation_events`.
 *
 * Relocated from the Prisma calls in `api/modules/auth/auth.service.ts` and
 * `api/services/activationService.ts`. Three properties of the originals are load-bearing and
 * are reproduced deliberately:
 *
 *  1. **`findFirst` is `LIMIT 1` without an ORDER BY.** `login` looked up
 *     `{ username, role }` and took whatever row came back; `username` is UNIQUE, so the order
 *     cannot matter in practice, and adding a sort would be inventing a rule the product never
 *     had.
 *  2. **The activation-code claim is a guarded UPDATE**, not read-then-write: the pre-migration
 *     code checked `status === 'used'` in the service and then updated by id. Keeping the check
 *     outside the write preserves the observable behaviour (a second caller sees
 *     `该激活码已被使用`), and `changes === 0` is reported so the service can tell the two apart.
 *  3. **`updateProfile`'s duplicate-username check excludes the caller's own row**
 *     (`NOT: { id: actor.id }`), otherwise saving an unchanged username would answer
 *     `用户名已存在`.
 */

import type { DbApi, SqlParam } from '@thinkclass/plugin-sdk';

import type { ActivationCodeRow, ActivationEventRow, UserRow } from './identity.types.js';

export interface IdentityRepository {
  findUserByCredentials(username: string, role: string): UserRow | undefined;
  findUserById(userId: SqlParam): UserRow | undefined;
  findUserByUsername(username: string): { id: number } | undefined;
  /** Lowest id for a role, or `undefined`. Ordered, unlike the pre-migration bare `LIMIT 1`. */
  findFirstUserIdByRole(role: string): { id: number } | undefined;
  findUserByUsernameOtherThan(username: string, excludeUserId: number): { id: number } | undefined;
  createUser(input: { role: string; username: string; passwordHash: string }): number;
  updateUserPasswordHash(userId: SqlParam, passwordHash: string): void;
  updateUsernameAndPassword(userId: SqlParam, username: string, passwordHash: string | null): void;

  findActivationCode(code: string): ActivationCodeRow | undefined;
  claimActivationCode(codeId: SqlParam, userId: SqlParam, usedAt: string): number;

  findActivationEvent(input: {
    userId: number;
    source: string;
    activationCode: string | null;
    orderId: number | null;
  }): ActivationEventRow | undefined;
  /** Everything one activation writes, in one transaction. */
  applyActivation(input: {
    userId: number;
    source: string;
    activationCode: string | null;
    orderId: number | null;
    remark: string | null;
  }): ActivationEventRow;
}

export function createIdentityRepository(db: DbApi): IdentityRepository {
  function findActivationEvent(input: {
    userId: number;
    source: string;
    activationCode: string | null;
    orderId: number | null;
  }): ActivationEventRow | undefined {
    // `= ?` on a nullable column matches SQLite's `IS ?` semantics for NULL, which is what
    // Prisma's `where: { activation_code: null }` compiled to as well.
    return db.get<ActivationEventRow>(
      `SELECT * FROM activation_events
        WHERE user_id = ? AND source = ? AND activation_code IS ? AND order_id IS ?
        ORDER BY id LIMIT 1`,
      [input.userId, input.source, input.activationCode as never, input.orderId as never],
    );
  }

  return {
    findUserByCredentials(username, role) {
      return db.get<UserRow>(`SELECT * FROM users WHERE username = ? AND role = ? LIMIT 1`, [username, role]);
    },

    findUserById(userId) {
      return db.get<UserRow>(`SELECT * FROM users WHERE id = ?`, [userId]);
    },

    /**
     * The pre-migration duplicate check, and the reason it is `(username, role)` and not just
     * `username`: `users.username` carries a UNIQUE constraint, so creating a row whose username
     * exists under a *different* role would fail with a raw SQLite error rather than the friendly
     * 400 the old code produced. The caller therefore checks twice - this lookup for the same
     * role, and `catchUniqueViolation` for the cross-role case - which is what Prisma's P2002
     * branch used to cover.
     */
    findUserByUsername(username) {
      return db.get<{ id: number }>(`SELECT id FROM users WHERE username = ? LIMIT 1`, [username]);
    },

    findFirstUserIdByRole(role) {
      return db.get<{ id: number }>(`SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1`, [role]);
    },

    createUser(input) {
      const info = db.run(`INSERT INTO users (role, username, password_hash) VALUES (?, ?, ?)`, [
        input.role,
        input.username,
        input.passwordHash,
      ]);
      return Number(info.lastInsertRowid);
    },

    /**
     * FOREIGN-ISH READ - `users` is this plugin's table, but the query is the profile route's
     * duplicate-name check, which is why it lives here rather than in the service.
     */
    findUserByUsernameOtherThan(username, excludeUserId) {
      return db.get<{ id: number }>(`SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1`, [
        username,
        excludeUserId,
      ]);
    },

    updateUserPasswordHash(userId, passwordHash) {
      db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, userId]);
    },

    updateUsernameAndPassword(userId, username, passwordHash) {
      if (passwordHash === null) {
        db.run(`UPDATE users SET username = ? WHERE id = ?`, [username, userId]);
        return;
      }
      db.run(`UPDATE users SET username = ?, password_hash = ? WHERE id = ?`, [username, passwordHash, userId]);
    },

    findActivationCode(code) {
      return db.get<ActivationCodeRow>(`SELECT * FROM activation_codes WHERE code = ?`, [code]);
    },

    claimActivationCode(codeId, userId, usedAt) {
      const result = db.run(
        `UPDATE activation_codes SET status = 'used', used_by = ?, used_at = ? WHERE id = ?`,
        [userId, usedAt, codeId],
      );
      return result.changes;
    },

    findActivationEvent,

    /**
     * The writes the pre-migration `activateUser()` performed inside one Prisma
     * `$transaction`: flip `is_activated` and insert the ledger row.
     *
     * **One write the original did here is deliberately absent: marking the payment order
     * paid.** `payment_orders` is the payment domain's table, and this plugin does not adopt it,
     * so the call would fail the ownership check the moment ownership is enforced (which it is,
     * outside production - `contextFactory` sets `strict = env !== 'production'`). The payment
     * flow owns that row and will update it as part of its own transaction when it moves into a
     * plugin; until then `paymentService.markOrderPaid` keeps doing exactly what it does today,
     * immediately before calling this port. See the note on `IdentityPort.activateUser`.
     */
    applyActivation(input) {
      return db.tx(() => {
        db.run(`UPDATE users SET is_activated = 1 WHERE id = ?`, [input.userId]);

        const info = db.run(
          `INSERT INTO activation_events (user_id, source, activation_code, order_id, remark)
           VALUES (?, ?, ?, ?, ?)`,
          [
            input.userId,
            input.source,
            input.activationCode as never,
            input.orderId as never,
            input.remark as never,
          ],
        );

        return db.get<ActivationEventRow>(`SELECT * FROM activation_events WHERE id = ?`, [
          Number(info.lastInsertRowid),
        ]) as ActivationEventRow;
      });
    },
  };
}
