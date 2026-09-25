/**
 * Finds the element a step points at, and keeps its on-screen rectangle current.
 *
 * Three things make this more than a `querySelector`.
 *
 * **The target may not exist yet.** A step can name an element that only appears once the reader
 * performs the previous one - the 课堂工具 panel is mounted by the click that step asked for, and a
 * navigation step's next target arrives with the new route. So a missing element is polled for a few
 * seconds rather than treated as an error, which is what lets a step point at "what just opened"
 * without the step order having to know when it mounts.
 *
 * **The target moves.** Scrolling the student list, opening a panel or resizing the window all move
 * it, and a spotlight that does not follow is worse than none - it dims the wrong area and points
 * the pointer at nothing. Scroll is listened to in the *capture* phase because the scrollable
 * container here is an inner `<main>`, not the document, so a listener on `window` in the bubble
 * phase never fires.
 *
 * **`ResizeObserver` is optional.** jsdom does not implement it, and a tour must never be the reason
 * a component cannot be rendered in a test.
 */

import { useEffect, useState } from 'react';

export interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TourTarget {
  element: HTMLElement | null;
  /** `null` until the element is found. The step renders unanchored while it is. */
  rect: TargetRect | null;
  /**
   * Still looking for the anchor.
   *
   * Distinct from "not found", and the distinction is visible: a step whose target is a moment away
   * shows its normal text centred, while a step whose target is genuinely absent shows its
   * `fallback` copy. Collapsing the two would flash "this feature is not on this screen" at every
   * reader for the half-second a panel takes to mount.
   */
  searching: boolean;
}

/** How often to look again for an element that has not mounted yet. */
const POLL_INTERVAL_MS = 150;

/**
 * How long to keep looking before giving up.
 *
 * Long enough for a route change and its first data fetch to land; short enough that a step whose
 * target is genuinely absent - a feature switched off, a page the reader navigated away from -
 * shows its fallback copy rather than leaving them on a dimmed screen with no explanation.
 */
const POLL_TIMEOUT_MS = 5000;

function measure(element: HTMLElement): TargetRect {
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/**
 * Whether an element is actually laid out.
 *
 * The same anchor is often rendered twice - `CampusShell` draws the sidebar and the mobile nav strip
 * from one list - and the hidden one is still in the DOM at zero size. Taking the first match
 * without this check would spotlight a 0x0 box in the corner on every narrow viewport, so the query
 * takes the first match that has a box.
 */
function isLaidOut(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export interface UseTourTargetOptions {
  /** Scroll a target into view smoothly, or instantly when the reader asked for less motion. */
  smoothScroll?: boolean;
}

/**
 * Bring a target the reader cannot see into view.
 *
 * A step can name something real but off-screen - the student grid scrolled down, a nav entry below
 * the fold - and spotlighting it where it is would dim the viewport and point at nothing.
 *
 * What is *not* worth scrolling to is a target that is already on screen but bigger than the
 * viewport, which is most of the time here: the sidebar is taller than a laptop window, so the first
 * version of this scrolled the whole page down by a couple of dozen pixels on every step that
 * pointed at it, moving the layout under the reader for no gain. So: always scroll when nothing of
 * the target is visible; never when the target is larger than the viewport and partly visible; and
 * otherwise scroll only when it is not fully in view.
 */
function bringIntoView(element: HTMLElement, smooth: boolean): void {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const fullyVisible =
    rect.left >= 0 && rect.top >= 0 && rect.right <= viewportWidth && rect.bottom <= viewportHeight;
  if (fullyVisible) return;

  const visibleWidth = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
  const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
  const nothingVisible = visibleWidth <= 0 || visibleHeight <= 0;

  const largerThanViewport = rect.width > viewportWidth || rect.height > viewportHeight;
  if (!nothingVisible && largerThanViewport) return;

  try {
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  } catch {
    // Not implemented in jsdom, and a browser that refuses the options object still has the element
    // found and measured - it simply is not scrolled to.
  }
}

export function useTourTarget(
  anchor: string | null,
  options: UseTourTargetOptions = {},
): TourTarget {
  const smoothScroll = options.smoothScroll ?? true;
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!anchor) {
      setElement(null);
      setRect(null);
      setSearching(false);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    // The effect owns the element it found; state exists only to re-render with the measurement.
    let found: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;

    setElement(null);
    setRect(null);
    setSearching(true);

    const remeasure = () => {
      if (cancelled || !found) return;
      setRect(measure(found));
    };

    const startTracking = (target: HTMLElement) => {
      window.addEventListener('resize', remeasure);
      window.addEventListener('scroll', remeasure, true);

      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(remeasure);
        observer.observe(target);
        // The element can be re-laid-out without the window moving - a panel above it collapses, a
        // web font loads - and the observer alone only reports the element's own box changing.
        if (target.parentElement) observer.observe(target.parentElement);
      }
    };

    const look = () => {
      if (cancelled) return;

      const matches = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`),
      );
      const match = matches.find(isLaidOut);

      if (match) {
        found = match;
        setElement(match);
        setRect(measure(match));
        setSearching(false);
        startTracking(match);
        bringIntoView(match, smoothScroll);
        return;
      }

      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        setElement(null);
        setRect(null);
        setSearching(false);
        return;
      }

      timer = window.setTimeout(look, POLL_INTERVAL_MS);
    };

    const startedAt = Date.now();
    look();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
      observer?.disconnect();
    };
  }, [anchor]);

  return { element, rect, searching };
}
