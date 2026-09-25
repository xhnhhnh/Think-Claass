import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A keyboard key.
 *
 * Rendered as `<kbd>` rather than a styled span because that is what the
 * element is for, and because a screen reader announces it as a key rather
 * than reading "command K" as prose.
 *
 * The platform hint is a prop rather than a `navigator.platform` sniff inside
 * the component: a value read during render is a value that disagrees between
 * the server render and the client one, and this app has enough call sites for
 * that to matter. Callers use `useIsApplePlatform()` once.
 */
const Kbd = React.forwardRef<HTMLElement, React.ComponentProps<'kbd'>>(function Kbd(
  { className, ...props },
  ref,
) {
  return (
    <kbd
      ref={ref}
      data-slot="kbd"
      className={cn(
        'inline-flex h-5 min-w-5 select-none items-center justify-center rounded-xs border border-line-1 bg-surface-3 px-1.5',
        'font-sans text-[0.6875rem] font-semibold leading-none text-fg-3 shadow-[inset_0_-1px_0_hsl(var(--line-1))]',
        className,
      )}
      {...props}
    />
  );
});

/**
 * The shortcut hint for the command palette, as the reader's platform spells it.
 *
 * `⌘K` on Apple hardware and `Ctrl K` everywhere else. Included here rather
 * than in the palette so the rail, the mobile bar and the palette itself cannot
 * disagree about what to tell the reader to press.
 */
export function CommandHint({ className }: { className?: string }) {
  const isApple = useIsApplePlatform();

  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <Kbd>{isApple ? '⌘' : 'Ctrl'}</Kbd>
      <Kbd>K</Kbd>
    </span>
  );
}

/**
 * Whether this is an Apple-platform browser.
 *
 * Reads `navigator.userAgentData.platform` when available and falls back to
 * `navigator.platform`; both are deprecated individually, and the pair covers
 * what is actually deployed. Guarded for the test environment, where neither
 * exists and the Windows form is the honest default.
 */
export function useIsApplePlatform(): boolean {
  return React.useMemo(() => {
    if (typeof navigator === 'undefined') return false;

    const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    const platform = uaData?.platform ?? navigator.platform ?? '';
    return /mac|iphone|ipad|ipod/i.test(platform);
  }, []);
}

export { Kbd };
