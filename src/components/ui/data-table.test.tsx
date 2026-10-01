import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTable, type DataTableColumn } from './data-table';
import { EmptyState } from './empty-state';

/**
 * `DataTable`'s four states, and the order they win in.
 *
 * The error state is the one this file was written for: react-query hands a rejected request
 * back as `rows: []`, exactly like an empty one, so the table painted 「暂无数据」 for both
 * until it grew `error`/`onRetry`. The other assertions exist to pin the precedence - a
 * failed read that is still loading must not flash the error, and an ordinary empty list
 * must keep rendering its own `empty` slot.
 */

interface Row {
  id: number;
  name: string;
}

const columns: Array<DataTableColumn<Row>> = [{ key: 'name', header: '名称' }];

describe('DataTable states', () => {
  it('renders the error block instead of the empty state, and retries on demand', () => {
    const onRetry = vi.fn();
    render(
      <DataTable<Row>
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        error
        onRetry={onRetry}
        empty={<EmptyState title="暂无数据" />}
      />,
    );

    expect(screen.getByText('数据加载失败')).toBeInTheDocument();
    expect(screen.getByText('这不代表没有数据，请重试。')).toBeInTheDocument();
    expect(screen.queryByText('暂无数据')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the loading skeleton ahead of the error state', () => {
    render(
      <DataTable<Row> columns={columns} rows={[]} getRowKey={(row) => row.id} isLoading error />,
    );

    expect(document.querySelector('[data-slot="data-table-loading"]')).not.toBeNull();
    expect(screen.queryByText('数据加载失败')).not.toBeInTheDocument();
  });

  it('still renders the empty slot when the request simply returned nothing', () => {
    render(
      <DataTable<Row>
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        empty={<EmptyState title="暂无数据" />}
      />,
    );

    expect(screen.getByText('暂无数据')).toBeInTheDocument();
    expect(screen.queryByText('数据加载失败')).not.toBeInTheDocument();
  });

  it('renders rows through the column contract as before', () => {
    render(
      <DataTable<Row>
        columns={columns}
        rows={[{ id: 1, name: '期末盲盒' }]}
        getRowKey={(row) => row.id}
      />,
    );

    expect(screen.getByText('期末盲盒')).toBeInTheDocument();
  });
});
