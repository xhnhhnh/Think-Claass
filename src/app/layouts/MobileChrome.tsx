import { Menu, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useShellStore } from '@/app/shell/shellStore';
import type { PageMeta } from '@/app/nav/usePageMeta';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The mobile summary bar.
 *
 * On a phone the context bar would be a 56-pixel row holding a truncated title, a
 * breadcrumb trail, the page's actions and five controls - which is a row that fits
 * nothing. So the phone gets its own bar with four things: a drawer handle, the page's
 * title, the palette, and whatever the console passes as its trailing slot (the account
 * menu).
 *
 * The page's actions do **not** disappear here. They are portalled into the same
 * `PageActionsOutlet` the desktop bar uses, and the outlet renders as a second row of
 * the mobile bar when it has content - see `MobileChrome`.
 */
export function MobileBar({
  meta,
  trailing,
  className,
}: {
  meta: PageMeta;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const setDrawerOpen = useShellStore((state) => state.setDrawerOpen);
  const openPalette = useShellStore((state) => state.openPalette);

  return (
    <header
      data-slot="mobile-bar"
      className={cn(
        'sticky top-0 z-30 flex h-bar items-center gap-2 border-b border-line-1 bg-surface-1/90 px-2 pt-safe backdrop-blur-xl',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setDrawerOpen(true)}
        aria-label="打开导航菜单"
        className="lg:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </Button>

      <h1 data-slot="page-title" className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-fg-1">
        {meta.title}
      </h1>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => openPalette()}
        aria-label="搜索或跳转"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Search aria-hidden="true" className="size-5" />
      </Button>

      {trailing}
    </header>
  );
}

/**
 * The bottom dock.
 *
 * Four destinations and 「更多」. The four come from the route table's `mobileTab`
 * field, which is a per-role product decision rather than "whatever is listed first",
 * and the rest live in the drawer. The dock is `fixed` rather than sticky so the page's
 * own scroll cannot move it, and it carries the safe-area padding that the previous
 * shell had nowhere - which is why its controls sat under the home indicator on a
 * notched phone.
 *
 * 「更多」 is a fifth tab rather than a hamburger in the bar because the bar is already
 * carrying four controls, and because "the rest of the menu" is a navigation action, not
 * a settings one.
 */
export interface DockItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
}

export function MobileTabBar({
  items,
  activePath,
  moreOpen,
  className,
}: {
  items: DockItem[];
  activePath?: string;
  moreOpen: boolean;
  className?: string;
}) {
  const setDrawerOpen = useShellStore((state) => state.setDrawerOpen);
  const setDrawerMode = useShellStore((state) => state.setDrawerMode);

  return (
    <nav
      data-slot="mobile-dock"
      aria-label="主要页面"
      className={cn(
        // `flex` with `flex-1` children rather than a grid with a computed column count:
        // every tab takes an equal share without a runtime value, so the dock needs no
        // inline style and adding a fifth destination cannot leave it misaligned.
        'fixed inset-x-0 bottom-0 z-40 flex border-t border-line-1 bg-surface-2/95 pb-safe backdrop-blur-xl lg:hidden',
        className,
      )}
    >
      {items.map((item) => {
        const active = activePath === item.path;
        const Icon = item.icon;
        return (
          <Link
            key={item.path}
            to={item.path}
            aria-current={active ? 'page' : undefined}
            data-tour={`dock:${item.path}`}
            className={cn(
              'flex h-dock min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors',
              active ? 'text-role-ink' : 'text-fg-3',
            )}
          >
            <Icon aria-hidden="true" className={cn('size-5', active && 'text-role')} />
            <span className="max-w-full truncate px-1">{item.label}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={() => {
          setDrawerMode('all');
          setDrawerOpen(true);
        }}
        aria-expanded={moreOpen}
        className={cn(
          'flex h-dock min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors',
          moreOpen ? 'text-role-ink' : 'text-fg-3',
        )}
      >
        <MoreGlyph open={moreOpen} />
        <span>更多</span>
      </button>
    </nav>
  );
}

/**
 * The 「更多」 glyph.
 *
 * Four dots that fold into three when the drawer is open - a small piece of feedback
 * that says the control toggles something rather than navigating somewhere. Drawn
 * rather than imported because no icon in the set reads as "the rest of the menu".
 */
function MoreGlyph({ open }: { open: boolean }) {
  return (
    <span aria-hidden="true" className="flex size-5 items-center justify-center">
      <span className="grid grid-cols-2 gap-1">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              'size-1 rounded-pill bg-current transition-opacity duration-fast',
              // The fourth dot fades out when open, so the glyph reads as a toggle.
              open && index === 3 && 'opacity-0',
            )}
          />
        ))}
      </span>
    </span>
  );
}

export default MobileTabBar;
