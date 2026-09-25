/**
 * App entry: restore the session, resolve the class features, and put the user on the page their
 * role belongs to.
 *
 * ## The launch sequence, and why it is here rather than in the login page
 *
 *   1. Restore the token from storage and verify it with `GET /api/wechat/me`. A stored session is
 *      never trusted on its own: the kernel may have revoked it, the account may have been
 *      unbound, and a mini program's storage outlives a password change.
 *   2. Resolve the class feature flags (`utils/feature.ts` walks live -> cache -> login snapshot).
 *      This has to finish before any tab bar renders, or the bar would flash the wrong set.
 *   3. `reLaunch` to the role's home. The mini program's first page is always `pages/login/login`
 *      (the entry in `app.json`), so a returning user is moved off it before it paints anything
 *      they can interact with.
 *
 * `reLaunch` and not `switchTab`: it works for a tab page *and* for a teacher page, and there is no
 * navigation stack to preserve at launch. One call site, one behaviour.
 */

import { restoreSession } from './services/auth'
import { applyLoginSnapshot, homePathForRole, resolveFeatures } from './utils/feature'
import type { ClassFeatureFlags, StoredSession } from './utils/storage'
import { classIdOf, onSessionChanged, readSession } from './utils/storage'
import type { FeatureSource } from './utils/feature'

export interface AppGlobalData {
  /** The verified session, or `null` after a logout/unbind. */
  session: StoredSession | null
  features: ClassFeatureFlags
  featureSource: FeatureSource
  /** True once the launch sequence has made its decision. */
  ready: boolean
  systemInfo: WxSystemInfo | null
}

export interface AppInstance extends IAppOption {
  globalData: AppGlobalData
  bootstrap(): Promise<void>
  /** Pages call this after a login/bind so `globalData` reflects the new session immediately. */
  setSession(session: StoredSession | null): void
  /** Re-resolve the feature flags and update the app-wide copy. */
  refreshFeatures(options?: { force?: boolean }): Promise<void>
}

App<AppInstance>({
  globalData: {
    session: null,
    features: {},
    featureSource: 'unknown',
    ready: false,
    systemInfo: null,
  },

  onLaunch() {
    try {
      // Read once at launch: the account page prints the platform and the window width is needed
      // to size a couple of decorative elements.
      this.globalData.systemInfo = wx.getSystemInfoSync()
    } catch (error) {
      console.warn('[app] getSystemInfoSync failed', error)
    }
    void this.bootstrap()
  },

  /**
   * The launch sequence.
   *
   * Kept as a method rather than inlined in `onLaunch` so that a page can `await` the same
   * decision (the login page does, after a successful bind) instead of duplicating it.
   */
  async bootstrap() {
    this.setSession(readSession())
    const session = await restoreSession()

    if (!session) {
      // No token, or one the server would not accept and the silent re-login could not renew.
      this.setSession(null)
      this.globalData.ready = true
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }

    this.setSession(session)
    const classId = classIdOf(session.user)
    applyLoginSnapshot(session.classFeatures, classId)
    await this.refreshFeatures()
    this.globalData.ready = true
    wx.reLaunch({ url: homePathForRole(session.user.role) })
  },

  setSession(session) {
    this.globalData.session = session
  },

  async refreshFeatures(options = {}) {
    const resolution = await resolveFeatures(options)
    this.globalData.features = resolution.features
    this.globalData.featureSource = resolution.source
  },

  onUnhandledRejection(res) {
    // A rejected promise with no `catch` is a bug, but it must not take the app down silently: the
    // page that lost the error shows its own error state, and this line is what makes the cause
    // findable in 真机调试.
    console.error('[app] unhandled rejection', res && res.reason)
  },
})

// A logout, an unbind or a silent re-login all pass through `utils/storage.ts`; keeping the
// app-wide copy in step here means a page never has to know which of the three happened.
onSessionChanged((session) => {
  const app = getApp<AppInstance>()
  if (app && app.globalData) {
    app.globalData.session = session
  }
})
