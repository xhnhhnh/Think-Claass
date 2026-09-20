import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Page header.
 *
 * 29 pages hand-write `<h2 className="text-2xl font-bold text-slate-800">` plus a
 * grey paragraph under it. This is that block, and it renders an `<h2>` on purpose:
 * the shell already renders the route's title as the page's `<h1>`, so a header
 * that rendered another `h1` would break the document outline.
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
  return (
    <div
      data-slot="page-header"
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-card bg-primary/5 text-primary">
            <Icon aria-hidden="true" className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-ink-1">{title}</h2>
          {description ? <p className="mt-1 text-sm text-ink-3">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
