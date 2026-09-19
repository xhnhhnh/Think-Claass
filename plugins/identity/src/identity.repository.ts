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

/** A `users` row as the admin console's credential check reads it (`admin.repository.ts:598-610`). */
export interface AdminCredentialRow {
  id: number;
  role: string;
  username: string;
  password_hash: string;
}

/** A teacher row as the console's list/create/update answer it (`admin.repository.ts:49-56`). */
export interface TeacherRowDetail {
  id: number;
  username: string;
  is_activated: number | null;
}

/**
 * One `activation_codes` row joined to the username that claimed it.
 *
 * There is no foreign key from `activation_events.activation_code` to this table, so the newest
 * event is a second query rather than a join - exactly the two-query shape of
 * `admin.repository.ts:797-819` plus `:120-154`.
 */
export interface ActivationCodeListRow {
  id: number;
  code: string;
  status: string | null;
  used_by: number | null;
  created_at: string | null;
  used_at: string | null;
  used_by_username: string | null;
}

/** The newest `activation_events` row for a code, projected to the two columns the list shows. */
export interface ActivationEventSummaryRow {
  activation_code: string | null;
  source: string;
  remark: string | null;
}

/** A superadmin row preserved across a database reset (`admin.repository.ts:1009-1027`). */
export interface SuperadminRow {
  id: number;
  username: string;
  password_hash: string;
  is_activated: number | null;
}

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

  // -- the admin console's view (P4.3b.14) ---------------------------------
  //
  // Ported from the Prisma calls in `api/modules/admin/admin.repository.ts`; the citations
  // are the line ranges of the statements each method reproduces.

  /** `admin.repository.ts:599-610`: an admin-or-superadmin row by username. */
  findAdminByCredentials(username: string): AdminCredentialRow | undefined;
  /** `:702-710`: every teacher in id order. */
  listTeacherRows(): TeacherRowDetail[];
  /** The `:753-756` existence check, also the console's "is this id a teacher" read (`:189-195`). */
  findTeacherRow(id: SqlParam): TeacherRowDetail | undefined;
  /** `:718-730`: the row `createTeacher` inserts, `is_activated` forced to 1. */
  insertTeacher(input: { username: string; passwordHash: string }): number;
  /** `:762-773`: the username, and the hash only when a password was given. */
  updateTeacherRow(id: SqlParam, input: { username: string; passwordHash: string | null }): void;
  /** `:798-815`: every code with the username that used it, newest first. */
  listActivationCodeRows(): ActivationCodeListRow[];
  /** `:846-864`, with `created_at DESC` ordering preserved. */
  listActivationCodeRowsByCodes(codes: string[]): ActivationCodeListRow[];
  /** `:125-138`: the newest events for a set of codes, newest first. */
  findActivationEventSummaries(codes: string[]): ActivationEventSummaryRow[];
  /** `:167-170` and `:829-836`: the code row an insert created. */
  insertActivationCode(code: string): number;
  /** `:1010-1019`: superadmins in id order. */
  listSuperadminRows(): SuperadminRow[];
  /** `:1030`: the delete half of the reset round-trip. */
  deleteSuperadmins(): void;
  /** `:1036-1044`: the restore half, with the explicit id the snapshot carries. */
  insertSuperadmin(row: SuperadminRow): void;
  /** Run `fn` in one transaction; nested calls join the outer one. */
  tx<T>(fn: () => T): T;

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
  /** The columns the admin console's teacher table renders, in the pre-migration order. */
  const TEACHER_DETAIL_SELECT = `SELECT id, username, is_activated FROM users`;

  /** The activation-code projection, joined to the username that claimed the code. */
  const ACTIVATION_CODE_SELECT = `
    SELECT c.id, c.code, c.status, c.used_by, c.created_at, c.used_at, u.username AS used_by_username
    FROM activation_codes c
    LEFT JOIN users u ON u.id = c.used_by
  `;

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

    // -- the admin console's view (P4.3b.14) ---------------------------------

    /**
     * `admin.repository.ts:599-610`. `db.get` is `LIMIT 1`, which is what Prisma's `findFirst`
     * compiled to; `username` is UNIQUE, so there is at most one candidate anyway.
     *
     * The role filter is in SQL *and* re-checked by the service, because the pre-migration code
     * did both (`:612-614`) - the query is the lookup, the check is the rule.
     */
    findAdminByCredentials(username) {
      return db.get<AdminCredentialRow>(
        `SELECT id, role, username, password_hash FROM users
          WHERE username = ? AND role IN ('admin', 'superadmin')`,
        [username],
      );
    },

    listTeacherRows() {
      return db.query<TeacherRowDetail>(`${TEACHER_DETAIL_SELECT} WHERE role = 'teacher' ORDER BY id ASC`);
    },

    findTeacherRow(id) {
      return db.get<TeacherRowDetail>(`${TEACHER_DETAIL_SELECT} WHERE id = ? AND role = 'teacher'`, [id]);
    },

    insertTeacher(input) {
      const info = db.run(
        `INSERT INTO users (role, username, password_hash, is_activated) VALUES ('teacher', ?, ?, 1)`,
        [input.username, input.passwordHash],
      );
      return Number(info.lastInsertRowid);
    },

    updateTeacherRow(id, input) {
      // The password is optional and the pre-migration `update` spread it in only when truthy
      // (`:764-767`), so a `null` hash means "leave the column alone" rather than "set NULL".
      if (input.passwordHash === null) {
        db.run(`UPDATE users SET username = ? WHERE id = ?`, [input.username, id]);
        return;
      }
      db.run(`UPDATE users SET username = ?, password_hash = ? WHERE id = ?`, [
        input.username,
        input.passwordHash,
        id,
      ]);
    },

    listActivationCodeRows() {
      return db.query<ActivationCodeListRow>(`${ACTIVATION_CODE_SELECT} ORDER BY c.created_at DESC`);
    },

    listActivationCodeRowsByCodes(codes) {
      if (codes.length === 0) return [];
      return db.query<ActivationCodeListRow>(
        `${ACTIVATION_CODE_SELECT} WHERE c.code IN (${codes.map(() => '?').join(', ')}) ORDER BY c.created_at DESC`,
        codes,
      );
    },

    /**
     * The newest event per code, newest first - the pre-migration query was a plain
     * `ORDER BY created_at DESC` and the caller kept the first row per code (`:125-151`), so the
     * "first wins" rule stays in the service rather than being hidden in SQL.
     */
    findActivationEventSummaries(codes) {
      if (codes.length === 0) return [];
      return db.query<ActivationEventSummaryRow>(
        `SELECT activation_code, source, remark FROM activation_events
          WHERE activation_code IN (${codes.map(() => '?').join(', ')})
          ORDER BY created_at DESC`,
        codes,
      );
    },

    insertActivationCode(code) {
      const info = db.run(`INSERT INTO activation_codes (code, status) VALUES (?, 'unused')`, [code]);
      return Number(info.lastInsertRowid);
    },

    listSuperadminRows() {
      return db.query<SuperadminRow>(
        `SELECT id, username, password_hash, is_activated FROM users WHERE role = 'superadmin' ORDER BY id ASC`,
      );
    },

    deleteSuperadmins() {
      db.run(`DELETE FROM users WHERE role = 'superadmin'`);
    },

    insertSuperadmin(row) {
      // The id is explicit: the reset flow restores the very rows it read, and the ids are part of
      // what other tables already reference.
      db.run(
        `INSERT INTO users (id, role, username, password_hash, is_activated) VALUES (?, 'superadmin', ?, ?, ?)`,
        [row.id, row.username, row.password_hash, row.is_activated],
      );
    },

    tx(fn) {
      return db.tx(() => fn());
    },
  };
}
