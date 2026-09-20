import { Progress as ProgressPrimitive } from '@base-ui/react/progress';

import { cn } from '@/lib/utils';

/**
 * Progress bar.
 *
 * The admin dashboard hand-built one: a `<div>` whose width came from a `style={{ }}`
 * prop, with the threshold colour chosen by a template string and no ARIA at all. The
 * dynamic width is the part a page cannot express without an inline style, so the
 * indicator is Base UI's - which owns the fill and keeps the inline style inside the
 * library, where it is an implementation detail rather than a page bypassing the
 * design system.
 */
const TONES = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  destructive: 'bg-destructive',
} as const;

export interface ProgressProps {
  value: number;
  min?: number;
  max?: number;
  /** Announced to assistive tech. */
  label: string;
  tone?: keyof typeof TONES;
  className?: string;
}

export function Progress({ value, min = 0, max = 100, label, tone = 'primary', className }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      min={min}
      max={max}
      aria-label={label}
      className={className}
    >
      <ProgressPrimitive.Track className="h-2.5 w-full overflow-hidden rounded-full border border-border bg-muted">
        <ProgressPrimitive.Indicator
          className={cn('h-full rounded-full transition-all duration-500', TONES[tone])}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

/** Pick a tone from a 0-100 usage figure: the one rule every caller needed. */
export function toneForUsage(value: number): keyof typeof TONES {
  if (value > 80) return 'destructive';
  if (value > 50) return 'warning';
  return 'success';
}
