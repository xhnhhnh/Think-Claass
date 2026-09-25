/**
 * The custom tab bar - the only place that decides which entries exist.
 *
 * ## Why it is dynamic at all
 *
 * The tab set depends on two facts the server owns: the user's **role** (a teacher's tabs are
 * 班级/作业/智学看板/我的) and their **class's feature flags** (积分商城 only exists while
 * `enable_shop` is on, 智学看板 only while `enable_ai_study` is on). A static `tabBar.list` cannot
 * express either, which is exactly what `"custom": true` is for: the framework still owns the
 * pages and the switch gesture, and this component owns the pixels and the set.
 *
 * ## Why navigation has two branches
 *
 * `wx.switchTab` only accepts a page declared in `app.json`'s `tabBar.list`, and WeChat caps that
 * list at five entries - while the two role sets together are eight. The student set (the primary
 * audience of this client) therefore holds the four declared slots, and the teacher pages are
 * ordinary pages rendered with this same component, reached with `redirectTo`. `DECLARED_TAB_PAGES`
 * in `utils/feature.ts` is the single source of truth for which branch applies, so the two stay in
 * step by construction rather than by memory.
 *
 * ## Refresh protocol
 *
 * A tab bar cannot observe a page's data. Every page calls
 * `syncTabBar(this)` (`utils/feature.ts`) from `onShow`, which resolves the flags and then calls
 * `refresh()` on this instance - so the entries are recomputed on each entry to a page, never
 * cached across a class-feature change or a login.
 */

import { DECLARED_TAB_PAGES, currentRoute, isTeacherRole, visibleTabs } from '../utils/feature'
import { readSession } from '../utils/storage'

interface TapEvent {
  currentTarget: { dataset: Record<string, string> }
}

Component({
  data: {
    tabs: [] as Array<{ key: string; text: string; pagePath: string }>,
    /** The current page's route, so the active entry can be marked. */
    active: '',
    /** Teacher entries take the teacher accent colour. */
    teacher: false,
    /** Nothing is rendered until the first refresh, which avoids a flash of the wrong set. */
    ready: false,
  },

  lifetimes: {
    attached() {
      this.refresh()
    },
  },

  methods: {
    /** Recompute the visible entries from the session and the resolved feature flags. */
    refresh() {
      const session = readSession()
      const role = session && session.user ? session.user.role : null
      const tabs = visibleTabs(role).map((tab) => ({ key: tab.key, text: tab.text, pagePath: tab.pagePath }))
      this.setData({
        tabs,
        active: currentRoute(),
        teacher: isTeacherRole(role),
        ready: true,
      })
    },

    onTap(event: TapEvent) {
      const path = event.currentTarget.dataset.path
      if (!path || path === this.data.active) {
        return
      }
      if (DECLARED_TAB_PAGES.indexOf(path) >= 0) {
        wx.switchTab({
          url: `/${path}`,
          // A switch can fail if the page was removed from `tabBar.list` in a future edit; falling
          // back to `reLaunch` keeps the tap working instead of doing nothing at all.
          fail: () => wx.reLaunch({ url: `/${path}` }),
        })
        return
      }
      // Teacher pages are not tab pages (see the file comment): `redirectTo` keeps the stack flat,
      // so tapping through 班级 -> 作业 -> 班级 does not build a history to back out of.
      wx.redirectTo({ url: `/${path}` })
    },
  },
})
