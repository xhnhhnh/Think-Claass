import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  useClasses: vi.fn(),
  useTeacherStockMutation: vi.fn(),
  useTeacherStocks: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/hooks/queries/useClasses', () => ({
  useClasses: mocks.useClasses,
}));

vi.mock('../hooks/useEconomy', () => ({
  useTeacherStockMutation: mocks.useTeacherStockMutation,
  useTeacherStocks: mocks.useTeacherStocks,
}));

import TeacherEconomyPage from './TeacherEconomyPage';

describe('TeacherEconomyPage', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.useClasses.mockReturnValue({ data: [{ id: 3, name: '一班' }] });
    mocks.useTeacherStockMutation.mockReturnValue({ mutateAsync: mocks.mutateAsync });
    mocks.useTeacherStocks.mockReturnValue({
      data: [{ id: 9, class_id: 3, name: '课堂之星', symbol: 'STAR', current_price: 100, trend_history: '[80,100]' }],
      isLoading: false,
    });
  });

  it('creates a stock from the add dialog', async () => {
    mocks.mutateAsync.mockResolvedValue({ success: true });
    render(<TeacherEconomyPage />);

    fireEvent.click(screen.getByRole('button', { name: '新增股票' }));
    fireEvent.change(screen.getByLabelText('股票名称'), { target: { value: '阅读之星' } });
    fireEvent.change(screen.getByLabelText('股票代码'), { target: { value: 'read' } });
    fireEvent.change(screen.getByLabelText('当前价格'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        type: 'create',
        data: { class_id: 3, name: '阅读之星', symbol: 'read', current_price: 120 },
      }),
    );
  });

  it('updates and deletes an existing stock', async () => {
    mocks.mutateAsync.mockResolvedValue({ success: true });
    render(<TeacherEconomyPage />);

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('当前价格'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        type: 'update',
        stockId: 9,
        data: { class_id: 3, name: '课堂之星', symbol: 'STAR', current_price: 150 },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '删除课堂之星' }));
    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ type: 'delete', stockId: 9 }));
  });
});
