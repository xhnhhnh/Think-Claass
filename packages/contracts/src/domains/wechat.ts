/**
 * wechat domain contracts - the mini program's identity binding.
 *
 * `plugins/wechat` owns two tables: `p_wechat_accounts` (one row per WeChat openid, pointing at a
 * `users` row it does not own) and `p_wechat_login_tickets` (the short-lived carrier of a login
 * across the "scan, then bind" step). Nothing in this module is runtime code - guardrail G6.
 *
 * ## Why the binding is its own table rather than a column on `users`
 *
 * `users` belongs to `plugins/identity`. A `wechat_openid` column would make this plugin a second
 * writer of that table, and the mini program is optional: a deployment that does not ship it must
 * still be able to create, log in and delete accounts. Keeping the mapping beside the plugin means
 * the whole WeChat surface can be switched off with `PLUGINS_ENABLED` semantics and no account
 * knows the difference.
 *
 * ## Why the published port is one method
 *
 * No other plugin needs to log anyone in over WeChat; the account-deletion path just needs to know
 * whether an account holds a binding so the row is not orphaned. Login itself stays an HTTP route on
 * this plugin's own surface, which is the shape `plugins/identity` records for its own login.
 */

import type { ClassFeatureFlags } from './auth.js';
import type { LoginUserSnapshot } from './identity.js';

/** The openid -> account binding, as another plugin may read it. */
export interface WechatBindingSnapshot {
  openid: string;
  unionid: string | null;
  userId: number;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

/**
 * What `POST /api/wechat/login` answers with when the openid is not bound to an account yet.
 *
 * The ticket - not the openid - is what the client hands back on the bind call. Handing the openid
 * to the client would make it a bearer-ish identifier the client could present in any shape it
 * liked; the ticket is opaque, single-use and expires in ten minutes.
 */
export interface WechatUnboundPayload {
  success: true;
  bound: false;
  ticket: string;
  expiresAt: string;
}

/**
 * What both login routes answer with once an account is bound.
 *
 * Deliberately the same shape `POST /api/auth/login` returns (`user` + `classFeatures` + a session
 * token), because the mini program client boots from it exactly the way the web client does.
 */
export interface WechatSessionPayload {
  success: true;
  bound: true;
  token: string;
  expiresAt: string;
  user: LoginUserSnapshot;
  classFeatures: ClassFeatureFlags | null;
}

/** Body of `POST /api/wechat/login`. */
export interface WechatLoginPayload {
  /** The one-time code `wx.login()` produced. Exchanged server-side; it never reaches WeChat twice. */
  code: string;
}

/** Body of `POST /api/wechat/bind`. */
export interface WechatBindPayload {
  ticket: string;
  username: string;
  password: string;
  /**
   * One of `student` / `parent` / `teacher`.
   *
   * Required, because the credential lookup is the `(username, role)` pair the web login uses: an
   * omitted role would be answered with the same 401 a wrong password gets, and inferring it
   * server-side would cost up to three scrypt verifications per attempt. The bind screen asks.
   */
  role: string;
}

/** `wechat.public` - the port `plugins/wechat` publishes. */
export interface WechatPort {
  /**
   * The binding an account holds, or `null`.
   *
   * At most one per account: the migration puts a unique index on `user_id`, so this is a fact the
   * database enforces rather than a convention the caller hopes for.
   */
  getBindingForUser(userId: number): Promise<WechatBindingSnapshot | null>;
}
