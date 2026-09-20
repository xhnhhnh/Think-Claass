import { ArrowRight, Ban } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Shown when a class feature is switched off but the route was still reachable.
 *
 * Composed from the kit (`EmptyState` + `Button`) rather than a hand-styled card
 * with its own `border-[var(--campus-border)]`, its own amber colour pair and its
 * own raw `<button>`.
 */
export default function FeatureDisabledState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="w-full max-w-md">
        <EmptyState
          icon={Ban}
          title={<span className="text-base font-bold text-ink-1">{title}</span>}
          description={<span className="leading-6">{description}</span>}
          action={
            actionLabel && onAction ? (
              <Button type="button" className="mt-1" onClick={onAction}>
                {actionLabel}
                <ArrowRight data-icon="inline-end" />
              </Button>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
