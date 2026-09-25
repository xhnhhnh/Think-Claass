import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';

import { useShellStore } from '@/app/shell/shellStore';
import type { NavSection } from '@/app/nav/navRegistry';
import { NavItem } from '@/components/ui/nav-item';
import { cn } from '@/lib/utils';
import BrandMark from '@/components/BrandMark';

/**
 * The rail.
 *
 * ## What it replaced
 *
 * One flat list of 25 destinations in the teacher console, each a `<button>` with an
 * `onClick={() => navigate(path)}`, ordered by nothing a reader could perceive, behind a
 * 272-pixel column of the same. Above it sat a 96-pixel brand block with a role badge and
 * an eyebrow ("课堂运营"); below it, a profile card, a "restart the guide" button and a
 * logout button, so roughly a third of the rail was chrome rather than destinations.
 *
 * ## What is different
 *
 * - **Grouped into sections of four to six**, so a console of this size reads without
 *   scrolling. A section header collapses its own group, and which groups are collapsed
 *   is remembered per console.
 * - **A link, not a button.** Each destination is a `<Link>` with `aria-current`, so
 *   middle-click, copy-link and "open in new tab" work, and a screen reader announces a
 *   navigation rather than a row of buttons.
 * - **Collapse is a width change, not a second markup tree.** The rail collapses to the
 *   icon column by changing `--rail-current`, so nothing re-mounts and the nav state
 *   survives. Hovering a collapsed entry reveals its label sideways rather than relying
 *   on a tooltip that a touch device cannot show.
 * - **The footer is two controls, not five.** Account settings and sign out live in the
 *   context bar's account menu; the rail keeps only the primary identity line.
 */

export interface SidebarNavProps {
  sections: NavSection[];
  activePath?: string;
  brand: { label: string; meta: string; icon: LucideIcon };
  /** Which console's fold state to read. See `collapsedSections` in the shell store. */
  layoutKey: string;
  /** Free-form slot below the sections: a console-level call to action. */
  footerSlot?: React.ReactNode;
  /** Called after a successful navigation, so the mobile drawer can close itself. */
  onNavigate?: () => void;
  /** `rail` is the collapsible desktop column; `sheet` is the mobile drawer's flat list. */
  variant?: 'rail' | 'sheet';
  className?: string;
}

export function SidebarNav({
  sections,
  activePath,
  brand,
  layoutKey,
  footerSlot,
  onNavigate,
  variant = 'rail',
  className,
}: SidebarNavProps) {
  const collapsed = useShellStore((state) => state.railCollapsed);
  const collapsedSections = useShellStore((state) => state.collapsedSections);
  const toggleSection = useShellStore((state) => state.toggleSection);

  const isRail = variant === 'rail';
  const iconOnly = isRail && collapsed;
  const folded = collapsedSections[layoutKey] ?? [];

  return (
    <div
      data-slot="sidebar-nav"
      data-variant={variant}
      data-collapsed={iconOnly ? 'true' : undefined}
      className={cn('flex h-full min-h-0 flex-col bg-surface-2', className)}
    >
      {/* Brand. Its own row rather than part of the nav's scroll area, so a long
          console's list scrolls under it rather than pushing it away. */}
      <div
        className={cn(
          'flex h-bar shrink-0 items-center gap-2.5 border-b border-line-1 px-3',
          iconOnly && 'justify-center px-0',
        )}
      >
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand"
        >
          <BrandMark variant="glyph" className="size-6" />
        </span>
        {!iconOnly ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-tight text-fg-1">Think-Class</div>
            <div className="truncate text-[0.6875rem] font-medium text-fg-3">{brand.label} · {brand.meta}</div>
          </div>
        ) : null}
      </div>

      <nav
        data-tour="sidebar-nav"
        aria-label="主导航"
        className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2', iconOnly ? 'px-2' : 'px-2')}
      >
        {sections.map((section) => {
          // In the collapsed rail the section headers have nowhere to go, so the groups
          // merge into one column of icons. A header rendered as a single letter would
          // be worse than no header.
          const isSectionCollapsed = folded.includes(section.key) && !iconOnly;

          return (
            <div key={section.key} className="py-1">
              {!iconOnly ? (
                <button
                  type="button"
                  onClick={() => toggleSection(layoutKey, section.key)}
                  aria-expanded={!isSectionCollapsed}
                  className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-[0.6875rem] font-bold uppercase tracking-wider text-fg-3 transition-colors hover:text-fg-1"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'size-3 transition-transform duration-fast',
                      isSectionCollapsed && '-rotate-90',
                    )}
                  />
                  <span className="truncate">{section.label}</span>
                </button>
              ) : null}

              {!isSectionCollapsed ? (
                <ul className="space-y-0.5 pt-0.5">
                  {section.items.map((item) => (
                    <li key={item.path}>
                      <NavItem
                        to={item.path}
                        label={item.label}
                        icon={item.icon}
                        active={activePath === item.path}
                        collapsed={iconOnly}
                        onNavigate={onNavigate}
                        data-tour={`nav:${item.path}`}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}

        {sections.length === 0 ? (
          <p className="px-2 py-6 text-xs text-fg-3">当前班级没有启用任何功能。</p>
        ) : null}
      </nav>

      {footerSlot ? (
        <div className="shrink-0 border-t border-line-1 p-2">{footerSlot}</div>
      ) : null}
    </div>
  );
}

export default SidebarNav;
