import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Form field: label, control, hint, error.
 *
 * A **wrapping `<label>`**, deliberately. The tests this app already has reach
 * their controls with `getByLabelText('股票名称')`, which resolves through the
 * label's text content, so the markup has to keep the control nested inside its
 * label (or the association has to be re-derived per control, which is the kind of
 * change that silently breaks a form nobody looks at again).
 *
 * The required marker is drawn with `after:content-['*']` rather than a real `*`
 * character for the same reason: a character would join the label's text content
 * and turn `getByLabelText('股票名称')` into a miss. The visual affordance stays,
 * the accessible name does not move.
 */
export interface FormFieldProps {
  label: ReactNode;
  children: ReactNode;
  required?: boolean;
  /** Shown under the control, replaced by `error` when there is one. */
  hint?: ReactNode;
  error?: ReactNode;
  /** Single row, control first - for checkboxes and switches. */
  inline?: boolean;
  className?: string;
}

export function FormField({
  label,
  children,
  required,
  hint,
  error,
  inline,
  className,
}: FormFieldProps) {
  return (
    <label
      data-slot="form-field"
      className={cn(
        'flex flex-col gap-1.5 text-sm',
        inline && 'flex-row items-center gap-2',
        className,
      )}
    >
      <span
        className={cn(
          'font-medium text-ink-2',
          required && "after:ml-0.5 after:text-destructive after:content-['*']",
        )}
      >
        {label}
      </span>
      {children}
      {hint && !error ? <span className="text-xs text-ink-3">{hint}</span> : null}
      {error ? (
        <span role="alert" className="text-xs font-medium text-destructive">
          {error}
        </span>
      ) : null}
    </label>
  );
}
