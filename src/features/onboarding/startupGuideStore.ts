/**
 * Whether this account has already seen the opening guide, and the signal that replays it.
 *
 * ## Why the flag is local and keyed by user id
 *
 * The question the flag answers is "has *this account* been shown the guide", and the honest place
 * to record it would be the account. The `users` table has no such column - it carries `id`, `role`,
 * `username`, `password_hash` and `is_activated` and nothing else - so a server-side answer would
 * mean a migration, a column, an endpoint to read it and another to write it, which in turn drags
 * in the API-surface snapshot, the authorization matrix and the boot-schema guardrails. That is a
 * lot of machinery for a dismissal.
 *
 * So it is `localStorage`, which is what the two existing "this browser has already shown me
 * something" flags do (`thinkclass-first-run-dismissed`, `dismissed_announcement`). The difference
 * is the key: it is **per user id**, not per browser. A shared classroom machine is the normal case
 * here, and a single browser-wide flag would mean the first student to log in used up the guide for
 * every student after them.
 *
 * The trade-off, stated rather than hidden: an account that has seen the guide on one machine sees
 * it once more on the next one. That reads as correct for a welcome tour - the alternative, never
 * showing it again on a new device, is the more surprising of the two.
 *
 * ## Why the replay signal is a module-level store
 *
 * "重新开始引导" lives on the settings page and the guide lives above the router in `AppShell`, so
 * the two are siblings with no common provider. Threading a callback between them would mean a new
 * context or a new slice of `useStore` - and `useStore` is persisted under `thinkclass-user`, so
 * adding transient UI state there would put it in every user's saved payload. A ten-line
 * external store read through `useSyncExternalStore` is the smaller, more honest mechanism, and it
 * is testable without rendering anything.
 */

/** Key prefix for the per-account "already seen" flag. Exported as a test seam. */
export const GUIDE_SEEN_PREFIX = 'thinkclass-startup-guide-seen-';

/** The key one account's flag is stored under. */
export function guideSeenKey(userId: number): string {
  return `${GUIDE_SEEN_PREFIX}${userId}`;
}

/**
 * `localStorage`, or `null` when it cannot be reached.
 *
 * `window.localStorage` throws on access - not on read - in a browser with storage disabled, which
 * is why even getting the object is inside the try.
 */
function guideStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Whether this account has seen the guide.
 *
 * A storage failure answers `false` - "show it again". That is the harmless direction: the cost is
 * one extra viewing, where the cost of the other answer is a guide that can never be shown again on
 * a browser whose storage is unavailable. `useFirstRun` makes the same choice for the same reason.
 */
export function hasSeenGuide(userId: number): boolean {
  const storage = guideStorage();
  if (!storage) return false;
  try {
    return storage.getItem(guideSeenKey(userId)) === '1';
  } catch {
    return false;
  }
}

/** Record that this account has seen the guide. A storage failure is not worth failing a tour over. */
export function markGuideSeen(userId: number): void {
  const storage = guideStorage();
  if (!storage) return;
  try {
    storage.setItem(guideSeenKey(userId), '1');
  } catch {
    // Private mode, or a full quota. The in-memory set `useStartupGuide` keeps still hides it for
    // the rest of this session, so the guide does not reappear on the next render.
  }
}

// ---------------------------------------------------------------------------
// the replay request
// ---------------------------------------------------------------------------

let replayRequested = false;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to replay requests. The `useSyncExternalStore` contract. */
export function subscribeReplay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether a replay has been asked for and not yet finished. A boolean, so it is a stable snapshot. */
export function getReplayRequested(): boolean {
  return replayRequested;
}

/** Ask the guide to open, even for an account that has already seen it. */
export function requestReplay(): void {
  if (replayRequested) return;
  replayRequested = true;
  emit();
}

/** The replay finished (or was dismissed). The account's seen flag is *not* affected by this. */
export function clearReplayRequest(): void {
  if (!replayRequested) return;
  replayRequested = false;
  emit();
}
