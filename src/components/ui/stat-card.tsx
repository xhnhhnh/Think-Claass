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
  primary: 'bg-role-soft text-role-ink',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  info: 'bg-info-soft text-info-ink',
  destructive: 'bg-danger-soft text-danger-ink',
} as const;

interface StatCardProps {
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
        'flex items-center gap-3 rounded-card border border-line-1 bg-surface-2 p-4',
        className,
      )}
    >
      {Icon ? (
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-card', TONES[tone])}>
          <Icon aria-hidden="true" className="size-5" />
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="truncate text-caption font-medium text-fg-3">{label}</div>
        <div className="mt-0.5 text-metric text-fg-1 tabular-nums">{value}</div>
        {hint ? <div className="mt-0.5 truncate text-caption text-fg-3">{hint}</div> : null}
      </div>
    </div>
  );
}
