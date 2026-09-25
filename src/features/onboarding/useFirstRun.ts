/**
 * Whether to offer the first-run wizard to this teacher.
 *
 * Two independent conditions, and both have to hold:
 *
 *   1. **The account has no classes.** Read from the same `GET /api/classes` query the dashboard
 *      already runs, so a teacher who creates their first class - by finishing the wizard or by
 *      any other route - stops being offered it immediately, with no extra request.
 *   2. **This browser has not dismissed it.** Kept locally rather than on the server: it is a
 *      property of "this teacher on this machine has already been shown this", not a fact about
 *      the account, and it must not follow them to a machine where they would want it again.
 *
 * `isLoading` is exposed because the wizard must not flash on screen during the first render, when
 * an empty class list means "not loaded yet" just as often as it means "genuinely empty".
 */

import { useCallback, useState } from 'react';

import { useClasses } from '@/hooks/queries/useClasses';

const DISMISS_KEY = 'thinkclass-first-run-dismissed';

function alreadyDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    // Private mode, or storage disabled. Offering the wizard again is the harmless outcome.
    return false;
  }
}

export interface FirstRunState {
  /** Show the wizard: the teacher has no classes and has not dismissed it. */
  shouldShow: boolean;
  /** Classes are still loading, so `shouldShow` is not yet meaningful. */
  isLoading: boolean;
  /** Record the decision for this browser and hide the wizard. */
  dismiss: () => void;
}

export function useFirstRun(): FirstRunState {
  const { data: classes, isLoading } = useClasses();
  const [dismissed, setDismissed] = useState(alreadyDismissed);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // The in-memory flag still hides it for this session.
    }
  }, []);

  return {
    shouldShow: !isLoading && !dismissed && (classes?.length ?? 0) === 0,
    isLoading,
    dismiss,
  };
}

/** Test seam: clear the recorded decision. */
export const FIRST_RUN_DISMISS_KEY = DISMISS_KEY;
