import { cn } from '@/lib/utils';

/**
 * Loading placeholder.
 *
 * Preferred over a spinner wherever the shape of the incoming content is known
 * (a table, a card grid): the layout does not jump when the data arrives. The 35
 * ad-hoc `animate-pulse` blocks are what this replaces.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

/** `count` stacked bars, for a list or a set of table rows. */
export function SkeletonList({
  count = 3,
  className,
  itemClassName,
}: {
  count?: number;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div data-slot="skeleton-list" className={cn('space-y-2', className)}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={cn('h-10 w-full', itemClassName)} />
      ))}
    </div>
  );
}
