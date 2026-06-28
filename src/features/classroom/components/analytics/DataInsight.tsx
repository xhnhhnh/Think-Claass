import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

type InsightTone = 'blue' | 'indigo' | 'purple' | 'emerald' | 'orange' | 'pink' | 'green' | 'coral' | 'amber';
type InsightSurface = 'glass' | 'paper';

const toneClasses: Record<InsightTone, { icon: string; value: string; bar: string }> = {
  blue: { icon: 'bg-blue-100 text-blue-600', value: 'text-blue-600', bar: 'from-blue-400 to-blue-500' },
  indigo: { icon: 'bg-indigo-100 text-indigo-600', value: 'text-indigo-600', bar: 'from-indigo-400 to-indigo-500' },
  purple: { icon: 'bg-purple-100 text-purple-600', value: 'text-purple-600', bar: 'from-purple-400 to-purple-500' },
  emerald: { icon: 'bg-emerald-100 text-emerald-600', value: 'text-emerald-600', bar: 'from-emerald-400 to-emerald-500' },
  orange: { icon: 'bg-orange-100 text-orange-600', value: 'text-orange-600', bar: 'from-orange-400 to-orange-500' },
  pink: { icon: 'bg-pink-100 text-pink-600', value: 'text-pink-600', bar: 'from-pink-400 to-pink-500' },
  green: { icon: 'bg-green-50 text-green-500', value: 'text-green-500', bar: 'from-green-400 to-green-500' },
  coral: { icon: 'bg-coral-50 text-coral-500', value: 'text-coral-500', bar: 'from-coral-400 to-coral-500' },
  amber: { icon: 'bg-amber-50 text-amber-500', value: 'text-amber-500', bar: 'from-amber-400 to-amber-500' },
};

const metricSurfaceClasses: Record<InsightSurface, string> = {
  glass: 'rounded-2xl border border-white/60 bg-white/80 p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] backdrop-blur-xl',
  paper: 'rounded-[2rem] border border-amber-50 bg-[#fffdfa] p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]',
};

const panelSurfaceClasses: Record<InsightSurface, string> = {
  glass: 'rounded-3xl border border-white/60 bg-white/80 p-8 shadow-[0_2px_12px_rgba(0,0,0,0.03)] backdrop-blur-xl',
  paper: 'rounded-[2rem] border border-amber-50 bg-[#fffdfa] p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)]',
};

export interface MetricCardItem {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  icon: LucideIcon;
  tone?: InsightTone;
}

export function MetricGrid({
  items,
  surface = 'glass',
  className,
}: {
  items: MetricCardItem[];
  surface?: InsightSurface;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3', className)}>
      {items.map((item) => (
        <MetricCard key={item.label} item={item} surface={surface} />
      ))}
    </div>
  );
}

function MetricCard({ item, surface }: { item: MetricCardItem; surface: InsightSurface }) {
  const Icon = item.icon;
  const tone = toneClasses[item.tone ?? 'indigo'];

  return (
    <div className={cn('flex items-center', metricSurfaceClasses[surface])}>
      <div className={cn('mr-4 flex size-12 shrink-0 items-center justify-center rounded-2xl shadow-inner', tone.icon)}>
        <Icon className="size-6" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-500">{item.label}</div>
        <div className="flex items-baseline gap-2">
          <div className={cn('text-2xl font-bold text-slate-800', surface === 'paper' && 'text-4xl', surface === 'paper' && tone.value)}>
            {item.value}
          </div>
          {item.unit ? <span className="font-medium text-stone-400">{item.unit}</span> : null}
        </div>
      </div>
    </div>
  );
}

export function DataPanel({
  title,
  icon: Icon,
  iconClassName,
  surface = 'glass',
  emptyText,
  isEmpty = false,
  className,
  contentClassName,
  children,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  surface?: InsightSurface;
  emptyText?: ReactNode;
  isEmpty?: boolean;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(panelSurfaceClasses[surface], className)}>
      <h2 className="mb-6 flex items-center text-lg font-bold text-slate-800">
        {Icon ? <Icon className={cn('mr-2 size-5', iconClassName)} /> : null}
        {title}
      </h2>
      {isEmpty ? (
        <EmptyData text={emptyText ?? '暂无数据'} />
      ) : (
        <div className={cn('flex flex-col gap-4', contentClassName)}>{children}</div>
      )}
    </section>
  );
}

export function EmptyData({ text }: { text: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-6 text-center text-sm text-slate-500">{text}</div>;
}

export function HorizontalBarList({
  items,
  unit,
  tone = 'green',
}: {
  items: Array<{ label: string; value: number }>;
  unit?: ReactNode;
  tone?: InsightTone;
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);
  const toneClass = toneClasses[tone];

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => {
        const width = `${(item.value / maxValue) * 100}%`;

        return (
          <div key={item.label} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3">
            <div className="truncate text-right text-sm font-medium text-slate-600">{item.label}</div>
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn('h-6 rounded-2xl bg-gradient-to-r shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-500 ease-out', toneClass.bar)}
                style={{ width, minWidth: item.value > 0 ? '2rem' : '0' }}
                aria-label={`${item.label}: ${item.value}${unit ?? ''}`}
              />
              <span className="shrink-0 text-sm font-bold text-slate-700">
                {item.value} {unit}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DataList<T>({
  items,
  getKey,
  renderItem,
  className,
}: {
  items: T[];
  getKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
}) {
  return <div className={cn('flex flex-col gap-4', className)}>{items.map((item, index) => <div key={getKey(item, index)}>{renderItem(item, index)}</div>)}</div>;
}

export function KeyValueRows({
  rows,
}: {
  rows: Array<{ label: ReactNode; value: ReactNode; valueClassName?: string }>;
}) {
  return (
    <div className="flex flex-col gap-3 text-stone-600">
      {rows.map((row) => (
        <div key={String(row.label)} className="flex items-center justify-between gap-4">
          <span>{row.label}</span>
          <span className={cn('font-bold text-indigo-600', row.valueClassName)}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

