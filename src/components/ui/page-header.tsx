import { useEffect, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { PageActions, useHasPageActionsOutlet } from '@/components/ui/page-actions';
import { cn } from '@/lib/utils';

/**
 * A page's heading and its actions.
 *
 * ## What it is for now
 *
 * ```text
 *   <PageScaffold>   the shape of a page: variants, content measure, rail, action bar
 *   <PageHeader>     the heading and the buttons
 * ```
 *
 * A page can use either, and the C-phase migration moves pages from the second to
 * the first. Nothing breaks in between, because when a context bar is above the
 * page this component sends its whole heading *and* its actions there instead of
 * printing a second copy in the flow - the shell's `h1` supplies the page title
 * and this supplies the description and the buttons.
 *
 * ## Why the description does not simply move into the shell
 *
 * The shell's `h1` comes from the route table, which is the one list of paths and
 * labels. The description does not: it is `管理前台展示页面的主要内容`, it is
 * specific to the page, and it is copy that belongs next to the code that renders
 * the page. Routing it through the table would put 76 Chinese sentences in a
 * routing module.
 *
 * ## The accessible-name contract
 *
 * It renders an `<h2>`, never an `<h1>`, so a page has one top-level heading
 * whether or not this component renders its own visible heading; the shell owns
 * the `h1`. Tests reach the buttons through their accessible names
 * (`getByRole('button', { name: '保存' })`), and that is unchanged - which is the
 * point of keeping the buttons in this element's React tree rather than moving
 * the markup into the shell.
 */
export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons, usually. */
  actions?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function PageHeader({ title, description, actions, icon: Icon, className }: PageHeaderProps) {
  const hasShell = useHasPageActionsOutlet();

  /*
   * With a shell, this contributes only its actions.
   *
   * The shell's context bar already renders the page's `h1` from the route table, so a
   * heading here would print the title twice. An intermediate version portalled the
   * heading plus its description into the bar instead, on the theory that the description
   * is page copy the route table has no business carrying - and a real browser showed why
   * that fails: an icon, a title and a description is 60 pixels of content in a 53-pixel
   * bar, and the overflow is clipped rather than wrapped.
   *
   * So the rule is narrower and easier to hold: the shell owns the heading, the page owns
   * its buttons. The description is not lost - it is the heading's accessible
   * description, moved onto the bar's `h1` through the attribute below.
   */
  if (hasShell) {
    return (
      <PageActions kind="actions">
        {/*
          `title` is on the title element rather than here because the bar's `h1` is
          rendered by the shell, not by this component; `PageHeadingDescription` carries the
          text to it. Keeping the buttons in this tree is the point of the portal, so a Save
          that is disabled by the page's own state still renders its disabled state.
        */}
        <PageHeadingDescription text={typeof description === 'string' ? description : undefined} />
        {actions}
      </PageActions>
    );
  }

  const heading = (
    <div className="flex min-w-0 items-start gap-3">
      {Icon ? (
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-card bg-role-soft text-role-ink">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      ) : null}
      <div className="min-w-0">
        <h2 className="truncate text-xl font-bold tracking-tight text-fg-1">{title}</h2>
        {description ? <p className="mt-1 text-sm text-fg-3">{description}</p> : null}
      </div>
    </div>
  );

  return (
    <div
      data-slot="page-header"
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}
    >
      {heading}
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Move a page's description onto the context bar's heading.
 *
 * A zero-render component: it writes the text into the `h1` the shell already rendered,
 * so the description survives as the heading's accessible description without occupying
 * any of the bar's 53 pixels. Rendered through the same portal as the actions, so it only
 * does anything when there is a bar to write into.
 */
function PageHeadingDescription({ text }: { text?: string }) {
  useEffect(() => {
    if (!text) return;
    const heading = document.querySelector<HTMLElement>('[data-slot="page-title"]');
    if (!heading) return;

    const previous = heading.getAttribute('title');
    heading.setAttribute('title', text);
    return () => {
      if (previous === null) heading.removeAttribute('title');
      else heading.setAttribute('title', previous);
    };
  }, [text]);

  return null;
}

export default PageHeader;
