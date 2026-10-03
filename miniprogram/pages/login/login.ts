/**
 * 登录页 - the way in, by two doors.
 *
 * ## 微信一键登录
 *
 * WeChat already knows who is holding the phone: `wx.login` gives a code, the kernel exchanges it
 * for a token, and a user who has bound their account before is inside the app without typing
 * anything. Only a *first* visit is interrupted, and then only to ask for the username and password
 * the teacher handed out (see `pages/bind`).
 *
 * ## 账号密码登录
 *
 * The second door, for the people one-click does not serve: a reviewer whose WeChat is not linked
 * yet, the console account (`superadmin`), or someone whose WeChat is linked elsewhere.
 * It does **not** bypass the first-time binding - `loginWithAccount` makes the same two server calls
 * in the same order, so an unlinked WeChat still lands on the bind form (that function's comment
 * explains why the rule is enforced server-side rather than here).
 *
 * Both doors share one `busy` flag: two submits racing would consume two tickets and issue two
 * sessions, and only one of them would survive.
 *
 * ## The error cases this page deliberately names
 *
 *   - **503 `微信小程序未配置：请设置 WECHAT_APPID / WECHAT_SECRET`** - a deployment mistake, not a
 *     user mistake. The page says so in a developer-facing hint instead of a scary toast, because
 *     retrying the button cannot possibly help.
 *   - **401 `微信登录凭证无效，请重试`** - the `code` was already consumed (two taps, a resumed app).
 *     Re-running `wx.login` is the whole fix, so the page offers 「再试一次」 rather than a
 *     dead end.
 *   - **401 `账号或密码错误，请重试`** - a typo in the account form. Stay put and keep what was typed;
 *     the next submit fetches a fresh ticket, so a retry is never wasted.
 *   - Everything else is printed verbatim: the contract's messages are written for this end user.
 */

import { loginWithAccount, loginWithWechat, persistSession } from '../../services/auth'
import type { AccountRole } from '../../services/auth'
import type { StoredSession } from '../../utils/storage'
import { classIdOf, readSession } from '../../utils/storage'
import { applyLoginSnapshot, homePathForRole } from '../../utils/feature'
import type { AppInstance } from '../../app'
import { errorMessage } from '../../utils/toast'

/**
 * Every role this deployment can actually hand out, in the order the people using this client appear.
 *
 * `superadmin` is here because the mini program carries a 管理 tab for it. **`admin` is deliberately
 * absent**: it is a legal role in the kernel (`isTeacherRole` accepts it, and the admin routes are
 * gated on `admin` *or* `superadmin`), but it is not an account this product creates - the console
 * account is the superadmin. Offering a role nobody holds turns the picker into a trap: the server
 * resolves a credential by `(username, role)`, so choosing it answers 401「账号或密码错误」, which
 * reads as a wrong password rather than a wrong choice.
 */
const ROLES: Array<{ value: AccountRole; label: string }> = [
  { value: 'student', label: '学生' },
  { value: 'parent', label: '家长' },
  { value: 'teacher', label: '老师' },
  { value: 'superadmin', label: '超管' },
]

Page({
  data: {
    busy: false,
    /** The message shown in the WeChat card's error box, or `''`. */
    error: '',
    /** Set when the failure was the server's own missing configuration. */
    configurationHint: false,

    /** 账号密码登录 - the form is always visible; these are just its fields. */
    accountUsername: '',
    accountPassword: '',
    accountRole: 'student' as AccountRole,
    roles: ROLES,
    /** The account card's own error box: the two doors fail for different reasons. */
    accountError: '',
  },

  onShow() {
    // A session already exists when the app-level `reLaunch` was dropped (a cold start straight
    // into this page, a share link, a resumed mini program). Sending the user on from here is what
    // keeps that case from looking like a logout.
    //
    // Gated on `globalData.ready`: at launch this page is the entry point and is shown *before*
    // `app.bootstrap()` has verified anything, so acting then would send a stale token straight to
    // the home page - and, for a token whose WeChat binding is gone, straight back here.
    const app = getApp<AppInstance>()
    const ready = !!(app && app.globalData && app.globalData.ready)
    const session = readSession()
    if (ready && session && !this.data.busy) {
      this.enterApp(session)
    }
  },

  async onWechatLogin() {
    if (this.data.busy) {
      return
    }
    this.setData({ busy: true, error: '', configurationHint: false, accountError: '' })

    try {
      const result = await loginWithWechat()

      if (result.bound === false) {
        // First visit: hand the single-use ticket to the bind page and take this page off the
        // stack, so 返回 cannot land on a login screen the user has already passed.
        wx.redirectTo({ url: `/pages/bind/bind?ticket=${encodeURIComponent(result.ticket)}` })
        return
      }

      const session = persistSession(result)
      this.enterApp(session)
    } catch (error) {
      const status = (error as { status?: number }).status || 0
      this.setData({
        error: errorMessage(error),
        // 503 is the missing AppID/Secret; 403 is the dev-login fence naming the variable to set.
        // Both are deployment problems, so the hint explains rather than inviting a retry.
        configurationHint: status === 503 || status === 403,
      })
    } finally {
      this.setData({ busy: false })
    }
  },

  onAccountUsernameInput(event: { detail: { value: string } }) {
    this.setData({ accountUsername: event.detail.value, accountError: '' })
  },

  onAccountPasswordInput(event: { detail: { value: string } }) {
    this.setData({ accountPassword: event.detail.value, accountError: '' })
  },

  onAccountRoleTap(event: { currentTarget: { dataset: Record<string, string> } }) {
    const role = event.currentTarget.dataset.role as AccountRole
    if (role) {
      this.setData({ accountRole: role, accountError: '' })
    }
  },

  /**
   * 账号密码登录.
   *
   * Each submit runs the whole two-step flow (see `loginWithAccount`): a fresh ticket, then the
   * bind. That is not merely defensive - the server claims the ticket *before* verifying the
   * password, so a typo would otherwise leave a dead ticket behind and the second attempt would
   * answer 「绑定已过期」 however right the password had become.
   */
  async onAccountLogin() {
    const username = this.data.accountUsername.trim()
    const password = this.data.accountPassword

    if (!username) {
      this.setData({ accountError: '请填写账号' })
      return
    }
    if (!password) {
      this.setData({ accountError: '请填写密码' })
      return
    }
    if (this.data.busy) {
      return
    }

    this.setData({ busy: true, accountError: '', error: '', configurationHint: false })
    try {
      const result = await loginWithAccount(username, password, this.data.accountRole)
      const session = persistSession(result)
      this.enterApp(session)
    } catch (error) {
      this.setData({ accountError: errorMessage(error) })
    } finally {
      this.setData({ busy: false })
    }
  },

  /** Retry is the same action; the button stays enabled so a transient failure costs one tap. */
  onRetry() {
    void this.onWechatLogin()
  },

  enterApp(session: StoredSession) {
    const classId = classIdOf(session.user)
    // Adopt the login-time snapshot before navigating: the tab bar computes the visible set on its
    // first render, and an empty map would show the un-gated tabs then pop the rest in.
    applyLoginSnapshot(session.classFeatures, classId)
    const app = getApp<AppInstance>()
    if (app && typeof app.setSession === 'function') {
      app.setSession(session)
    }
    wx.reLaunch({ url: homePathForRole(session.user.role) })
  },
})
