import React, { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { adminPath } from '@/constants';

/**
 * The one owner of the role theme.
 *
 * The theme class goes on `<html>` rather than on a shell element, and this is the
 * only place that sets it. It used to be set twice - here *and* on the
 * `CampusShell` root - which meant the two could disagree, and it never covered
 * `/teacher` at all (`.theme-teacher` sat in the stylesheet unreachable).
 *
 * Setting it on `<html>` matters for a second reason: base-ui portals dialogs and
 * menus to `document.body`, which is outside the shell element. Before this, a
 * parent-area dialog rendered with the *default* green theme inside an orange area.
 *
 * `adminPath()` rather than the `ADMIN_PATH` constant: the admin path is injected
 * per deployment, and a constant is evaluated once at module load, before the
 * injection is guaranteed to be readable.
 */
export default function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  /*
   * A layout effect, not a passive one: the class has to be on `<html>` before the
   * browser paints, or the parent area (orange) flashes the default green on every
   * navigation. The shell element used to carry the class from the first render, so
   * moving ownership here would otherwise have traded a correctness bug for a
   * visible flash.
   */
  useLayoutEffect(() => {
    const path = location.pathname;
    const root = document.documentElement;

    // Remove every known theme class first, so navigating between roles cannot
    // leave the previous role's class behind.
    root.classList.remove('theme-student', 'theme-teacher', 'theme-parent', 'theme-admin');

    if (path.startsWith('/student')) {
      root.classList.add('theme-student');
    } else if (path.startsWith('/teacher')) {
      root.classList.add('theme-teacher');
    } else if (path.startsWith(adminPath())) {
      root.classList.add('theme-admin');
    } else if (path.startsWith('/parent')) {
      root.classList.add('theme-parent');
    }
    // Public routes (portal, login, activation, payment) use the default theme, which
    // is the teacher palette - the campus green.
  }, [location.pathname]);

  return <>{children}</>;
}
