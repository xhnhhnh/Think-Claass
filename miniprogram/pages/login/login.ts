/**
 * 登录页 - the only way in.
 *
 * One button, because WeChat already knows who is holding the phone: `wx.login` gives a code, the
 * kernel exchanges it for a token, and a user who has bound their account before is inside the app
 * without typing anything. Only a *first* visit is interrupted, and then only to ask for the
 * username and password the teacher handed out (see `pages/bind`).
 *
 * ## The error cases this page deliberately names
 *
 *   - **503 `微信小程序未配置：请设置 WECHAT_APPID / WECHAT_SECRET`** - a deployment mistake, not a
 *     user mistake. The page says so in a developer-facing hint instead of a scary toast, because
 *     retrying the button cannot possibly help.
 *   - **401 `微信登录凭证无效，请重试`** - the `code` was already consumed (two taps, a resumed app).
 *     Re-running `wx.login` is the whole fix, so the page offers 「再试一次」 rather than a
 *     dead end.
 *   - Everything else is printed verbatim: the contract's messages are written for this end user.
 */

import { loginWithWechat, persistSession } from '../../services/auth'
import type { StoredSession } from '../../utils/storage'
import { classIdOf, readSession } from '../../utils/storage'
import { applyLoginSnapshot, homePathForRole } from '../../utils/feature'
import type { AppInstance } from '../../app'
import { errorMessage } from '../../utils/toast'

Page({
  data: {
    busy: false,
    /** The message shown in the error card, or `''`. */
    error: '',
    /** Set when the failure was the server's own missing configuration. */
    configurationHint: false,
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
    this.setData({ busy: true, error: '', configurationHint: false })

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
