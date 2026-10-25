import type { ReactNode } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/**
 * "Start here" guidance for an empty console.
 *
 * A big-company admin product does not greet a fresh install with eight zeroes; it
 * tells the operator what the first three actions are and how far they are. Each step is
 * a real destination, and the completed count is derived, not stored.
 */
export interface OnboardingStep {
  title: ReactNode;
  description: ReactNode;
  done?: boolean;
  action?: ReactNode;
}

export function OnboardingChecklist({
  title,
  description,
  steps,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  steps: OnboardingStep[];
  className?: string;
}) {
  const completed = steps.filter((step) => step.done).length;
  const progress = steps.length === 0 ? 0 : Math.round((completed / steps.length) * 100);

  return (
    <Card data-slot="onboarding-checklist" className={className}>
      <CardHeader className="border-b border-line-1 pb-4">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        <div className="mt-3">
          <Progress label="开始使用进度" value={progress} />
          <p className="mt-1.5 text-caption text-fg-3">
            已完成 {completed} / {steps.length} 步
          </p>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <ol className="space-y-1">
          {steps.map((step, index) => (
            <li
              key={index}
              className={cn(
                'flex flex-col gap-2 rounded-card px-2 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between',
                !step.done && 'hover:bg-surface-3/40',
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 shrink-0">
                  {step.done ? (
                    <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
                  ) : (
                    <Circle aria-hidden="true" className="size-5 text-fg-3" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className={cn('text-body font-semibold', step.done ? 'text-fg-2' : 'text-fg-1')}>
                    {step.title}
                  </div>
                  <p className="mt-0.5 text-body-sm text-fg-3">{step.description}</p>
                </div>
              </div>
              {step.action ? <div className="shrink-0 pl-8 sm:pl-0">{step.action}</div> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default OnboardingChecklist;
