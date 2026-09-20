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
          'min-h-20 w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-sm text-foreground transition-colors outline-none',
          'placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20',
          className,
        )}
        {...props}
      />
    );
  },
);

export { Textarea };
