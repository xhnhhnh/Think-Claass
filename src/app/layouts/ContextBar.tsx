import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, PanelLeftClose, PanelLeftOpen, Search, UserCog } from 'lucide-react';

import { useShellStore } from '@/app/shell/shellStore';
import type { PageMeta } from '@/app/nav/usePageMeta';
import { Breadcrumbs } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { CommandHint } from '@/components/ui/kbd';
import { PageActionsOutlet } from '@/components/ui/page-actions';
import { cn } from '@/lib/utils';

/**
 * The context bar.
 *
 * This is the band across the top of the content that answers, in order: where am I
 * (breadcrumbs), what is this (the page's `h1`, taken from the route table), what can I
 * do here (the page's own actions, portalled in by `PageActions`), and how do I get
 * anywhere else (the command palette).
 *
 * ## What it replaced
 *
 * The old shell's header carried a role badge, a decorative eyebrow ("课堂运营"), an
 * `h1` that was the *route's* label, and a logout button. Each page then printed its own
 * heading and its own buttons *below* that, and above all of it sat a 96-pixel hero
 * banner with a stock illustration and a sentence about the product. On a 13-inch
 * laptop the first real control was below the fold on every page.
 *
 * ## The three decisions inside it
 *
 * - **The page's actions live in the bar, not in the page.** A primary action at the top
 *   right is where an application puts it, and it stays put while the page scrolls. The
 *   actions are still the page's own elements - see `page-actions.tsx`.
 * - **The title is truncated, never wrapped.** A wrapping `h1` in a sticky bar changes
 *   the bar's height per route, which is what makes a shell feel unstable.
 * - **The collapse control lives here on desktop.** It is a property of the shell, and
 *   putting it in the rail put it in the one place that disappears when the rail is
 *   collapsed.
 */
export interface ContextBarProps {
  meta: PageMeta;
  /** The console's home, for the rail-collapse control's absence on mobile. */
  homePath: string;
  /** Where「更多」and the user menu live on a narrow viewport. */
  actions?: React.ReactNode;
  className?: string;
}

export function ContextBar({ meta, actions, className }: ContextBarProps) {
  const railCollapsed = useShellStore((state) => state.railCollapsed);
  const toggleRail = useShellStore((state) => state.toggleRail);
  const openPalette = useShellStore((state) => state.openPalette);

  return (
    <header
      data-slot="context-bar"
      className={cn(
        'sticky top-0 z-30 grid h-bar grid-cols-[minmax(0,1fr)_auto] items-center gap-3',
        'border-b border-line-1 bg-surface-1/85 px-3 backdrop-blur-xl sm:px-5',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/*
          Desktop-only: the rail is always visible on a wide viewport, so this
          control has nothing to do on a phone, where the drawer is opened from the
          mobile bar instead.
        */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={toggleRail}
          aria-label={railCollapsed ? '展开侧栏' : '折叠侧栏'}
          aria-pressed={railCollapsed}
          className="hidden lg:inline-flex"
        >
          {railCollapsed ? (
            <PanelLeftOpen aria-hidden="true" className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden="true" className="size-4" />
          )}
        </Button>

        <div className="flex min-w-0 flex-col justify-center">
          <Breadcrumbs items={meta.breadcrumbs} className="hidden sm:flex" />
          <h1
            data-slot="page-title"
            className="truncate text-base font-bold tracking-tight text-fg-1"
          >
            {meta.title}
          </h1>
        </div>

        {/* The page's heading, description and actions, portalled in by the page. */}
        <div
          data-slot="page-head"
          className="flex min-w-0 flex-1 items-center justify-end gap-3 overflow-hidden"
        >
          <PageActionsOutlet className="flex min-w-0 items-center gap-2 overflow-hidden" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {/*
          The palette's entry point. A labelled button on a wide viewport because the
          shortcut alone is invisible, and an icon-only button on a narrow one because
          there is no room for the hint - the shortcut still works there.
        */}
        <Button
          type="button"
          variant="outline"
          onClick={() => openPalette()}
          className="hidden h-control w-56 justify-start gap-2 px-3 text-fg-3 md:inline-flex"
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search aria-hidden="true" className="size-4" />
          <span className="flex-1 text-left text-sm">搜索或跳转…</span>
          <CommandHint />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => openPalette()}
          aria-label="搜索或跳转"
          aria-keyshortcuts="Meta+K Control+K"
          className="md:hidden"
        >
          <Search aria-hidden="true" className="size-4" />
        </Button>

        {actions}
      </div>
    </header>
  );
}

/**
 * The account menu, rendered as a plain popover rather than a `DropdownMenu`.
 *
 * The kit's dropdown menu was deleted in an earlier phase for being unadopted, and the
 * two entries here (account settings, sign out) do not justify reinstating a menu
 * primitive with focus management, collision detection and a portal. A `<details>`
 * element gives keyboard access, escape-to-close and click-outside for free, and the
 * only thing it costs is a little styling.
 */
export function AccountMenu({
  userLabel,
  settingsPath,
  onLogout,
}: {
  userLabel: string;
  settingsPath: string;
  onLogout: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const { pathname } = useLocation();

  /*
   * Closing the menu is the one thing a `<details>` does not give you.
   *
   * It opens on a click and closes on a second click of its own summary, but not when the
   * reader clicks elsewhere, presses Escape, or navigates. Left as-is, opening the account
   * menu and then clicking a rail entry leaves it hanging over the page it just navigated
   * to - and `Escape` is worse, because the shell's global handler binds it and does
   * nothing here, so the menu looks unclosable from the keyboard.
   */
  useEffect(() => {
    const close = () => ref.current?.removeAttribute('open');

    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // A menu that survives a navigation is a menu over the wrong page.
  useEffect(() => {
    ref.current?.removeAttribute('open');
  }, [pathname]);

  return (
    <details ref={ref} className="group relative" data-slot="account-menu">
      <summary
        className={cn(
          'flex h-control cursor-pointer list-none items-center gap-2 rounded-md border border-line-1 bg-surface-2 px-2 text-sm',
          'transition-colors hover:bg-surface-3 [&::-webkit-details-marker]:hidden',
        )}
        aria-label="账户菜单"
      >
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-pill bg-role-soft text-xs font-semibold text-role-ink"
        >
          {userLabel.slice(0, 1)}
        </span>
        <span className="hidden max-w-24 truncate font-medium text-fg-2 sm:inline">{userLabel}</span>
      </summary>

      <div className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-panel border border-line-1 bg-surface-4 p-1 shadow-floating">
        <Link
          to={settingsPath}
          className="flex h-control items-center gap-2 rounded-md px-2 text-sm text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg-1"
        >
          <UserCog aria-hidden="true" className="size-4" />
          个人设置
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className="flex h-control w-full items-center gap-2 rounded-md px-2 text-left text-sm text-danger transition-colors hover:bg-danger-soft"
        >
          <LogOut aria-hidden="true" className="size-4" />
          退出登录
        </button>
      </div>
    </details>
  );
}

export default ContextBar;
