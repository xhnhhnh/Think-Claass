/**
 * wechat repository - the two tables this plugin owns, and nothing else.
 *
 * Every statement names a `p_wechat_*` table, so the ownership check in `ctx.db` has nothing to
 * permit outside them. The account a binding points at is never read here: it arrives through
 * `identity.public`, which is why `plugin.json` declares `adopted` and `reads` empty and why a query
 * against `users` in this file would fail loudly rather than quietly work.
 *
 * ## Timestamps
 *
 * ISO strings written by this file. These tables are created by this plugin's own migration rather
 * than the application's Prisma-managed schema, so there is no projection to reproduce - but the
 * format matches what the rest of the API answers with anyway.
 */

import type { DbApi } from '@thinkclass/plugin-sdk';

import type { WechatAccountRow, WechatTicketRow } from './wechat.types.js';

export interface LinkAccountInput {
  openid: string;
  unionid: string | null;
  userId: number;
  role: string;
}

export interface CreateTicketInput {
  ticketHash: string;
  openid: string;
  unionid: string | null;
  expiresAt: string;
}

export interface WechatRepository {
  findAccountByOpenid(openid: string): WechatAccountRow | null;
  findAccountByUserId(userId: number): WechatAccountRow | null;
  /** Bind (or rebind) an openid to an account. Any previous row for either side is replaced. */
  linkAccount(input: LinkAccountInput): WechatAccountRow;
  touchLogin(openid: string): void;
  deleteAccountByUserId(userId: number): number;
  createTicket(input: CreateTicketInput): void;
  /** Single use: returns the row exactly once, and only while it is unexpired and unconsumed. */
  consumeTicket(ticketHash: string, nowIso: string): WechatTicketRow | null;
  purgeExpiredTickets(nowIso: string): number;
}

function now(): string {
  return new Date().toISOString();
}

export function createWechatRepository(db: DbApi): WechatRepository {
  const readAccount = (row: unknown): WechatAccountRow | null =>
    row ? ({ ...(row as WechatAccountRow) } as WechatAccountRow) : null;

  const readTicket = (row: unknown): WechatTicketRow | null =>
    row ? ({ ...(row as WechatTicketRow) } as WechatTicketRow) : null;

  return {
    findAccountByOpenid(openid) {
      return readAccount(db.get('SELECT * FROM p_wechat_accounts WHERE openid = ?', [openid]));
    },

    findAccountByUserId(userId) {
      return readAccount(db.get('SELECT * FROM p_wechat_accounts WHERE user_id = ?', [userId]));
    },

    /**
     * Bind an openid to an account, replacing whatever either side was bound to before.
     *
     * One transaction, because the unique indexes make the three statements inseparable: the row for
     * this account and the row for this openid have to disappear before the insert, and a failure
     * between them would leave the account unbound with the caller believing it worked.
     *
     * Rebinding is deliberate rather than refused. Someone who can present the account password has
     * already been able to log in as that account, so replacing a binding grants them nothing they
     * did not have - and refusing would strand every student who replaced a phone, since the old
     * WeChat is exactly what they no longer have access to. The caller records the change in the
     * audit log.
     */
    linkAccount({ openid, unionid, userId, role }) {
      return db.tx((tx) => {
        const stamp = now();
        tx.run('DELETE FROM p_wechat_accounts WHERE user_id = ? OR openid = ?', [userId, openid]);
        tx.run(
          `INSERT INTO p_wechat_accounts
             (openid, unionid, user_id, role, created_at, updated_at, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [openid, unionid, userId, role, stamp, stamp, stamp],
        );

        const row = readAccount(tx.get('SELECT * FROM p_wechat_accounts WHERE openid = ?', [openid]));
        if (!row) {
          // Unreachable: the insert above either wrote it or threw. Kept as an assertion rather
          // than a non-null cast so a future rewrite cannot turn it into a silent `null`.
          throw new Error('wechat binding insert returned no row');
        }
        return row;
      });
    },

    touchLogin(openid) {
      const stamp = now();
      db.run('UPDATE p_wechat_accounts SET last_login_at = ?, updated_at = ? WHERE openid = ?', [
        stamp,
        stamp,
        openid,
      ]);
    },

    deleteAccountByUserId(userId) {
      return db.run('DELETE FROM p_wechat_accounts WHERE user_id = ?', [userId]).changes;
    },

    createTicket({ ticketHash, openid, unionid, expiresAt }) {
      db.run(
        `INSERT INTO p_wechat_login_tickets (ticket_hash, openid, unionid, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [ticketHash, openid, unionid, expiresAt, now()],
      );
    },

    /**
     * Claim a ticket.
     *
     * The claim is the UPDATE, not a SELECT followed by one: `changes === 0` is what makes two
     * concurrent binds with the same ticket resolve to exactly one winner, and a SELECT first would
     * make that a race the second caller could win twice.
     */
    consumeTicket(ticketHash, nowIso) {
      const claimed = db.run(
        `UPDATE p_wechat_login_tickets
            SET consumed_at = ?
          WHERE ticket_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
        [nowIso, ticketHash, nowIso],
      );
      if (claimed.changes === 0) return null;

      return readTicket(db.get('SELECT * FROM p_wechat_login_tickets WHERE ticket_hash = ?', [ticketHash]));
    },

    purgeExpiredTickets(nowIso) {
      return db.run('DELETE FROM p_wechat_login_tickets WHERE expires_at <= ?', [nowIso]).changes;
    },
  };
}
