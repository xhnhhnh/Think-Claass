import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Select.
 *
 * Deliberately a **styled native `<select>`**, not a listbox built on
 * `@base-ui/react/select`. The 27 selects in this app are written as
 * `<select value onChange><option>`, and the jobs of this refactor are visual
 * consistency and removing the raw-element debt - not a behaviour change on 27
 * pages. A composite listbox would need every call site rewritten (`items`,
 * `onValueChange`, portal, positioning) and would change mobile and keyboard
 * behaviour, which is exactly what "no unrequested behaviour change" rules out.
 *
 * The visible wrapper exists for the chevron: a native select cannot contain an
 * icon, so it is drawn beside one with `appearance-none`.
 */
export interface SelectProps extends React.ComponentProps<'select'> {
  /** Wrapper classes. The `<select>` itself takes `className`. */
  wrapperClassName?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, wrapperClassName, children, ...props },
  ref,
) {
  return (
    <span
      data-slot="select-wrapper"
      className={cn('relative inline-flex w-full items-center', wrapperClassName)}
    >
      <select
        ref={ref}
        data-slot="select"
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-lg border border-line-1 bg-surface-2 py-1 pl-3 pr-9 text-sm text-fg-1 transition-colors outline-none',
          'focus-visible:border-role focus-visible:ring-[3px] focus-visible:ring-role/25',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 size-4 text-ink-3"
      />
    </span>
  );
});

export { Select };
