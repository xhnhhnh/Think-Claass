import { type VariantProps } from 'class-variance-authority';
import { Compass } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/buttonVariants';

import { requestReplay } from './startupGuideStore';

/**
 * The one control that starts the tour again.
 *
 * Two surfaces place it - the 「新手教程」 card on the settings page and the profile block in the
 * application shell - and both are the same button rather than two calls to `requestReplay()` with
 * their own labels, because the label is the part a reader looks for. "重新开始引导" in one place and
 * something similar in another is how a feature becomes hard to find.
 *
 * Its props are the kit's own variant and size types rather than a hand-written union, so a change
 * to `buttonVariants` cannot leave this component offering a variant that no longer exists.
 *
 * No `useStore` here: the tour reads the account when it opens, so this control does not need to
 * know whose account it is - which also keeps it renderable from a test that mocks the store with a
 * different shape.
 */
export interface RestartGuideButtonProps extends VariantProps<typeof buttonVariants> {
  className?: string;
}

export function RestartGuideButton({ variant = 'outline', size, className }: RestartGuideButtonProps) {
  return (
    <Button type="button" variant={variant} size={size} onClick={requestReplay} className={className}>
      <Compass data-icon="inline-start" />
      重新开始引导
    </Button>
  );
}

export default RestartGuideButton;
