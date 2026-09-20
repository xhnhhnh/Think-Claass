import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * File picker.
 *
 * Two admin pages drove a raw `<input type="file" className="hidden">` - one through a
 * ref so a button could open it, one nested inside a `<label>` so the label could. Both
 * shapes are supported here, and the input gets an accessible name instead of relying on
 * the button that happens to trigger it.
 */
export interface FileInputProps extends Omit<React.ComponentProps<'input'>, 'type'> {
  /** Required: a hidden input has no visible label to borrow a name from. */
  label: string;
}

const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(function FileInput(
  { className, label, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="file"
      aria-label={label}
      data-slot="file-input"
      className={cn('hidden', className)}
      {...props}
    />
  );
});

export { FileInput };
