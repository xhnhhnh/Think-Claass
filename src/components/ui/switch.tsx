import { cn } from '@/lib/utils';

/**
 * A controlled switch.
 *
 * Hand-rolled toggles were the last raw interaction in the console: a `Button` whose padding
 * happened to look like a track, with no `role="switch"` and no `aria-checked`, so a screen
 * reader heard "button" twice and could not tell whether the feature was on. This owns the
 * semantics and the two visual states; callers own the value and the mutation.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  'aria-label': ariaLabel,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-state={checked ? 'checked' : 'unchecked'}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill border border-transparent transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-role',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-role' : 'bg-surface-steel',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block size-5 rounded-pill bg-surface-2 shadow-sm transition-transform',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export default Switch;
