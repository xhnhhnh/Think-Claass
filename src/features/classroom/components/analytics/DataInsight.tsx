import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Insight tones.
 *
 * Replaces a nine-name colour vocabulary (`blue | indigo | purple | emerald | orange |
 * pink | green | coral | amber`) that named colours instead of meanings - and two of
 * them were not Tailwind colours at all, so every `coral` card rendered with no colour
 * while `green` sat beside `emerald` meaning the same thing. The five tones below are
 * the ones the design system has; `toneForIndex` keeps the original "a different colour
 * per card" intent without letting a caller name a palette.
 */
type InsightTone = 'primary' | 'success' | 'warning' | 'info' | 'destructive';
type InsightSurface = 'glass' | 'paper';

const toneClasses: Record<InsightTone, { icon: string; value: string; bar: string }> = {
  primary: { icon: 'bg-role-soft text-role-ink', value: 'text-role-ink', bar: 'bg-role' },
  success: { icon: 'bg-success-soft text-success-ink', value: 'text-success-ink', bar: 'bg-success' },
  warning: { icon: 'bg-warning-soft text-warning-ink', value: 'text-warning-ink', bar: 'bg-warning' },
  info: { icon: 'bg-info-soft text-info-ink', value: 'text-info-ink', bar: 'bg-info' },
  destructive: { icon: 'bg-danger-soft text-danger-ink', value: 'text-danger-ink', bar: 'bg-danger' },
};

const metricSurfaceClasses: Record<InsightSurface, string> = {
  glass: 'rounded-card border border-line-1 bg-surface-2 p-6',
  paper: 'rounded-card border border-line-1 bg-surface-3/60 p-6',
};

const panelSurfaceClasses: Record<InsightSurface, string> = {
  glass: 'rounded-card border border-line-1 bg-surface-2 p-6',
  paper: 'rounded-card border border-line-1 bg-surface-3/60 p-6',
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
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3', className)}>
      {items.map((item) => (
        <MetricCard key={item.label} item={item} surface={surface} />
      ))}
    </div>
  );
}

function MetricCard({ item, surface }: { item: MetricCardItem; surface: InsightSurface }) {
  const Icon = item.icon;
  const tone = toneClasses[item.tone ?? 'primary'];

  return (
    <div className={cn('flex items-center', metricSurfaceClasses[surface])}>
      <div className={cn('mr-4 flex size-11 shrink-0 items-center justify-center rounded-card', tone.icon)}>
        <Icon aria-hidden="true" className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-caption font-medium text-fg-3">{item.label}</div>
        <div className="flex items-baseline gap-2">
          <div className={cn('text-metric', tone.value)}>{item.value}</div>
          {item.unit ? <span className="text-caption text-fg-3">{item.unit}</span> : null}
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
      <h2 className="mb-5 flex items-center gap-2 text-section-title text-fg-1">
        {Icon ? <Icon aria-hidden="true" className={cn('size-4 text-fg-3', iconClassName)} /> : null}
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
  return (
    <div className="rounded-card border border-dashed border-line-1 bg-surface-3/50 p-6 text-center text-body-sm text-fg-3">
      {text}
    </div>
  );
}

export function HorizontalBarList({
  items,
  unit,
  tone = 'primary',
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
            <div className="truncate text-right text-body-sm font-medium text-fg-2">{item.label}</div>
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn('h-5 rounded-card transition-all duration-500 ease-out', toneClass.bar)}
                style={{ width, minWidth: item.value > 0 ? '2rem' : '0' }}
                aria-label={`${item.label}: ${item.value}${unit ?? ''}`}
              />
              <span className="shrink-0 text-body-sm font-semibold text-fg-1">
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
    <div className="flex flex-col gap-3 text-body-sm text-fg-2">
      {rows.map((row) => (
        <div key={String(row.label)} className="flex items-center justify-between gap-4">
          <span>{row.label}</span>
          <span className={cn('font-semibold text-role-ink', row.valueClassName)}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
