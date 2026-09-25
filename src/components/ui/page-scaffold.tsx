import type { ReactNode } from 'react';

import { PageActions, useHasPageActionsOutlet } from '@/components/ui/page-actions';
import { cn } from '@/lib/utils';

/**
 * The page template.
 *
 * ## Why this exists
 *
 * Before it, "a page" meant 76 files each deciding for themselves what a page
 * looks like. The result, measured rather than remembered: 29 hand-written page
 * headings with three different sizes, fourteen hand-written loading rows, six
 * hand-written empty blocks, and a primary action that could be anywhere in the
 * top third. Nothing was wrong enough to fail a review and nothing agreed with
 * anything else.
 *
 * This is the one shape a page can be. Five variants cover what the product
 * actually contains, and each one answers the same four questions the same way:
 * where the actions go, how the content scrolls, how the side rail behaves, and
 * what the page does on a phone.
 *
 * ## What it does *not* do
 *
 * It does not render the title. The shell's context bar owns the page's `h1` and
 * takes it from the route table, so a scaffold that also rendered one would put
 * the title on the screen twice - which is precisely the defect this replaces. A
 * `title` prop exists for the standalone case (a page mounted without a shell,
 * which is what every page test does) and is suppressed when a shell is present.
 *
 * ## The variants
 *
 * - `dashboard` - a metric row and then cards. Two columns at `xl`, one below it.
 * - `list` - a toolbar, then a table, filling the width. The toolbar sticks.
 * - `detail` - a main column with a side rail for context: the record's metadata,
 *   its history, its quick actions.
 * - `form` - a constrained measure, with a sticky action bar at the bottom on a
 *   phone so Save is always reachable without scrolling back up.
 * - `immersive` - a full-bleed canvas for the game surfaces. No padding, no
 *   measure, no rail; the page owns the whole viewport and the shell gets out of
 *   its way.
 */

export type PageVariant = 'dashboard' | 'list' | 'detail' | 'form' | 'immersive';

export interface PageScaffoldProps {
  variant?: PageVariant;
  /**
   * The page's primary and secondary actions.
   *
   * Rendered into the shell's context bar when there is one, and inline at the
   * top of the content when there is not - see `PageActions`, where the fallback
   * is explained rather than being an accident.
   */
  actions?: ReactNode;
  /**
   * A short line under the title.
   *
   * Use it freely: it renders only when there is no shell, and when there is one the text
   * becomes the shell heading's accessible description (see `PageHeader`). It can never be
   * rendered twice.
   */
  description?: ReactNode;
  /**
   * The page's heading, for a render with no shell above it.
   *
   * **Use it freely.** It is not a duplicate of the shell's `h1`: it is suppressed whenever a
   * shell is present, so it has no effect in the running application and every effect on a
   * standalone render - which is what a page test is. A page that passes it and a page that
   * does not are identical in production.
   *
   * This note exists because the opposite rule was written into the C-phase migration brief
   * ("do not pass `title`") and an agent hit the contradiction: `Admin/Dashboard.test.tsx`
   * asserts the page's title text, and after the page's own `PageHeader` was removed the only
   * place left to render it was here. The rule was wrong; the defect it was aimed at is a page
   * rendering its **own** heading element alongside the shell's, which is a different thing and
   * is what the `pagesWithOwnHeader` guardrail counts.
   */
  title?: ReactNode;
  /** Slot below the heading and above the main content: a toolbar, a filter row. */
  toolbar?: ReactNode;
  /** Slot to the right of the main column. Bounded by `detail`; ignored by others. */
  rail?: ReactNode;
  /** Rendered inside the side rail, below `rail`. */
  railFooter?: ReactNode;
  /** Sticky bar at the bottom for `form`. */
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

const VARIANT_CLASS: Record<PageVariant, string> = {
  // The vertical rhythm is per variant rather than one global gap: a dashboard
  // of cards wants more air between blocks than a list does, and a list wants
  // its toolbar tight against its table.
  dashboard: 'space-y-6',
  list: 'space-y-4',
  detail: 'space-y-5',
  form: 'space-y-5',
  immersive: 'space-y-0',
};

export function PageScaffold({
  variant = 'dashboard',
  actions,
  description,
  title,
  toolbar,
  rail,
  railFooter,
  footer,
  className,
  contentClassName,
  children,
}: PageScaffoldProps) {
  const hasShell = useHasPageActionsOutlet();

  /*
   * `immersive` is the escape hatch: the game surfaces and the projection stage are
   * full-bleed canvases with their own composition, and padding them would be a scaffold
   * fighting the page.
   *
   * Actions still work here, and that is a fix rather than a detail: the first version of
   * this branch rendered `{children}` alone, so a page that passed `actions` lost its
   * buttons with no error anywhere. The immersive shell has no context bar to portal them
   * into, so they are portalled into the shell's floating top-right rail instead - the
   * mirror of the exit control in the top-left, and the only piece of chrome an immersive
   * surface gets.
   */
  if (variant === 'immersive') {
    return (
      <div data-slot="page-scaffold" data-variant="immersive" className={cn('relative', className)}>
        {/* Inline fallback: with no shell at all - which is what a page test is - the
            actions render here, so the same component is under test and in production. */}
        {actions && !hasShell ? (
          <div className="mb-4 flex flex-wrap items-center gap-2" data-slot="page-actions-row">
            {actions}
          </div>
        ) : null}
        {hasShell && actions ? <PageActions kind="actions">{actions}</PageActions> : null}
        {children}
      </div>
    );
  }

  const isForm = variant === 'form';

  return (
    <div
      data-slot="page-scaffold"
      data-variant={variant}
      className={cn('mx-auto w-full max-w-page', className)}
    >
      {/* The standalone heading: only when no shell rendered one. */}
      {!hasShell && (title || description) ? (
        <header className="mb-4">
          {title ? (
            <h1 className="text-xl font-bold tracking-tight text-fg-1">{title}</h1>
          ) : null}
          {description ? <p className="mt-1 text-sm text-fg-3">{description}</p> : null}
        </header>
      ) : null}

      {/* Inline actions. Renders nothing at all when the shell took them.
          `kind="actions"` is required: the default slot is the reading-order slot, so a page's
          buttons would land beside the title instead of at the trailing edge. */}
      {actions ? (
        hasShell ? (
          <PageActions kind="actions">{actions}</PageActions>
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-2" data-slot="page-actions-row">
            {actions}
          </div>
        )
      ) : null}

      {toolbar ? (
        <div
          data-slot="page-toolbar"
          className={cn(
            // Sticky so a list's search and filters stay reachable while the
            // table scrolls. `-mx-1 px-1` keeps the shadow off the container edge.
            variant === 'list' &&
              'sticky top-0 z-20 -mx-1 border-b border-line-1 bg-surface-1/95 px-1 py-3 backdrop-blur',
          )}
        >
          {toolbar}
        </div>
      ) : null}

      {rail ? (
        <div className={cn('grid gap-5', 'xl:grid-cols-[minmax(0,1fr)_20rem]')}>
          <div className={cn(VARIANT_CLASS[variant], contentClassName)}>{children}</div>
          <aside
            data-slot="page-rail"
            // Sticky and self-starting, so a short main column does not leave the
            // rail floating in the middle of the page.
            className="space-y-4 xl:sticky xl:top-4 xl:self-start"
          >
            {rail}
            {railFooter}
          </aside>
        </div>
      ) : (
        <div className={cn(VARIANT_CLASS[variant], contentClassName)}>{children}</div>
      )}

      {isForm && footer ? (
        <>
          {/* Spacer so the sticky bar never covers the last field. */}
          <div aria-hidden="true" className="h-20 sm:h-16" />
          <div
            data-slot="page-action-bar"
            className="fixed inset-x-0 bottom-0 z-30 border-t border-line-1 bg-surface-2/95 pb-safe backdrop-blur sm:sticky sm:bottom-0"
          >
            <div className="mx-auto flex w-full max-w-page flex-wrap items-center justify-end gap-2 px-4 py-3 sm:px-6">
              {footer}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * A section inside a page.
 *
 * Deliberately thinner than `SectionCard`: this one has no surface of its own,
 * only a heading and a rhythm, for content that is already inside a card or that
 * should not look like one (a form's field groups, a detail column).
 */
export function PageSection({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-slot="page-section" className={cn('space-y-3', className)}>
      {title || actions ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-fg-1">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-fg-3">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export default PageScaffold;
