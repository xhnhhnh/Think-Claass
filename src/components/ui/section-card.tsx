import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * A titled block of content.
 *
 * The settings, website and open-api pages are stacks of these, and each one used to
 * be a hand-built `bg-white rounded-xl border p-6` box with its own heading size. The
 * `actions` slot is what makes it usable for a settings section with a save button.
 */
export interface SectionCardProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card data-slot="section-card" className={cn('gap-4', className)}>
      <CardHeader className={cn('border-b border-border pb-4', actions && 'flex-row items-center justify-between')}>
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
