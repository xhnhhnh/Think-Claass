import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A single row of headline figures.
 *
 * The old dashboard rendered eight `StatCard`s as eight bordered boxes; with no data
 * that is a wall of zeros. This component treats the figures as one band with hairline
 * dividers - the pattern the reference workbench uses - so the eye reads "class facts"
 * once, and the surrounding page has room for the things that need action.
 */
const TONES = {
  role: 'bg-role-soft text-role-ink',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  info: 'bg-info-soft text-info-ink',
  danger: 'bg-danger-soft text-danger-ink',
} as const;

interface KpiItem {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  hint?: ReactNode;
}

export function KpiStrip({ items, className }: { items: KpiItem[]; className?: string }) {
  const columns =
    items.length <= 1
      ? 'grid-cols-1'
      : items.length === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : items.length === 3
          ? 'grid-cols-1 sm:grid-cols-3'
          : 'grid-cols-2 lg:grid-cols-4';

  return (
    <div
      data-slot="kpi-strip"
      className={cn(
        'grid gap-px overflow-hidden rounded-card border border-line-1 bg-line-1',
        columns,
        className,
      )}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div key={index} className="flex min-w-0 items-center gap-3 bg-surface-2 px-4 py-3.5">
            {Icon ? (
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-card',
                  TONES[item.tone ?? 'role'],
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
              </span>
            ) : null}
            <div className="min-w-0">
              <div className="truncate text-caption text-fg-3">{item.label}</div>
              <div className="mt-0.5 text-xl font-bold tracking-tight text-fg-1 tabular-nums">
                {item.value}
              </div>
              {item.hint ? <div className="truncate text-caption text-fg-3">{item.hint}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default KpiStrip;
