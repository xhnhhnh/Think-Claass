/**
 * When the opening guide should be on screen.
 *
 * Three independent conditions, and all three have to hold:
 *
 *   1. **There is an account.** A visitor on the login page has no `userId`, and a guide that
 *      covers the sign-in form is a guide nobody asked for.
 *   2. **The current path is inside one of the four role shells.** Read from the route table rather
 *      than from a list of prefixes written here, so the admin console's runtime-injected path is
 *      covered for free and cannot drift.
 *   3. **Either this account has not seen it, or a replay was asked for.** See `startupGuideStore`
 *      for why the flag is per account and local.
 *
 * ## Why the path condition is not "is the user logged in"
 *
 * A logged-in account can still be on a page the guide must not cover. The paying deployments send
 * an unactivated student to `/activate` and an unpaid one to `/payment`; both are full-page flows
 * where the user has a job to do, and both are outside every shell. Gating on the shell path
 * expresses that directly instead of re-deriving `PrivateRoute`'s activation rule here and risking
 * the two disagreeing.
 */

import { useCallback, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';

import { layoutRoutes } from '@/app/routing/routeTable';

import {
  clearReplayRequest,
  getReplayRequested,
  hasSeenGuide,
  markGuideSeen,
  requestReplay,
  subscribeReplay,
} from './startupGuideStore';

/**
 * Whether `pathname` is inside one of the role shells.
 *
 * The admin console's sign-in screen is the one route that lives *under* a shell's path without
 * being part of the shell (`/beiadmin/login`), so a plain prefix match would treat it as inside and
 * put the guide over the form. It is excluded by name because there is exactly one such route.
 */
export function isInsideRoleShell(pathname: string): boolean {
  if (pathname.endsWith('/login')) return false;

  return layoutRoutes().some(
    (layout) => pathname === layout.path || pathname.startsWith(`${layout.path}/`),
  );
}

export interface StartupGuideState {
  /** Render the guide. */
  shouldShow: boolean;
  /** Close it: record the account as having seen it, and drop any pending replay request. */
  finish: () => void;
  /** Ask for it again, for the "重新开始引导" action. */
  replay: () => void;
}

export function useStartupGuide(userId: number | null | undefined): StartupGuideState {
  const { pathname } = useLocation();
  const [finishedIds, setFinishedIds] = useState<ReadonlySet<number>>(() => new Set<number>());

  // A boolean snapshot, so `useSyncExternalStore` can compare it by value; the third argument is
  // the server snapshot, which is the same value because there is no server-rendered guide.
  const replayRequested = useSyncExternalStore(
    subscribeReplay,
    getReplayRequested,
    getReplayRequested,
  );

  /*
   * The persisted flag is read on every render rather than mirrored into state.
   *
   * Mirroring it was the first attempt and it was wrong twice over: a `useState` initialiser runs
   * once, so an account that logged in after the component mounted kept the previous account's
   * answer, and a `useMemo` keyed on a revision counter needed a dependency the linter could see
   * was unused. `localStorage.getItem` is a cheap synchronous read of one key, and it is the
   * authority - there is nothing to keep in step. `finishedIds` exists only for the case storage
   * itself refused to record the dismissal.
   */
  const seen = userId == null ? true : finishedIds.has(userId) || hasSeenGuide(userId);

  const finish = useCallback(() => {
    if (userId == null) return;
    markGuideSeen(userId);
    clearReplayRequest();
    setFinishedIds((previous) => {
      if (previous.has(userId)) return previous;
      const next = new Set(previous);
      next.add(userId);
      return next;
    });
  }, [userId]);

  const replay = useCallback(() => {
    requestReplay();
  }, []);

  return {
    shouldShow: userId != null && isInsideRoleShell(pathname) && (replayRequested || !seen),
    finish,
    replay,
  };
}
