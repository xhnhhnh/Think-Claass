import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Multi-line text input.
 *
 * Same surface as `Input` on purpose: a form whose one-line and multi-line fields
 * do not share a border, radius and focus ring looks broken, which is what the 24
 * hand-styled `<textarea>` elements in this app did.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  function Textarea({ className, rows = 3, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        data-slot="textarea"
        className={cn(
          'min-h-20 w-full min-w-0 rounded-lg border border-line-1 bg-surface-2 px-3 py-2 text-sm text-fg-1 transition-colors outline-none',
          'placeholder:text-fg-3',
          'focus-visible:border-role focus-visible:ring-[3px] focus-visible:ring-role/25',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-surface-3/60 disabled:opacity-50',
          'aria-invalid:border-danger aria-invalid:ring-[3px] aria-invalid:ring-danger/20',
          className,
        )}
        {...props}
      />
    );
  },
);

export { Textarea };
