import { useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

import { usePageMeta } from '@/app/nav/usePageMeta';
import { mobileOverflow, mobileTabs, navSections, visibleNavItems } from '@/app/nav/navRegistry';
import { CommandRegistryProvider } from '@/app/commands/registry';
import { useShellStore } from '@/app/shell/shellStore';
import { useIsDesktop } from '@/app/shell/useMediaQuery';
import { ContextBar, AccountMenu } from '@/app/layouts/ContextBar';
import { MobileBar, MobileTabBar } from '@/app/layouts/MobileChrome';
import { SidebarNav } from '@/app/layouts/SidebarNav';
import { CommandPalette } from '@/app/palette/CommandPalette';
import { ShortcutHelp } from '@/app/shortcuts/ShortcutHelp';
import { useGlobalShortcuts } from '@/app/shortcuts/useGlobalShortcuts';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { NavItem } from '@/components/ui/nav-item';
import { PageActionsOutlet, PageActionsProvider } from '@/components/ui/page-actions';
import { defaultClassFeatures, type ClassFeatures } from '@/lib/classFeatures';
import { cn } from '@/lib/utils';

/**
 * The application shell.
 *
 * One shell for all four consoles. That is the central decision of this refactor and
 * it is worth stating what it replaces: four layout components that each rendered the
 * same `CampusShell` with a different `role` prop, and a `roleCopy` table inside it
 * that re-pointed the entire palette per role. The result was four applications
 * wearing the same markup - a student's "success" chip and a teacher's "success" chip
 * were different greens, and the parent area's dialogs came out green because a portal
 * lands outside the shell element.
 *
 * Here the role is an accent (`data-role`, set once on `<html>` by `RoleTheme`), the
 * structure is identical everywhere, and each console differs in three ways only:
 *
 *   - which destinations the route table gives it (`layoutPath`);
 *   - what the brand says (`brand`);
 *   - which feature flags gate the menu (`features`).
 *
 * ## Layout modes
 *
 * `workbench` draws the rail, the context bar and the content. `immersive` draws a
 * full-bleed canvas with a floating exit, because the game surfaces and the projection
 * stage own the whole viewport and a rail would be a 240-pixel band of dead space. The
 * mode comes from the route table, so a page says what it is in one place.
 *
 * ## Breakpoints
 *
 * The rail and the dock are different navigation, not different styling, so exactly one
 * of them is mounted - see `useIsDesktop`, where that is explained. `lg` is the switch
 * and both sides agree on it because the query and Tailwind's `lg:hidden` are written
 * next to each other.
 */

export interface ShellBrand {
  label: string;
  meta: string;
  icon: LucideIcon;
}

export interface AppShellProps {
  role: 'teacher' | 'student' | 'parent' | 'admin';
  brand: ShellBrand;
  /** Fallback heading for a page that is not a nav destination (an editor, a detail view). */
  fallbackTitle: string;
  /** The console's landing page: the brand's target and the dock's home. */
  homePath: string;
  /** The console's account-settings path, for the account menu. */
  settingsPath: string;
  features?: ClassFeatures;
  /**
   * Menu entries this console hides even though their route stays reachable.
   *
   * The teacher console's rule that "an entry is useful only if any of six student-facing
   * features is on" cannot be expressed as a flag on the route: the route itself is
   * ungated, so the menu and the route answer different questions. Passing the resolved
   * set here keeps the rail, the dock and the palette filtered identically, which is the
   * property that matters - a destination hidden from the rail but listed in the palette
   * is a command that navigates to a page the reader was told they do not have.
   */
  hiddenPaths?: string[];
  /** Console-level content for the rail's footer: a class switcher, a call to action. */
  railFooter?: React.ReactNode;
  /** Rendered in the top bar's trailing slot, before the account menu. */
  barActions?: React.ReactNode;
  /** Called by the account menu's sign-out entry. */
  onLogout: () => void;
  userLabel: string;
  className?: string;
  /**
   * The routed page.
   *
   * Optional so the shell can be rendered around anything - which is what a shell test
   * wants - and defaults to the router's `<Outlet />`, which is what every role layout
   * relies on. A required prop would have made the four layouts pass `<Outlet />` to every
   * call site for no gain.
   */
  children?: React.ReactNode;
}

export function AppShell({
  role,
  brand,
  fallbackTitle,
  homePath,
  settingsPath,
  features = defaultClassFeatures,
  hiddenPaths,
  railFooter,
  barActions,
  onLogout,
  userLabel,
  className,
  children,
}: AppShellProps) {
  const { pathname } = useLocation();
  const meta = usePageMeta(fallbackTitle);
  const isDesktop = useIsDesktop();

  void pathname;

  const railCollapsed = useShellStore((state) => state.railCollapsed);
  const drawerOpen = useShellStore((state) => state.drawerOpen);
  const setDrawerOpen = useShellStore((state) => state.setDrawerOpen);
  const drawerMode = useShellStore((state) => state.drawerMode);

  // Keyboard shortcuts are bound once, by the shell. A page that wants its own binding
  // registers a command instead, so the palette and the shortcut cannot disagree.
  useGlobalShortcuts();

  const hidden = useMemo(() => new Set(hiddenPaths ?? []), [hiddenPaths]);

  const sections = useMemo(
    () => (meta.layoutPath ? navSections(meta.layoutPath, features, undefined, hidden) : []),
    [meta.layoutPath, features, hidden],
  );

  const dockItems = useMemo(
    () => (meta.layoutPath ? mobileTabs(meta.layoutPath, features, 4, hidden) : []),
    [meta.layoutPath, features, hidden],
  );

  const overflow = useMemo(
    () => (meta.layoutPath ? mobileOverflow(meta.layoutPath, features, 4, hidden) : []),
    [meta.layoutPath, features, hidden],
  );

  const allDestinations = useMemo(
    () => (meta.layoutPath ? visibleNavItems(meta.layoutPath, features, hidden) : []),
    [meta.layoutPath, features, hidden],
  );

  const paletteFeatures = features;

    const immersive = meta.mode === 'immersive';
  const page = children ?? <Outlet />;
  const layoutKey = meta.layoutPath ?? role;

  /*
   * The immersive frame.
   *
   * Deliberately not "the workbench with the chrome hidden": the canvas is the page, so
   * the shell contributes a single floating control whose only job is to make leaving
   * possible. Without it an immersive page is a trap on a device with no keyboard.
   */
  if (immersive) {
    return (
      <CommandRegistryProvider>
        <PageActionsProvider>
          <div
            data-slot="app-shell"
            data-mode="immersive"
            data-role-scope={role}
            className={cn('relative min-h-dvh bg-surface-1', className)}
          >
            <ImmersiveExit homePath={homePath} title={meta.title} />
            {/*
              The destination for a page's actions on a full-bleed surface.

              Immersive pages have no context bar, so without this a page that passed
              `actions` to its scaffold had them silently dropped - found by the agent that
              migrated the twelve student game pages, and true. It floats in the top-right,
              mirroring the exit control, and renders nothing visible on the surfaces that
              contribute no actions.
            */}
            <div
              data-slot="immersive-actions"
              className="fixed right-3 top-3 z-40 flex max-w-[calc(100vw-8rem)] items-center gap-2 overflow-hidden"
            >
              <PageActionsOutlet className="flex items-center gap-2" />
            </div>
            {page}
            <CommandPalette features={features} hiddenPaths={hidden} />
            <ShortcutHelp />
          </div>
        </PageActionsProvider>
      </CommandRegistryProvider>
    );
  }

  return (
    <CommandRegistryProvider>
      <PageActionsProvider>
        <div
          data-slot="app-shell"
          data-mode={isDesktop ? 'workbench' : 'mobile'}
          data-collapsed={railCollapsed ? 'true' : 'false'}
          className={cn(
            // A literal, not a variable: Tailwind's JIT only emits the `.app-shell` block
            // in `index.css` when it sees this class name in a scanned file.
            'app-shell bg-surface-1 text-fg-1',
            className,
          )}
        >
        {/* --- desktop rail ------------------------------------------------- */}
        {isDesktop ? (
          <div className="sticky top-0 h-dvh border-r border-line-1">
            <SidebarNav
              sections={sections}
              activePath={meta.item?.path}
              brand={brand}
              layoutKey={layoutKey}
              footerSlot={railFooter}
              variant="rail"
            />
          </div>
        ) : null}

        {/* --- content column ----------------------------------------------- */}
        <div className={cn('flex min-w-0 flex-col', !isDesktop && 'pb-dock')}>
          {isDesktop ? (
            <ContextBar
              meta={meta}
              homePath={homePath}
              actions={
                <>
                  {barActions}
                  <AccountMenu userLabel={userLabel} settingsPath={settingsPath} onLogout={onLogout} />
                </>
              }
            />
          ) : (
            <MobileBar
              meta={meta}
              trailing={
                <AccountMenu userLabel={userLabel} settingsPath={settingsPath} onLogout={onLogout} />
              }
            />
          )}

          <main
            data-slot="page-content"
            className={cn(
              'min-w-0 flex-1 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6',
              // A list page's sticky toolbar and a form's sticky action bar both need the
              // scroll container to be the document, not this element - so no `overflow`
              // is set here, deliberately.
              'pb-6',
            )}
          >
            {page}
          </main>
        </div>

        {/* --- mobile dock --------------------------------------------------- */}
        {!isDesktop ? (
          <MobileTabBar items={dockItems} activePath={meta.item?.path} moreOpen={drawerOpen} />
        ) : null}

        {/* --- the one drawer ------------------------------------------------ */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" title="导航" hideTitle className="w-80 p-0">
            <div className="flex h-full min-h-0 flex-col lg:h-full">
              {/*
                In `tabs` mode the drawer is the dock's overflow: the destinations that
                did not earn a tab, flat, so the reader sees exactly what they were
                promised by 「更多」. In `all` mode it is the whole console, grouped and
                foldable - the rail, on a phone.
              */}
              {drawerMode === 'tabs' ? (
                <nav aria-label="更多页面" className="p-2">
                  <ul className="space-y-0.5">
                    {overflow.map((item) => (
                      <li key={item.path}>
                        <NavItem
                          to={item.path}
                          label={item.label}
                          icon={item.icon}
                          active={meta.item?.path === item.path}
                          onNavigate={() => setDrawerOpen(false)}
                        />
                      </li>
                    ))}
                    {overflow.length === 0 ? (
                      <li className="px-2 py-6 text-xs text-fg-3">这个班级还没有更多页面。</li>
                    ) : null}
                  </ul>
                  <button
                    type="button"
                    onClick={() => useShellStore.getState().setDrawerMode('all')}
                    className="mt-2 flex h-control w-full items-center justify-center rounded-md border border-line-1 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-3"
                  >
                    查看全部页面（{allDestinations.length}）
                  </button>
                </nav>
              ) : (
                <SidebarNav
                  sections={sections}
                  activePath={meta.item?.path}
                  brand={brand}
                  layoutKey={layoutKey}
                  footerSlot={railFooter}
                  onNavigate={() => setDrawerOpen(false)}
                  variant="sheet"
                  className="h-dvh border-r-0"
                />
              )}
            </div>
          </SheetContent>
        </Sheet>

        <CommandPalette features={features} hiddenPaths={hidden} />
        <ShortcutHelp />
      </div>
      </PageActionsProvider>
    </CommandRegistryProvider>
  );
}

/**
 * The way out of an immersive page.
 *
 * A single control, top-left, floating over the canvas. It names the console it
 * returns to rather than saying "返回", because on a full-screen game surface the
 * question a stuck reader has is "where does this go".
 */
function ImmersiveExit({ homePath, title }: { homePath: string; title: string }) {
  return (
    <Link
      to={homePath}
      data-slot="immersive-exit"
      className={cn(
        'fixed left-3 top-3 z-40 inline-flex h-control items-center gap-1.5 rounded-md px-3',
        'border border-line-1 bg-surface-2/80 text-sm font-medium text-fg-2 backdrop-blur-xl',
        'transition-colors hover:bg-surface-2 hover:text-fg-1',
      )}
    >
      <span aria-hidden="true">&larr;</span>
      <span className="max-w-40 truncate">{title}</span>
    </Link>
  );
}

export default AppShell;
