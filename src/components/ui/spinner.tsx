import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Spinner.
 *
 * One spinner instead of the 54 hand-rolled `animate-spin` elements, and it carries
 * `role="status"` so a screen reader is told something is happening - which none of
 * the hand-rolled ones did.
 */
const SIZES = {
  sm: 'size-3.5',
  default: 'size-4',
  lg: 'size-6',
} as const;

export interface SpinnerProps extends React.ComponentProps<'span'> {
  size?: keyof typeof SIZES;
  /** Announced to assistive tech; not rendered as visible text. */
  label?: string;
}

export function Spinner({ className, size = 'default', label = '正在加载', ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      data-slot="spinner"
      className={cn('inline-flex items-center justify-center text-current', className)}
      {...props}
    >
      <Loader2 aria-hidden="true" className={cn('animate-spin', SIZES[size])} />
    </span>
  );
}
