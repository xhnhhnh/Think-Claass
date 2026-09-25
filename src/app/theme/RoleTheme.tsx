import type { ReactNode } from 'react';
import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { adminPath } from '@/constants';
import { useShellStore } from '@/app/shell/shellStore';

/**
 * The one owner of the role accent and the colour scheme.
 *
 * ## What changed, and why it is one component rather than two
 *
 * The previous version put a `theme-<role>` class on `<html>` and that class
 * replaced the *entire palette*: `--primary`, `--secondary`, `--accent`,
 * `--ring`. The intent was "the student area feels like the student area", but
 * the effect was three consequences nobody asked for:
 *
 *   1. The same semantic thing meant different colours per area. A "success"
 *      chip was three different greens, so colour stopped carrying meaning.
 *   2. A dialog portalled to `<body>` was outside the scope, so the parent
 *      area's dialogs came out green - the bug the previous author fixed by
 *      moving the class to `<html>`, which then made the whole *document* the
 *      scope and made consequence 1 worse.
 *   3. The reader's own colour-scheme preference was ignored entirely; `.dark`
 *      existed in the stylesheet and nothing ever set it.
 *
 * Now the role is an *attribute* that only re-points three accent variables
 * (`--role`, `--role-soft`, `--role-ink`) plus the focus ring, and the colour
 * scheme is a separate, reader-owned axis. Choosing dark mode in the parent
 * area and choosing light mode in the student area are the same setting, which
 * is what a person expects from a product.
 *
 * ## Why a layout effect, and why two attributes
 *
 * It is a layout effect rather than a passive one because the attribute has to
 * be on `<html>` before the browser paints: the parent area's accent is amber
 * and the product default is green, so a passive effect paints the wrong accent
 * for one frame on every navigation. The previous author hit exactly this and
 * left the note; it is preserved rather than rediscovered.
 *
 * `data-role` (not a class) is deliberate: it is a data attribute because it
 * describes state, it is trivially assertable in tests, and it cannot be
 * confused with the old class-based skins that pages used to branch on.
 */

export type AppRole = 'teacher' | 'student' | 'parent' | 'admin';

/**
 * Which role scope a path belongs to, or `null` for the public surface.
 *
 * The admin path is injected by the server per deployment, so this asks
 * `adminPath()` rather than importing a constant: a constant is evaluated once
 * at module load, before the injection is guaranteed to be readable.
 */
export function resolveRole(pathname: string): AppRole | null {
  if (pathname.startsWith('/student')) return 'student';
  if (pathname.startsWith('/teacher')) return 'teacher';
  if (pathname.startsWith('/parent')) return 'parent';

  // Checked last because the admin path is deployment-defined and could in
  // principle be anything, including a prefix of another route.
  const admin = adminPath();
  if (admin && admin !== '/' && pathname.startsWith(admin)) return 'admin';

  return null;
}

/**
 * Resolve the effective colour scheme.
 *
 * `system` is the default and is resolved here rather than in CSS on purpose:
 * the `.dark` palette is a class, and an OS preference that flips at runtime
 * has to be observed to re-apply it. Returning a boolean also lets the toggle
 * tell the reader what it is about to do.
 */
export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function RoleTheme({ children }: { children: ReactNode }) {
  const location = useLocation();
  const theme = useShellStore((state) => state.theme);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const role = resolveRole(location.pathname);

    if (role) {
      root.setAttribute('data-role', role);
    } else {
      // The public surface has no role: it is the product's own face, so it
      // uses the product default rather than a borrowed accent.
      root.removeAttribute('data-role');
    }
  }, [location.pathname]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');

    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && Boolean(media?.matches));
      root.classList.toggle('dark', dark);
      // `color-scheme` is what makes form controls, scrollbars and the canvas
      // background follow. Without it a dark page keeps white native scrollbars.
      root.style.colorScheme = dark ? 'dark' : 'light';
    };

    apply();
    if (theme !== 'system' || !media) return;

    // Only observed in `system` mode: an explicit light/dark choice is not
    // something the OS gets to overrule.
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return <>{children}</>;
}

export default RoleTheme;
