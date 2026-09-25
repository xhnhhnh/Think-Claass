import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

/**
 * One rail (or drawer, or dock) destination.
 *
 * Rendered as a `Link` rather than a `Button` with an `onClick={() => navigate(…)}`,
 * which is what the previous shell did. The reasons are not stylistic:
 *
 *   - A link is focusable, middle-clickable, copyable and announced as a link.
 *     The old nav was a stack of `<button>`s, so the whole sidebar was invisible
 *     to "open this in a new tab" and to any crawler.
 *   - `aria-current="page"` is the correct signal for the active destination.
 *     The old shell re-derived the active state by string-comparing
 *     `location.pathname`, which broke for every parameterised route
 *     (`/teacher/papers/:id/edit` lit up nothing at all).
 *
 * `active` is passed in rather than computed here because only the shell knows
 * the matcher, and a nav item that matches its own path would silently disagree
 * with the context bar's title for the same route.
 */

export interface NavItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
  /** Collapsed rail: icon only, label exposed as a tooltip. */
  collapsed?: boolean;
  /** Trailing adornment - a count, a dot for "needs attention". */
  trailing?: React.ReactNode;
  /** Depth in the rail's hierarchy; the dock and flat lists use 0. */
  depth?: 0 | 1;
  onNavigate?: () => void;
  className?: string;
  /** Marks the element for the guided tour / verification sweep. */
  'data-tour'?: string;
}

export const NavItem = React.forwardRef<HTMLAnchorElement, NavItemProps>(function NavItem(
  {
    to,
    label,
    icon: Icon,
    active = false,
    collapsed = false,
    trailing,
    depth = 0,
    onNavigate,
    className,
    ...rest
  },
  ref,
) {
  return (
    <Link
      ref={ref}
      to={to}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      data-slot="nav-item"
      data-active={active ? 'true' : undefined}
      className={cn(
        'group/nav relative flex h-control items-center gap-2.5 rounded-md text-sm font-medium transition-colors',
        'text-fg-2 hover:bg-surface-3 hover:text-fg-1',
        depth === 1 ? 'pl-8 pr-2' : 'px-2',
        collapsed && 'justify-center px-0',
        // The active marker is a rail rather than a fill: at 25 destinations a
        // filled row and a hovered row are the same thing, so "you are here"
        // stops being readable at a glance.
        active && 'bg-role-soft font-semibold text-role-ink',
        className,
      )}
      {...rest}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-pill bg-role"
        />
      ) : null}
      <Icon aria-hidden="true" className={cn('size-4 shrink-0', active ? 'text-role' : 'text-fg-3')} />
      {collapsed ? (
        <span className="sr-only">{label}</span>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {trailing ? <span className="shrink-0 text-xs text-fg-3">{trailing}</span> : null}
        </>
      )}
    </Link>
  );
});

export default NavItem;
