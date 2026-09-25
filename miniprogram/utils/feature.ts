/**
 * Class feature flags, and what they hide.
 *
 * ## The resolution chain (and why it is a chain)
 *
 * A student's tab set and several pages depend on their *class's* feature configuration, which
 * only the server knows. Reading it on every launch is correct but not always possible (offline
 * first paint, a slow kernel, a 500), so the answer is resolved in a fixed order:
 *
 *   live `GET /api/classes/:id/features`  ->  last live answer (cached)  ->  login-time snapshot  ->  unknown
 *
 * `unknown` is a real state, not an error: the flag map is empty and **every gated surface stays
 * hidden**. That direction is deliberate - showing 「积分商城」 to a class that has it switched off
 * is a broken promise the user only discovers by tapping it, while hiding an enabled feature for
 * one launch is corrected by the next call.
 *
 * ## Why the tab set lives here
 *
 * `app.json` declares four tab pages (WeChat's ceiling is five, and the two role sets do not fit
 * in one list - see the note on `DECLARED_TAB_PAGES`), so which entries are *shown* is a runtime
 * decision made from this module. Each tab declares either the flag that gates it or `null`
 * meaning "nothing gates this", and the filter reads it - nothing is visible by accident.
 *
 * This mirrors `src/lib/featureRoutes.ts` on the web side: `enable_shop` -> 积分商城,
 * `enable_ai_study` -> 智学, `enable_achievements` -> 奖状, homework and the account pages carry
 * no flag.
 */

import { classFeatures } from '../services/teacher'
import type { ClassFeatureFlags } from './storage'
import { classIdOf, onSessionChanged, readFeatureCache, readSession, writeFeatureCache } from './storage'

export type FeatureSource = 'class' | 'cache' | 'snapshot' | 'unknown'

export interface FeatureResolution {
  features: ClassFeatureFlags
  source: FeatureSource
  classId: number | null
  fetchedAt: number | null
}

/**
 * The flags this client reads by name.
 *
 * A named constant rather than a string literal at each call site so that a typo is a compile
 * error, and so the mapping to the web's `featureRoutes.ts` is greppable.
 */
export const FEATURE_KEYS = {
  shop: 'enable_shop',
  aiStudy: 'enable_ai_study',
  achievements: 'enable_achievements',
} as const

/**
 * One tab, and what (if anything) gates it.
 *
 * `requires: null` is not the same as "always visible by oversight": 成长总览 / 我的作业 / 我的 /
 * 班级 / 作业 have no flag on the server at all, which is exactly what `featureRoutes.ts` says
 * about homework and the account surfaces. Every flag that *does* exist for a tab is named here,
 * so the filter can never leak a disabled feature into the bar.
 */
export interface TabDefinition {
  key: string
  text: string
  /** Path without a leading slash, as `app.json` writes it. */
  pagePath: string
  requires: string | null
}

export const STUDENT_TABS: TabDefinition[] = [
  { key: 'home', text: '成长总览', pagePath: 'pages/student/home', requires: null },
  { key: 'homework', text: '我的作业', pagePath: 'pages/student/homework', requires: null },
  { key: 'shop', text: '积分商城', pagePath: 'pages/student/shop', requires: FEATURE_KEYS.shop },
  { key: 'me', text: '我的', pagePath: 'pages/student/me', requires: null },
]

export const TEACHER_TABS: TabDefinition[] = [
  { key: 'class', text: '班级', pagePath: 'pages/teacher/class', requires: null },
  { key: 'homework', text: '作业', pagePath: 'pages/teacher/homework', requires: null },
  { key: 'insight', text: '智学看板', pagePath: 'pages/teacher/ai-insight', requires: FEATURE_KEYS.aiStudy },
  { key: 'me', text: '我的', pagePath: 'pages/student/me', requires: null },
]

/**
 * The four pages `app.json` declares as tab pages, in order.
 *
 * `wx.switchTab` only works for a page that is in `tabBar.list`, so this set is what tells the
 * custom tab bar whether to switch or to redirect. Only the student set is declared: WeChat caps
 * `tabBar.list` at five entries and the two role sets together are eight, so the *student* set -
 * the primary audience of this client - gets the tab pages and the teacher set is rendered by
 * the same component but navigated to with `redirectTo` (see `custom-tab-bar/index.ts`).
 */
export const DECLARED_TAB_PAGES: string[] = [
  'pages/student/home',
  'pages/student/homework',
  'pages/student/shop',
  'pages/student/me',
]

let current: FeatureResolution = { features: {}, source: 'unknown', classId: null, fetchedAt: null }

/**
 * A flag is on only when the server said so, in one of the shapes it can actually answer.
 *
 * The contract types the map as booleans (`{ enable_shop: true }`), but the same map is also
 * stored as SQLite integers in places, and `"1"` survives a JSON round trip in others - all
 * three mean on, and anything else means off.
 */
export function flagOn(value: boolean | number | string | null | undefined): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

export function getResolution(): FeatureResolution {
  return current
}

/** True once a live answer, a cache or a login snapshot has been applied. */
export function hasResolved(): boolean {
  return current.source !== 'unknown'
}

/** Is `flag` on in the given map? `null` means "no flag governs this". */
export function isEnabled(features: ClassFeatureFlags | undefined, flag: string | null): boolean {
  if (!flag) {
    return true
  }
  return flagOn(features ? features[flag] : undefined)
}

/** Is `flag` on in the map resolved for this launch? */
export function isFeatureOn(flag: string): boolean {
  return isEnabled(current.features, flag)
}

/**
 * Walk the chain and cache the result.
 *
 * `force` (pull-to-refresh, or the account page's 重新检查) re-runs the live call even when this
 * launch already has an answer; without it, a resolved launch is answered from memory so that a
 * tab switch does not re-hit the API.
 */
export async function resolveFeatures(options: { force?: boolean } = {}): Promise<FeatureResolution> {
  if (!options.force && current.source !== 'unknown') {
    return current
  }

  const session = readSession()
  const classId = classIdOf(session ? session.user : null)

  if (classId !== null) {
    try {
      const features = await classFeatures(classId)
      current = { features, source: 'class', classId, fetchedAt: Date.now() }
      writeFeatureCache({ classId, features, fetchedAt: current.fetchedAt as number })
      return current
    } catch (error) {
      // A 401 has already been recovered (or has already routed to the login page) inside
      // `utils/request.ts`; anything else - offline, 500, no such class - falls through to the
      // two caches below rather than failing the launch.
      console.warn('[feature] live class features unavailable, falling back', error)
    }
  }

  const cached = readFeatureCache()
  if (cached && (classId === null || cached.classId === classId)) {
    current = { features: cached.features, source: 'cache', classId: cached.classId, fetchedAt: cached.fetchedAt }
    return current
  }

  const snapshot = session ? session.classFeatures : null
  if (snapshot && Object.keys(snapshot).length > 0) {
    current = { features: snapshot, source: 'snapshot', classId, fetchedAt: null }
    return current
  }

  current = { features: {}, source: 'unknown', classId, fetchedAt: null }
  return current
}

/**
 * Adopt the flag map that came back with a token.
 *
 * Called at login/bind so that the first render of the next page already has the right tabs,
 * without waiting for the live call.
 */
export function applyLoginSnapshot(classFeatures: ClassFeatureFlags | undefined, classId: number | null): void {
  const features = classFeatures || {}
  current = {
    features,
    source: Object.keys(features).length > 0 ? 'snapshot' : 'unknown',
    classId,
    fetchedAt: null,
  }
}

// A new session may belong to a different class (or a different role): drop the resolved answer
// so the next `resolveFeatures` cannot serve the previous user's flags.
onSessionChanged((session) => {
  current = { features: {}, source: 'unknown', classId: null, fetchedAt: null }
  if (session) {
    applyLoginSnapshot(session.classFeatures, classIdOf(session.user))
  }
})

// ---------------------------------------------------------------------------
// Roles and tabs

/** Staff roles get the teacher tab set; everyone else gets the student one. */
export function isTeacherRole(role?: string | null): boolean {
  return role === 'teacher' || role === 'admin' || role === 'superadmin'
}

/** The tabs a role may see, *after* the feature filter. */
export function visibleTabs(role?: string | null): TabDefinition[] {
  const list = isTeacherRole(role) ? TEACHER_TABS : STUDENT_TABS
  return list.filter((tab) => isEnabled(current.features, tab.requires))
}

/** The tab set a role has, before filtering - used by the 「功能未开启」explanation. */
export function allTabs(role?: string | null): TabDefinition[] {
  return isTeacherRole(role) ? TEACHER_TABS : STUDENT_TABS
}

/** Where a role lands after login. */
export function homePathForRole(role?: string | null): string {
  const tabs = visibleTabs(role)
  const first = tabs.length ? tabs[0] : null
  return first ? `/${first.pagePath}` : '/pages/student/me'
}

/** The current page's route (`pages/...`), or `''` before the first page exists. */
export function currentRoute(): string {
  const pages = getCurrentPages()
  if (!pages.length) {
    return ''
  }
  const route = pages[pages.length - 1].route
  return route || ''
}

export interface TabBarHost {
  /** Defined by the framework on tab pages only. */
  getTabBar?(): any
  selectComponent?(selector: string): any
}

/**
 * Bring a page's tab bar up to date with the session and the feature flags.
 *
 * Tab pages get theirs from `this.getTabBar()`; the teacher pages - which are not tab pages -
 * render the very same component by hand under `#tab-bar`, which is why both lookups are here
 * instead of in each of the nine pages that need this.
 */
export async function syncTabBar(host: TabBarHost, options: { force?: boolean } = {}): Promise<void> {
  await resolveFeatures(options)
  const injected = typeof host.getTabBar === 'function' ? host.getTabBar() : null
  const bar = injected || (typeof host.selectComponent === 'function' ? host.selectComponent('#tab-bar') : null)
  if (bar && typeof bar.refresh === 'function') {
    bar.refresh()
  }
}
