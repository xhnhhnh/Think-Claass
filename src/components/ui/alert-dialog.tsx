import type { ReactNode } from 'react';
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Alert dialog, and the confirm dialog built on it.
 *
 * `ConfirmDialog` is what replaces the 14 blocking `confirm()` / `prompt()` calls in
 * the pages. Those cannot be styled, cannot be translated, cannot be tested (jsdom
 * does not implement them, so the tests stub `window.confirm`), and on a tablet in
 * a classroom they are the browser's own modal in the middle of the app's flow.
 *
 * AlertDialog rather than Dialog: the primitive gives the popup `role="alertdialog"`
 * and moves focus to the least destructive action, which is the correct behaviour
 * for a confirmation and not something to re-implement by hand.
 */
export const AlertDialog = {
  Root: AlertDialogPrimitive.Root,
  Trigger: AlertDialogPrimitive.Trigger,
  Portal: AlertDialogPrimitive.Portal,
  Backdrop: AlertDialogPrimitive.Backdrop,
  Popup: AlertDialogPrimitive.Popup,
  Title: AlertDialogPrimitive.Title,
  Description: AlertDialogPrimitive.Description,
  Close: AlertDialogPrimitive.Close,
};

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  /** Shown on the confirm button while `isPending`. */
  pendingLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for a deletion. */
  destructive?: boolean;
  isPending?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = '确定',
  pendingLabel,
  cancelLabel = '取消',
  destructive = false,
  isPending = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Backdrop
          data-slot="confirm-dialog-backdrop"
          className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-[backdrop-filter]:backdrop-blur-sm data-[open]:animate-fade-in data-[closed]:animate-fade-out"
        />
        <AlertDialogPrimitive.Popup
          data-slot="confirm-dialog-popup"
          className={cn(
            'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm',
            'data-[open]:animate-zoom-in data-[closed]:animate-zoom-out',
          )}
        >
          <div className="flex flex-col gap-2">
            <AlertDialogPrimitive.Title className="font-heading text-base leading-none font-medium">
              {title}
            </AlertDialogPrimitive.Title>
            {description ? (
              <AlertDialogPrimitive.Description className="text-sm text-muted-foreground">
                {description}
              </AlertDialogPrimitive.Description>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Close
              render={<Button variant="outline" />}
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </AlertDialogPrimitive.Close>
            <Button
              type="button"
              variant={destructive ? 'destructive' : 'default'}
              disabled={isPending}
              onClick={() => void onConfirm()}
            >
              {isPending ? (pendingLabel ?? confirmLabel) : confirmLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
