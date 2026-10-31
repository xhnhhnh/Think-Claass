/**
 * Whether to offer the first-run wizard to this teacher.
 *
 * Three conditions:
 *
 *   1. **The wizard was offered on a genuinely empty account.** Latched once ("ever offered") so
 *      the wizard survives its own first step: that step creates the class, and steps 2–4 add the
 *      roster and configure the class's feature switches. Reading "no classes" live would unmount
 *      the flow immediately after the create succeeds.
 *   2. **This browser has not dismissed or finished it.** Kept locally rather than on the server:
 *      it is a property of "this teacher on this machine has already been shown this", not a fact
 *      about the account.
 *   3. **The class list read succeeded.** A failed read is not "no classes": the wizard must never
 *      replace that error with an invitation to create a class the account may already have.
 *
 * `isLoading` is exposed because the wizard must not flash on screen during the first render, when
 * an empty class list means "not loaded yet" just as often as it means "genuinely empty".
 */

import { useCallback, useEffect, useState } from 'react';

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

interface FirstRunState {
  /**
   * Show the wizard.
   *
   * Kept true after the wizard's own first step creates a class: the wizard is a multi-step flow
   * (class → roster → features → done) and its later steps write to the class it just made, so
   * transitioning straight back to the dashboard would strand them. Once dismissed or finished it
   * stays hidden, and it never appears for an account that already had a class on load.
   */
  shouldShow: boolean;
  /** Classes are still loading, so `shouldShow` is not yet meaningful. */
  isLoading: boolean;
  /** The class list request failed. The wizard must not replace the error with a "no classes" claim. */
  isError: boolean;
  /** Record the decision for this browser and hide the wizard. */
  dismiss: () => void;
}

export function useFirstRun(): FirstRunState {
  const { data: classes, isLoading, isError } = useClasses();
  const [dismissed, setDismissed] = useState(alreadyDismissed);
  /**
   * "This browser was shown the wizard for an empty account."
   *
   * Latched once and never reset: the wizard's first step creates the class, so a later render sees
   * a non-empty list and would otherwise unmount the flow between steps 2 and 4. A teacher who
   * already had a class when the page loaded never latches it, so the wizard cannot appear for
   * them and cannot be used as a shortcut to create another class.
   */
  const [everOffered, setEverOffered] = useState(false);

  const loadedEmpty = !isLoading && !isError && (classes?.length ?? 0) === 0;

  useEffect(() => {
    if (loadedEmpty) setEverOffered(true);
  }, [loadedEmpty]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // The in-memory flag still hides it for this session.
    }
  }, []);

  return {
    shouldShow: !dismissed && !isError && (everOffered || loadedEmpty),
    isLoading,
    isError: Boolean(isError),
    dismiss,
  };
}
