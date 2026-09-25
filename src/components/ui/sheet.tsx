import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A sheet: a panel that comes in from an edge.
 *
 * The kit's `Dialog` is a centred modal, which is right for a form and wrong for
 * everything a phone does. The command palette, the navigation drawer and the
 * page's filter panel are all "pull a surface up from the bottom, drag it back
 * down", and rendering them as a centred box is the single most recognisable
 * difference between a web app and a native one.
 *
 * Built on the same Base UI `Dialog` primitive as `Dialog`, deliberately: it
 * brings the focus trap, the escape binding, the scroll lock, `aria-modal` and
 * the backdrop's click-to-dismiss. A hand-rolled sheet would reimplement four of
 * those and get the fifth wrong - which is what the guided tour documents having
 * decided to do *on purpose* for its own overlay, because a tour step must not
 * trap focus. A sheet that is a menu has no such reason.
 *
 * `side` chooses the edge. On a viewport below `sm` the side sheets become bottom
 * sheets regardless: a left drawer on a 390-pixel screen is a panel that covers
 * the thing it is about to navigate to.
 */

export type SheetSide = 'bottom' | 'left' | 'right' | 'top';

const ENTER: Record<SheetSide, string> = {
  bottom: 'data-[open]:animate-sheet-in',
  top: 'data-[open]:animate-enter-down',
  left: 'data-[open]:animate-rail-in',
  right: 'data-[open]:animate-slide-in-right',
};

const EXIT: Record<SheetSide, string> = {
  bottom: 'data-[closed]:animate-fade-out',
  top: 'data-[closed]:animate-fade-out',
  left: 'data-[closed]:animate-fade-out',
  right: 'data-[closed]:animate-fade-out',
};

const PLACEMENT: Record<SheetSide, string> = {
  // `max-h` rather than `h`: a three-item sheet should not be a full-height panel
  // with two thirds of the screen empty.
  bottom: 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-sheet border-t',
  top: 'inset-x-0 top-0 max-h-[85dvh] rounded-b-sheet border-b',
  left: 'inset-y-0 left-0 h-full w-80 max-w-[85vw] rounded-r-sheet border-r',
  right: 'inset-y-0 right-0 h-full w-80 max-w-[85vw] rounded-l-sheet border-l',
};

export function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

export function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

export function SheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

export interface SheetContentProps extends DialogPrimitive.Popup.Props {
  side?: SheetSide;
  /** Hide the corner close button when the sheet provides its own dismiss affordance. */
  showCloseButton?: boolean;
  /** Accessible name. Required: a sheet is a landmark and an unnamed one is a mystery. */
  title: string;
  /** Hide the visible title but keep it for assistive technology. */
  hideTitle?: boolean;
}

export function SheetContent({
  side = 'bottom',
  className,
  children,
  showCloseButton = true,
  title,
  hideTitle = false,
  ...props
}: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="sheet-overlay"
        className={cn(
          'fixed inset-0 z-50 bg-black/30 duration-fast',
          'data-[open]:animate-fade-in data-[closed]:animate-fade-out',
          'supports-[backdrop-filter]:backdrop-blur-sm',
        )}
      />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'fixed z-50 flex flex-col border-line-1 bg-surface-4 text-fg-1 shadow-floating outline-none',
          PLACEMENT[side],
          ENTER[side],
          EXIT[side],
          // The drag handle: a 4px pill that says "this moves" without a label.
          // Decorative, so it is hidden from the accessibility tree.
          side === 'bottom' &&
            "before:mx-auto before:mt-2 before:block before:h-1 before:w-10 before:shrink-0 before:rounded-pill before:bg-line-strong before:content-['']",
          className,
        )}
        {...props}
      >
        <h2 className={cn('shrink-0 px-4 pt-3 text-sm font-bold text-fg-1', hideTitle && 'sr-only')}>
          {title}
        </h2>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {showCloseButton ? (
          <DialogPrimitive.Close
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-2 top-2"
                aria-label={`关闭${title}`}
              />
            }
          >
            <X aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export default Sheet;
