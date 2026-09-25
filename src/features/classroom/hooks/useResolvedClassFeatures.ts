/**
 * The single source of "are this class's feature flags on?" for the layouts and the route guard.
 *
 * ## The defect this replaces
 *
 * Five call sites (`StudentLayout`, `ParentLayout`, `FeatureRouteGuard`, `TeacherBigscreenPage`,
 * `Parent/Dashboard`) each did their own version of:
 *
 *     const features = classId ? classFeatureData?.features ?? defaultClassFeatures
 *                              : user?.classFeatures ?? defaultClassFeatures;
 *
 * `defaultClassFeatures` is every flag **false** - "the state before a class's settings have
 * loaded". So on the first render after a refresh, and for as long as the request was in flight,
 * every gated page was treated as switched off. `StudentLayout` then redirected the student away
 * from the page they had opened, and `FeatureRouteGuard` painted「功能未开放」over it. A *failed*
 * request never resolved at all, so the page stayed locked with no way to retry.
 *
 * The fix is not a bigger default. It is that **"we cannot answer" and "the teacher turned this
 * off" are different states**, and only the second one may hide a feature.
 *
 * ## Resolution order
 *
 *   1. Live `GET /api/classes/:id/features` when it has answered → `source: 'class'`.
 *   2. Otherwise the login snapshot (`user.classFeatures`, embedded in the login payload) →
 *      `source: 'login-snapshot'`. A real answer, possibly a few minutes old.
 *   3. Otherwise nothing → `source: 'unknown'`, `canDecide: false`, and consumers must wait.
 *
 * An account with no class at all is case 3 with an empty answer rather than a pending one: it
 * genuinely has no features, so `canDecide` is true and the flags are the documented all-false
 * default. That is the honest empty state, and it is what a student sees before a teacher assigns
 * them to a class.
 */

import { useStore } from '@/store/useStore';
import { useClassFeatures } from '@/hooks/queries/useClassFeatures';
import { defaultClassFeatures, type ClassFeatures } from '@/lib/classFeatures';

/** Where the features answer came from. */
export type ClassFeatureSource = 'class' | 'login-snapshot' | 'empty' | 'unknown';

export interface ResolvedClassFeatures {
  /** The flags to gate on. All-false when a class really has everything switched off. */
  features: ClassFeatures;
  /**
   * Whether there is enough information to gate on `features`.
   *
   * Consumers must treat `false` as "do not decide yet": do not hide a menu entry, do not redirect,
   * do not render a disabled-state page. It means "we have no answer", never "the answer is off".
   */
  canDecide: boolean;
  /** The live class request failed. `features` still carries the snapshot answer, when there is one. */
  isError: boolean;
  /** Re-run the live request. Only meaningful when `isError`. */
  refetch: () => void;
  source: ClassFeatureSource;
}

export function useResolvedClassFeatures(
  classId: number | null,
  options: { refetchInterval?: number | false } = {},
): ResolvedClassFeatures {
  const user = useStore((state) => state.user);
  const snapshot = user?.classFeatures;

  const query = useClassFeatures(classId, options);

  const refetch = () => {
    void query.refetch();
  };

  // No class to ask about. The snapshot is the whole answer, and its absence is a real state - an
  // account not yet bound to a class has no features - not a pending one.
  if (!classId) {
    return {
      features: snapshot ?? defaultClassFeatures,
      canDecide: true,
      isError: false,
      refetch,
      source: snapshot ? 'login-snapshot' : 'empty',
    };
  }

  const live = query.data?.features;
  if (live) {
    return { features: live, canDecide: true, isError: false, refetch, source: 'class' };
  }

  // The live answer is absent: still in flight, or failed. With a snapshot in hand the page is
  // usable immediately and can still report the failure; without one, nothing may be decided.
  return {
    features: snapshot ?? defaultClassFeatures,
    canDecide: Boolean(snapshot),
    isError: Boolean(query.isError),
    refetch,
    source: snapshot ? 'login-snapshot' : 'unknown',
  };
}
