import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Sprout } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Empty state.
 *
 * The app has 63 hand-written "暂无..." blocks, each with its own padding, icon
 * size and grey. This is the one they collapse into. The copy stays with the
 * caller - a component that decides what "nothing here" means would have to know
 * every page.
 */
export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Usually a `<Button>`. Rendered under the copy. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Sprout,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex min-h-40 flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-border bg-white/70 p-8 text-center',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-card bg-primary/5 text-primary">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="space-y-1">
        <div className="text-sm font-semibold text-ink-1">{title}</div>
        {description ? <div className="text-sm text-ink-3">{description}</div> : null}
      </div>
      {action}
    </div>
  );
}
