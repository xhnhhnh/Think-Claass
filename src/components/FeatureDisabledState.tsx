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
      <div className="max-w-md rounded-3xl border border-slate-200 bg-white/90 p-8 text-center shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Ban className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
        {actionLabel && onAction ? (
          <button
            onClick={onAction}
            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            {actionLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
