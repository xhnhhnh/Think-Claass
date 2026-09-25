import { useEffect, useState } from 'react';

/**
 * A media query, as state.
 *
 * ## Why this exists rather than `lg:hidden`
 *
 * Most of the shell's responsive behaviour is CSS and stays that way. Three things
 * cannot be:
 *
 *   1. **Which navigation exists at all.** A rail, a bottom dock and a drawer are
 *      three different trees, not three sets of classes - the dock has different
 *      destinations from the rail, and rendering both and hiding one would put two
 *      live "current page" indicators in the document.
 *   2. **Whether a sheet's swiped-dismiss gesture is bound**, because a drag
 *      handler on a hover-capable device is dead code that also swallows clicks.
 *   3. **The scroll lock**, which has to be applied to exactly one of them.
 *
 * ## Why not `window.matchMedia` during render
 *
 * The initial value has to come from a subscription rather than a render-time read,
 * because the server-rendered markup and the first client render must agree. The app
 * is client-only today, so this is defence rather than a current bug - but it is the
 * difference between a shell that is correct under `StrictMode` double-render and one
 * that flashes the wrong navigation.
 *
 * The default is read synchronously in the initialiser, which is the one place a
 * render-time read is safe, and the effect then takes over.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMatch(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);

    // Re-read on subscribe: the query may have changed between the initial render
    // and this effect, and only the event listener would otherwise see the next one.
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

function readMatch(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

/**
 * The shell's breakpoint.
 *
 * Matches Tailwind's `lg` so the CSS and the JavaScript cannot disagree about where
 * the rail stops being a rail. Duplicated as a literal on purpose: Tailwind's default
 * screens are not importable from a config that is itself plain JavaScript, and a
 * shared constant that drifts from the config is worse than a literal next to a note.
 */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/** True on a viewport where the shell draws the rail instead of the dock. */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
