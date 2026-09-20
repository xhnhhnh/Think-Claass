import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A dashboard figure: label, value, optional icon and hint.
 *
 * The admin dashboard built eight of these by hand with eight different background
 * tints - indigo, violet, emerald, amber, sky, rose, slate, purple - which is where a
 * third of the console's off-brand colours came from. The tone is an enum rather than
 * a class string on purpose: a caller cannot pass a colour, so a caller cannot
 * introduce a ninth palette.
 */
const TONES = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
  destructive: 'bg-destructive/10 text-destructive',
} as const;

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  hint?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, tone = 'primary', hint, className }: StatCardProps) {
  return (
    <div
      data-slot="stat-card"
      className={cn(
        'flex items-center gap-4 rounded-panel border border-border bg-card p-5 shadow-card',
        className,
      )}
    >
      {Icon ? (
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-card', TONES[tone])}>
          <Icon aria-hidden="true" className="size-5" />
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-ink-3">{label}</div>
        <div className="text-2xl font-bold tracking-tight text-ink-1">{value}</div>
        {hint ? <div className="mt-0.5 truncate text-xs text-ink-3">{hint}</div> : null}
      </div>
    </div>
  );
}
