import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './alert-dialog';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';

/**
 * The kit components that carry behaviour or a contract.
 *
 * `ConfirmDialog` is the one that matters most: it is what the 14 blocking
 * `confirm()` calls in the pages become, so its buttons have to be reachable by
 * name (`删除` / `取消`) and its callback has to actually run.
 */

describe('ConfirmDialog', () => {
  it('runs the confirmation and reports the label the caller asked for', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="确认删除"
        description="确定要删除“期末盲盒”吗？"
        confirmLabel="删除"
        cancelLabel="取消"
        destructive
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('确认删除')).toBeInTheDocument();
    expect(screen.getByText('确定要删除“期末盲盒”吗？')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes instead of confirming when the cancel action is used', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="确认删除"
        confirmLabel="删除"
        cancelLabel="取消"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the pending label and refuses a second confirmation while working', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="确认删除"
        confirmLabel="删除"
        pendingLabel="删除中..."
        isPending
        onConfirm={onConfirm}
      />,
    );

    const pending = screen.getByRole('button', { name: '删除中...' });
    expect(pending).toBeDisabled();

    fireEvent.click(pending);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    render(
      <ConfirmDialog open={false} onOpenChange={() => {}} title="确认删除" onConfirm={() => {}} />,
    );

    expect(screen.queryByText('确认删除')).not.toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders the caller copy and its action', () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="暂无盲盒"
        description="快去上架一个吧"
        action={<button onClick={onClick}>上架新盲盒</button>}
      />,
    );

    expect(screen.getByText('暂无盲盒')).toBeInTheDocument();
    expect(screen.getByText('快去上架一个吧')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '上架新盲盒' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders with a title alone', () => {
    render(<EmptyState title="暂无数据" />);

    expect(screen.getByText('暂无数据')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('renders an h2 - the shell already owns the page h1 - with its actions', () => {
    render(
      <PageHeader
        title="股票管理"
        description="为当前班级创建股票"
        actions={<button>新增股票</button>}
      />,
    );

    const heading = screen.getByRole('heading', { level: 2, name: '股票管理' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText('为当前班级创建股票')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增股票' })).toBeInTheDocument();
  });
});
