/**
 * WechatService - the mini program's login and binding rules.
 *
 * ## The two-step login
 *
 * A `wx.login` code identifies a WeChat person, not a Think-Class account. So the first call answers
 * one of two things:
 *
 *   - the openid is already bound -> a session token and the login payload, in one round trip;
 *   - it is not -> a **ticket**, and the client shows the bind form.
 *
 * The ticket is what carries the openid across that gap without ever handing the openid to the
 * client. It is opaque, single use, expires in ten minutes, and is stored only as a SHA-256 digest.
 *
 * ## What this service does not do
 *
 * It does not verify passwords (`identity.public.loginWithCredentials` does, so the parent-login
 * activity row and the plaintext-password upgrade stay in one place) and it does not compose the
 * login body (`identity.public.getLoginPayload` does, for the same reason). It does mint the session
 * itself, because `ctx.sessions` is a kernel primitive every plugin already has and routing that
 * through identity would publish an operation nobody else needs.
 *
 * ## Failing loudly rather than quietly
 *
 * A deployment without `WECHAT_APPID` / `WECHAT_SECRET` boots normally and answers 503 on the login
 * route with a message naming the two variables. There is no default appid anywhere in this file -
 * the same class of bug guardrail G18 protects `ENCRYPTION_KEY` from.
 */

import { createHash, randomBytes } from 'node:crypto';

import type { WechatSessionPayload, WechatUnboundPayload } from '@thinkclass/contracts/domains/wechat';
import type { IdentityPort } from '@thinkclass/contracts/domains/identity';
import { ApiError } from '@thinkclass/kernel';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { WechatGateway } from './wechat.gateway.js';
import type { WechatRepository } from './wechat.repository.js';
import { toBindingSnapshot, type WechatAccountRow } from './wechat.types.js';

/** Ten minutes: long enough to type a username and password, short enough to be uninteresting. */
export const TICKET_TTL_MS = 10 * 60 * 1000;

export interface WechatRequestMeta {
  userAgent: string | null;
  ip: string | null;
}

export interface WechatServiceDeps {
  ctx: KernelContext;
  repository: WechatRepository;
  identity: IdentityPort;
  /**
   * A function, not the resolved gateway: a missing `WECHAT_APPID` must surface as a 503 on the two
   * login routes, not as a plugin that refuses to load and takes the whole application with it.
   */
  gateway: () => WechatGateway;
}

/** Never log a full openid: it is an identifier, and logs travel further than tables do. */
function maskOpenid(openid: string): string {
  return openid.length <= 6 ? '***' : `${openid.slice(0, 6)}…`;
}

function hashTicket(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex');
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export class WechatService {
  private readonly ctx: KernelContext;
  private readonly repository: WechatRepository;
  private readonly identity: IdentityPort;
  private readonly gateway: () => WechatGateway;

  constructor(deps: WechatServiceDeps) {
    this.ctx = deps.ctx;
    this.repository = deps.repository;
    this.identity = deps.identity;
    this.gateway = deps.gateway;
  }

  /** The port: does this account hold a binding? */
  async getBindingForUser(userId: number) {
    const row = this.repository.findAccountByUserId(userId);
    return row ? toBindingSnapshot(row) : null;
  }

  /**
   * `POST /api/wechat/login` - silent login, or the ticket that starts a bind.
   */
  async login(
    body: Record<string, unknown>,
    meta: WechatRequestMeta,
  ): Promise<WechatSessionPayload | WechatUnboundPayload> {
    const { openid, unionid } = await this.resolveOpenid(body);
    const account = this.repository.findAccountByOpenid(openid);

    if (account) {
      const payload = await this.identity.getLoginPayload(account.user_id);
      if (!payload) {
        // The account was erased while the binding survived. Drop the stale row so the next attempt
        // starts from the bind form instead of looping on 401 forever.
        this.repository.deleteAccountByUserId(account.user_id);
        throw new ApiError(401, '微信绑定已失效，请重新登录并绑定账号');
      }

      this.repository.touchLogin(openid);
      return this.sessionPayload(account, payload, meta);
    }

    const ticket = this.issueTicket(openid, unionid);
    return { success: true, bound: false, ticket: ticket.ticket, expiresAt: ticket.expiresAt };
  }

  /**
   * `POST /api/wechat/bind` - finish a login by proving ownership of an existing account.
   */
  async bind(body: Record<string, unknown>, meta: WechatRequestMeta): Promise<WechatSessionPayload> {
    const ticket = text(body?.ticket);
    const username = text(body?.username);
    const password = typeof body?.password === 'string' ? body.password : '';
    // Required, not optional. Identity looks a login up by `(username, role)` - the same pair the web
    // login form sends - so a missing role would be a guaranteed "账号或密码错误" rather than a
    // fallback, and guessing the role here would mean up to three scrypt verifications per attempt.
    const role = text(body?.role);

    if (!ticket || !username || !password || !role) {
      throw new ApiError(400, '绑定参数不完整：需要 ticket、username、password、role');
    }

    // Claimed before the password is checked: a ticket is single use either way, so a wrong password
    // forces a fresh wx.login rather than leaving a ticket that can be guessed against repeatedly.
    const claimed = this.repository.consumeTicket(hashTicket(ticket), new Date().toISOString());
    if (!claimed) {
      throw new ApiError(401, '绑定已过期，请重新登录');
    }

    const payload = await this.identity.loginWithCredentials({ username, password, role });

    const account = this.repository.linkAccount({
      openid: claimed.openid,
      unionid: claimed.unionid,
      userId: payload.user.id,
      role: String(payload.user.role ?? ''),
    });

    this.ctx.audit.record({
      action: 'WECHAT_BIND',
      detail: `openid ${maskOpenid(account.openid)} bound to user ${account.user_id}`,
      actorId: account.user_id,
      role: account.role,
      ip: meta.ip,
    });

    return this.sessionPayload(account, payload, meta);
  }

  /**
   * `GET /api/wechat/me` - restore a session the client still holds, and report the binding state.
   *
   * `bound: false` is a normal answer, not a fault: someone who logged in on the web and then opens
   * the mini program has a valid session and no binding yet.
   */
  async me(actorId: number) {
    const account = this.repository.findAccountByUserId(actorId);
    if (!account) return { success: true as const, bound: false as const };

    const payload = await this.identity.getLoginPayload(actorId);
    if (!payload) {
      this.repository.deleteAccountByUserId(actorId);
      return { success: true as const, bound: false as const };
    }

    return {
      success: true as const,
      bound: true as const,
      user: payload.user,
      classFeatures: payload.classFeatures,
    };
  }

  /**
   * `POST /api/wechat/unbind` - the caller detaches their own WeChat, and only their own.
   *
   * Removing the row is enough: the WeChat client's token stays valid until it expires, which is the
   * same lifetime every other session has, and the *next* silent login lands on the bind form.
   */
  async unbind(actorId: number) {
    const removed = this.repository.deleteAccountByUserId(actorId);
    if (removed > 0) {
      this.ctx.audit.record({
        action: 'WECHAT_UNBIND',
        detail: `user ${actorId} removed their WeChat binding`,
        actorId,
        role: null,
        ip: null,
      });
    }

    return { success: true as const, unbound: removed > 0 };
  }

  /**
   * The WeChat identity this request is about: a real code exchange, or the development bypass.
   *
   * The unionid travels with the openid because a code cannot be exchanged twice: whatever
   * `code2session` answered has to be carried to the bind step, or it is lost between the two
   * requests.
   *
   * The bypass exists because a mini program cannot be built in a day behind an AppID that has not
   * been approved yet, and it is fenced on both sides: production refuses it outright, and it is off
   * unless `WECHAT_ALLOW_DEV_LOGIN=1` is set on the instance. Every use is logged.
   */
  private async resolveOpenid(
    body: Record<string, unknown>,
  ): Promise<{ openid: string; unionid: string | null }> {
    const devOpenid = text(body?.devOpenid);
    if (devOpenid) {
      if (this.ctx.config.env === 'production') {
        throw new ApiError(403, '生产环境不允许使用开发登录');
      }
      if (String(this.ctx.config.get<string>('WECHAT_ALLOW_DEV_LOGIN') ?? '') !== '1') {
        throw new ApiError(403, '开发登录未启用：请在服务端设置 WECHAT_ALLOW_DEV_LOGIN=1');
      }
      this.ctx.log.warn('wechat dev login used', { openid: maskOpenid(devOpenid) });
      return { openid: devOpenid, unionid: null };
    }

    const code = text(body?.code);
    if (!code) throw new ApiError(400, '缺少微信登录凭证 code');

    const session = await this.gateway().exchangeCode(code);
    return { openid: session.openid, unionid: session.unionid };
  }

  /** Mint a ticket, and clear out the ones nobody used. */
  private issueTicket(openid: string, unionid: string | null) {
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TICKET_TTL_MS).toISOString();

    // Opportunistic, not scheduled: the only moment a ticket can become garbage is the same moment
    // another one is created, and a cron job for one small table would be its own kind of debt.
    this.repository.purgeExpiredTickets(new Date().toISOString());
    this.repository.createTicket({ ticketHash: hashTicket(ticket), openid, unionid, expiresAt });

    return { ticket, expiresAt };
  }

  /** The body both login routes answer with, so the two cannot drift. */
  private sessionPayload(
    account: WechatAccountRow,
    payload: { user: WechatSessionPayload['user']; classFeatures: WechatSessionPayload['classFeatures'] },
    meta: WechatRequestMeta,
  ): WechatSessionPayload {
    const session = this.ctx.sessions.issue({
      userId: account.user_id,
      // The identity payload is the authority; the stored role is what the row said at bind time.
      role: String(payload.user.role ?? account.role) as never,
      ttlMs: this.ctx.config.sessionTtlMs,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    return {
      success: true,
      bound: true,
      token: session.token,
      expiresAt: session.expiresAt,
      user: payload.user,
      classFeatures: payload.classFeatures,
    };
  }
}
