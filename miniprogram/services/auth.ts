/**
 * WeChat login, binding, and the session's lifecycle.
 *
 * ## The two-step login
 *
 * `wx.login` yields a one-shot `code`. `POST /api/wechat/login` exchanges it for either
 *
 *   - `{ bound: true, token, expiresAt, user, classFeatures }` - the WeChat account is already
 *     linked to a Think-Class user, and the session starts immediately with no UI, or
 *   - `{ bound: false, ticket, expiresAt }` - nothing is linked yet, and the ticket (short-lived,
 *     single-use) is what `POST /api/wechat/bind` needs together with a username, a password **and
 *     the role**.
 *
 * A ticket is never persisted: it lives in the query string of the bind page and dies with the
 * page. The token *is* persisted (see `utils/storage.ts`), and the minimum TTL the kernel issues is
 * seven days, so a student who opens the mini program weekly is not asked to log in again.
 *
 * ## Why `bind` carries a role
 *
 * `plugins/identity` looks a credential up by the `(username, role)` pair - the same pair the web
 * login form sends - so the role is not decoration: the server refuses the bind outright (400
 * 「绑定参数不完整」) without it, and inferring it would cost a scrypt verification per role. The bind
 * page asks the user, defaulting to 学生.
 *
 * ## Errors this file deliberately does not catch
 *
 * The contract's failure messages (`401 微信登录凭证无效，请重试`, `401 绑定已过期，请重新登录`,
 * `401 账号或密码错误，请重试`, `403 开发登录未启用：请在服务端设置 WECHAT_ALLOW_DEV_LOGIN=1`,
 * `503 微信小程序未配置：请设置 WECHAT_APPID / WECHAT_SECRET`) arrive as `ApiError`s carrying the
 * server's own Chinese text. Pages switch on `error.status` where the *recovery* differs (a stale
 * `code` means run `wx.login` again; a dead ticket means go back to the login page) and otherwise
 * just print `error.message` - so nothing is swallowed here.
 */

import { DEV_LOGIN_OPENID } from '../config/index'
import { buildLoginBody, get, post, put } from '../utils/request'
import type { ClassFeatureFlags, SessionUser, StoredSession } from '../utils/storage'
import { clearSession, readSession, writeSession } from '../utils/storage'

/** The three roles a Think-Class account can be bound from the mini program. */
export type BindRole = 'student' | 'parent' | 'teacher'

export interface WechatLoginBound {
  bound: true
  token: string
  expiresAt: string
  user: SessionUser
  classFeatures: ClassFeatureFlags | null
}

export interface WechatLoginUnbound {
  bound: false
  /** Single-use, short-lived: hand it to `bindAccount` and then forget it. */
  ticket: string
  expiresAt: string
}

export type WechatLoginResult = WechatLoginBound | WechatLoginUnbound

/**
 * `GET /api/wechat/me`.
 *
 * `bound: false` is a **normal** answer with a perfectly valid token: someone who logged in on the
 * web and then opened the mini program holds a session but no WeChat binding. It is not a session
 * this client can use (there is no `user` in it), so `restoreSession` treats it as "log in again",
 * which is what puts that person on the bind form.
 */
export type WechatMeResult = { bound: true; user: SessionUser; classFeatures: ClassFeatureFlags | null } | { bound: false }

/** `wx.login` -> the one-shot code. Rejects with a displayable message on failure. */
export function wxLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) {
          resolve(res.code)
        } else {
          reject(new Error('微信登录失败，请重试'))
        }
      },
      fail: () => reject(new Error('微信登录失败，请重试')),
    })
  })
}

/** Persist a successful login/bind so every later launch can restore it. */
export function persistSession(result: WechatLoginBound): StoredSession {
  const session: StoredSession = {
    token: result.token,
    expiresAt: result.expiresAt || '',
    user: result.user,
    // `classFeatures` is nullable on the wire (a user whose account has no class):
    // `utils/feature.ts` reads an empty map as "nothing is on".
    classFeatures: result.classFeatures || {},
  }
  writeSession(session)
  return session
}

/**
 * `POST /api/wechat/login` - run `wx.login` first, then exchange the code.
 *
 * In a `DEV_LOGIN_OPENID` build the `wx.login` step is allowed to fail: there is no AppID to
 * exchange a code against, and the server takes the configured openid instead. Outside that build a
 * failed `wx.login` is fatal, which is the honest behaviour - without a code there is nothing to
 * trade for a session.
 */
export async function loginWithWechat(): Promise<WechatLoginResult> {
  let code = ''
  try {
    code = await wxLoginCode()
  } catch (error) {
    if (!DEV_LOGIN_OPENID) {
      throw error
    }
    console.warn('[auth] wx.login unavailable, continuing with the development openid')
  }
  return post<WechatLoginResult>('/api/wechat/login', buildLoginBody(code), { auth: false })
}

/**
 * `POST /api/wechat/bind` - link this WeChat account to a Think-Class username.
 *
 * `role` is required (see the file comment). The ticket is consumed by the *attempt*, even when the
 * password is wrong, so a wrong password needs a fresh `wx.login` before another try - the bind page
 * handles that by sending the user back to the login page.
 */
export async function bindAccount(ticket: string, username: string, password: string, role: BindRole): Promise<WechatLoginBound> {
  return post<WechatLoginBound>('/api/wechat/bind', { ticket, username, password, role }, { auth: false })
}

/** `GET /api/wechat/me` - who the stored token belongs to, with a fresh flag map. */
export async function fetchMe(): Promise<WechatMeResult> {
  return get<WechatMeResult>('/api/wechat/me')
}

/**
 * Restore a stored session at launch.
 *
 * Returns `null` when there is nothing to restore, when the token was refused (and the silent
 * re-login could not recover it), or when the token is valid but this WeChat account holds no
 * binding. In all three cases the caller shows the login page, and the login page is what turns the
 * third case into a bind form. On success the stored blob is rewritten with the fresh
 * `user`/`classFeatures`, because those are the fields the server is authoritative about (a name
 * changed on the web console, a class's features switched off by a teacher).
 */
export async function restoreSession(): Promise<StoredSession | null> {
  const existing = readSession()
  if (!existing) {
    return null
  }
  try {
    const me = await fetchMe()

    if (me.bound !== true) {
      // A valid token with no binding: `user` does not exist on this answer, so there is no session
      // to build. Clearing it is what makes the next `wx.login` produce a ticket and land on 绑定.
      clearSession()
      return null
    }

    // The 401 recovery inside `utils/request.ts` may have written a *new* token while this call
    // was in flight; re-read rather than reusing `existing`, or the refresh would be discarded.
    const latest = readSession() || existing
    const session: StoredSession = {
      token: latest.token,
      expiresAt: latest.expiresAt,
      user: me.user,
      classFeatures: me.classFeatures || latest.classFeatures || {},
    }
    writeSession(session)
    return session
  } catch (error) {
    console.warn('[auth] session restore failed', error)
    return null
  }
}

/** `POST /api/wechat/unbind` - the WeChat account stops being a way in for this user. */
export async function unbindWechat(): Promise<void> {
  await post<{ unbound: true }>('/api/wechat/unbind')
}

/** `PUT /api/auth/profile` - change the username, and optionally the password. */
export async function updateProfile(username: string, password?: string): Promise<SessionUser | null> {
  const body: { username: string; password?: string } = { username }
  if (password) {
    body.password = password
  }
  const res = await put<{ success: true; user?: SessionUser }>('/api/auth/profile', body)
  const user = res.user || null
  if (user) {
    // Keep the stored session in step: the account page reads its name from there.
    const session = readSession()
    if (session) {
      writeSession({ ...session, user: { ...session.user, ...user } })
    }
  }
  return user
}

/**
 * `POST /api/kernel/auth/logout` - end the server session, then forget it locally.
 *
 * The local clear happens even when the call fails: a logout the user asked for must not leave a
 * usable token on the device because the network was down.
 */
export async function logout(): Promise<void> {
  try {
    await post<{ success: true }>('/api/kernel/auth/logout')
  } catch (error) {
    console.warn('[auth] server logout failed, clearing locally anyway', error)
  }
  clearSession()
}

/** Drop the token without telling the server (used by the "switch account" path). */
export function forgetSession(): void {
  clearSession()
}

/**
 * The session a page needs before it can render, or `null` after routing to the login page.
 *
 * Pages call this at the top of `onLoad`/`onShow`: a page reached by a stale link, or one that was
 * already on the stack when the token was cleared, must not fire five doomed requests and paint
 * five error states. Routing from here (rather than in each page) keeps the "no session means the
 * login page" rule in one place.
 */
export function requireSession(): StoredSession | null {
  const session = readSession()
  if (!session) {
    wx.reLaunch({ url: '/pages/login/login' })
    return null
  }
  return session
}
