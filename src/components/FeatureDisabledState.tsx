import { Ban, ArrowRight } from 'lucide-react';

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
      <div className="max-w-md rounded-lg border border-[var(--campus-border)] bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <Ban className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
        {actionLabel && onAction ? (
          <button
            onClick={onAction}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {actionLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
