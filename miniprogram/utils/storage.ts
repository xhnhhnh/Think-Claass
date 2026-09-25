/**
 * Session and feature-cache persistence.
 *
 * One key holds the session (`thinkclass-mp-auth`): the bearer token, its expiry, the user
 * row the server resolved, and the `classFeatures` snapshot taken at login. `wx.setStorageSync`
 * rather than async storage because every reader here is on a launch path where the app is
 * about to render a decision from it (which tab set, which role) - an await there only buys a
 * flash of the wrong UI.
 *
 * This module also owns the *session-change* notification. `utils/request.ts` writes here when
 * a silent re-login succeeds and clears here when it gives up, and `utils/feature.ts` listens
 * so that a fresh session re-resolves the class feature flags instead of reusing the previous
 * user's answer. Keeping the listener list next to the writer is what avoids an import cycle
 * (request -> feature -> request).
 */

import { AUTH_STORAGE_KEY, FEATURE_CACHE_KEY } from '../config/index'

/** The flat flag map `GET /api/classes/:id/features` and the login response both answer. */
export type ClassFeatureFlags = Record<string, boolean | number | string | null | undefined>

/** `packages/contracts/src/domains/auth.ts` `AuthUser`, trimmed to what the client reads. */
export interface SessionUser {
  id: number
  username: string
  role: string
  name?: string | null
  studentId?: number | null
  parentId?: number | null
  classId?: number | null
  /** The legacy spelling `LoginUserSnapshot` still carries beside `classId`. */
  class_id?: number | null
  is_activated?: boolean
  [key: string]: unknown
}

/**
 * The class a session belongs to, whichever spelling the answer used.
 *
 * `LoginUserSnapshot` names both `classId` and the legacy `class_id`, and which one is populated
 * depends on the role and on how the row was written. Reading only `classId` would silently disable
 * the live class-feature call for exactly the accounts that carry the legacy key - which is invisible
 * (the tab bar simply loses its gated entries) and therefore the kind of bug that survives a release.
 */
export function classIdOf(user: SessionUser | null | undefined): number | null {
  if (!user) {
    return null
  }
  if (typeof user.classId === 'number') {
    return user.classId
  }
  if (typeof user.class_id === 'number') {
    return user.class_id
  }
  return null
}

/** The linked student row, for the student-only reads (`summary`, certificates, purchases). */
export function studentIdOf(user: SessionUser | null | undefined): number | null {
  if (!user) {
    return null
  }
  return typeof user.studentId === 'number' ? user.studentId : null
}

export interface StoredSession {
  token: string
  expiresAt: string
  user: SessionUser
  /** Login-time snapshot: the flag map the server sent with the token. */
  classFeatures: ClassFeatureFlags
}

export interface FeatureCache {
  classId: number
  features: ClassFeatureFlags
  fetchedAt: number
}

type SessionListener = (session: StoredSession | null) => void

const listeners: SessionListener[] = []

/** Subscribe to session writes/clears. Returns nothing - listeners live for the app's life. */
export function onSessionChanged(listener: SessionListener): void {
  listeners.push(listener)
}

function emit(session: StoredSession | null): void {
  for (const listener of listeners) {
    try {
      listener(session)
    } catch (error) {
      // A listener that throws must not break the write that is already durable.
      console.warn('[storage] session listener failed', error)
    }
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = wx.getStorageSync<string>(key)
    if (!raw || typeof raw !== 'string') {
      return null
    }
    return JSON.parse(raw) as T
  } catch (error) {
    // A corrupt blob (an interrupted write, or a shape from an older build) is dropped rather
    // than thrown: the worst case is one extra login, the alternative is an app that cannot
    // start until the user clears 存储空间 by hand.
    console.warn('[storage] dropping unreadable value for', key, error)
    wx.removeStorageSync(key)
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    wx.setStorageSync(key, JSON.stringify(value))
  } catch (error) {
    console.warn('[storage] failed to persist', key, error)
  }
}

export function readSession(): StoredSession | null {
  const session = readJson<StoredSession>(AUTH_STORAGE_KEY)
  if (!session || typeof session.token !== 'string' || !session.token) {
    return null
  }
  if (!session.user || typeof session.user.role !== 'string') {
    return null
  }
  return {
    token: session.token,
    expiresAt: session.expiresAt || '',
    user: session.user,
    classFeatures: session.classFeatures || {},
  }
}

export function writeSession(session: StoredSession): void {
  writeJson(AUTH_STORAGE_KEY, session)
  emit(session)
}

/**
 * Drop the session, the cached feature answer, and tell the listeners.
 *
 * The feature cache is cleared here rather than at the login page because it is scoped to the
 * *class* of the session that fetched it: leaving it behind means the next user on this device
 * sees the previous class's tabs for as long as the live call takes to answer.
 */
export function clearSession(): void {
  wx.removeStorageSync(AUTH_STORAGE_KEY)
  wx.removeStorageSync(FEATURE_CACHE_KEY)
  emit(null)
}

export function readToken(): string {
  const session = readSession()
  return session ? session.token : ''
}

export function readFeatureCache(): FeatureCache | null {
  const cache = readJson<FeatureCache>(FEATURE_CACHE_KEY)
  if (!cache || typeof cache.classId !== 'number' || !cache.features) {
    return null
  }
  return cache
}

export function writeFeatureCache(cache: FeatureCache): void {
  writeJson(FEATURE_CACHE_KEY, cache)
}
