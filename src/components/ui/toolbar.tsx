import type { ReactNode } from 'react';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * The row above a list: search, filters, actions.
 *
 * The admin list pages each arranged their own header row, and their search fields
 * were three different widths with three different focus styles. The search input
 * gets an accessible name from `searchLabel` rather than a placeholder alone, so a
 * test (or a screen reader) can find it without depending on the copy.
 */
export interface ToolbarProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  searchLabel?: string;
  /** Selects, segmented controls, date pickers. */
  filters?: ReactNode;
  /** Buttons, usually on the right. */
  actions?: ReactNode;
  className?: string;
}

export function Toolbar({ search, searchLabel = '搜索', filters, actions, className }: ToolbarProps) {
  return (
    <div
      data-slot="toolbar"
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}
    >
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        {search ? (
          <div className={cn('relative w-full', filters ? 'sm:max-w-xs' : 'sm:max-w-sm')}>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
            />
            <Input
              type="search"
              aria-label={searchLabel}
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder ?? '搜索'}
              className="pl-9"
            />
          </div>
        ) : null}
        {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
