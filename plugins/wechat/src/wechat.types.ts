/**
 * wechat row types and the two shapes the service passes around.
 *
 * The rows are written by `wechat.repository.ts` and are the contract with
 * `plugins/wechat/migrations/0001_init.sql`; the camelCase shapes are what the port and the HTTP
 * bodies carry, so the two spellings never meet in the middle of a call.
 */

import type { WechatBindingSnapshot } from '@thinkclass/contracts/domains/wechat';

/** Raw `p_wechat_accounts` row. */
export interface WechatAccountRow {
  id: number;
  openid: string;
  unionid: string | null;
  user_id: number;
  role: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

/** Raw `p_wechat_login_tickets` row. */
export interface WechatTicketRow {
  id: number;
  ticket_hash: string;
  openid: string;
  unionid: string | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

/** What `code2session` answers once WeChat has accepted the code. */
export interface WechatCodeSession {
  openid: string;
  unionid: string | null;
}

/** A freshly minted ticket, before it is handed to the client. */
export interface IssuedTicket {
  ticket: string;
  expiresAt: string;
}

export function toBindingSnapshot(row: WechatAccountRow): WechatBindingSnapshot {
  return {
    openid: row.openid,
    unionid: row.unionid,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}
