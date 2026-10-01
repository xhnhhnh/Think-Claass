import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SkeletonList } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Tabular data, with its loading, error and empty states attached.
 *
 * The admin console has seven hand-written `<table>` blocks, each with its own
 * thead styling, its own "加载中..." row and its own "暂无数据" row - and three
 * different answers to what to show when the request is still in flight. This owns
 * all of those states so a page describes its columns and its rows, and nothing else.
 *
 * `error` is the one that used to be missing everywhere: react-query hands back
 * `rows: []` for a rejected request just as it does for an empty one, so every caller
 * that only drew `empty` told the reader 「暂无数据」 about a request that never
 * arrived. Pass `error={isError}` and `onRetry={() => void refetch()}`.
 *
 * `render` is optional: without it a cell reads `row[key]`, which covers the majority
 * of the admin columns (ids, names, timestamps) without a function per column.
 */
export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  headerClassName?: string;
}

const ALIGN = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  getRowKey: (row: T, index: number) => string | number;
  isLoading?: boolean;
  /** Placeholder row count while loading. */
  loadingRows?: number;
  /** Rendered when there are no rows. Pass an `EmptyState`. */
  empty?: ReactNode;
  /**
   * The request failed. Wins over `empty`, because "0 rows" and "we could not ask"
   * are different answers and the table used to give the first one for both: a failed
   * read arrived with `rows: []` and painted 「暂无数据」, which reads as a fact.
   *
   * A page that renders this itself (rather than through the table) is responsible for
   * the same distinction; the admin console pages hand both flags to this component.
   */
  error?: boolean;
  /** Wired to the failed query's `refetch`. Omitted, the error block carries no button. */
  onRetry?: () => void;
  caption?: ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  isLoading = false,
  loadingRows = 5,
  empty,
  error = false,
  onRetry,
  caption,
  onRowClick,
  rowClassName,
  className,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div data-slot="data-table-loading" className={cn('space-y-2', className)}>
        <SkeletonList count={loadingRows} itemClassName="h-11" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        data-slot="data-table-error"
        className={cn(
          'rounded-panel border border-danger/20 bg-danger/10 px-6 py-10 text-center',
          className,
        )}
      >
        <p className="font-semibold text-danger">数据加载失败</p>
        <p className="mt-1 text-sm text-fg-3">这不代表没有数据，请重试。</p>
        {onRetry ? (
          <Button variant="outline" className="mt-3" onClick={onRetry}>
            重新加载
          </Button>
        ) : null}
      </div>
    );
  }

  if (rows.length === 0) {
    return <div data-slot="data-table-empty">{empty}</div>;
  }

  return (
    <Table className={className}>
      {caption ? <TableCaption>{caption}</TableCaption> : null}
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead
              key={column.key}
              className={cn(column.align ? ALIGN[column.align] : undefined, column.headerClassName)}
            >
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow
            key={getRowKey(row, index)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
          >
            {columns.map((column) => (
              <TableCell
                key={column.key}
                className={cn(column.align ? ALIGN[column.align] : undefined, column.className)}
              >
                {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '')}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
