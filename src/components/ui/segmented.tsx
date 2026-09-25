import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A one-of-N control - tabs, filters, view toggles.
 *
 * The app already had four hand-rolled versions of this: the attendance page's
 * 考勤/请假 tabs, the features page's class picker, the login page's role
 * picker, and several "全部 / 已启用 / 已停用" filter rows. Each drew its own
 * pill, its own active state and its own hover, and they disagreed about all
 * three. This is the one implementation.
 *
 * Built on `<button role="tab">` semantics through `aria-pressed` rather than
 * Base UI's Tabs: every current call site is a *filter* over content that is
 * already on the page (there is no panel to show and hide), and the ARIA tabs
 * pattern would require wiring `aria-controls` to panels that do not exist.
 *
 * Keyboard support is the part that cannot be skipped: arrow keys move
 * selection and the group is a single tab stop, which is what makes a segmented
 * control feel like one control rather than N buttons.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Optional count badge - a tag count, a pending count. */
  trailing?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. Required: an unlabelled toggle row is a mystery. */
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: SegmentedProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const move = (from: number, direction: 1 | -1) => {
    const enabled = options
      .map((option, index) => ({ option, index }))
      .filter((entry) => !entry.option.disabled);
    if (enabled.length === 0) return;

    const current = enabled.findIndex((entry) => entry.index === from);
    const next = enabled[(current + direction + enabled.length) % enabled.length];
    onChange(next.option.value);
    refs.current[next.index]?.focus();
  };

  return (
    <div
      role="group"
      aria-label={label}
      data-slot="segmented"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-line-1 bg-surface-3 p-0.5',
        className,
      )}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => {
              if (!active && !option.disabled) onChange(option.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(index, -1);
              }
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              active
                ? 'bg-surface-2 text-fg-1 shadow-card'
                : 'text-fg-3 hover:bg-surface-2/60 hover:text-fg-1',
              option.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {option.label}
            {option.trailing ? (
              <span
                className={cn(
                  'rounded-pill px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none',
                  active ? 'bg-role-soft text-role-ink' : 'bg-surface-2 text-fg-3',
                )}
              >
                {option.trailing}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
