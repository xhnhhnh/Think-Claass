import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  useTeacherBlindBoxMutation: vi.fn(),
  useTeacherBlindBoxes: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/hooks/queries/useTeacherShop', () => ({
  useTeacherBlindBoxMutation: mocks.useTeacherBlindBoxMutation,
  useTeacherBlindBoxes: mocks.useTeacherBlindBoxes,
}));

import TeacherBlindBox from './BlindBox';

describe('TeacherBlindBox', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.useTeacherBlindBoxMutation.mockReturnValue({ mutateAsync: mocks.mutateAsync });
    mocks.useTeacherBlindBoxes.mockReturnValue({
      data: [{ id: 5, name: '期末盲盒', description: '惊喜奖励', price: 80, is_active: 1 }],
      isLoading: false,
    });
  });

  it('toggles a blind box active state', async () => {
    mocks.mutateAsync.mockResolvedValue({ success: true });
    render(<TeacherBlindBox />);

    fireEvent.click(screen.getByRole('button', { name: '下架期末盲盒' }));

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        type: 'toggle',
        box: { id: 5, name: '期末盲盒', description: '惊喜奖励', price: 80, is_active: 1 },
      }),
    );
  });

  it('updates a blind box from the edit modal', async () => {
    mocks.mutateAsync.mockResolvedValue({ success: true });
    render(<TeacherBlindBox />);

    fireEvent.click(screen.getByRole('button', { name: '编辑期末盲盒' }));
    fireEvent.change(screen.getByLabelText('兑换价格 (积分)'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        type: 'update',
        boxId: 5,
        data: {
          name: '期末盲盒',
          description: '惊喜奖励',
          price: 90,
          is_active: true,
        },
      }),
    );
  });

  it('deletes a blind box after confirmation', async () => {
    mocks.mutateAsync.mockResolvedValue({ success: true });
    render(<TeacherBlindBox />);

    fireEvent.click(screen.getByRole('button', { name: '删除期末盲盒' }));
    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ type: 'delete', boxId: 5 }));
  });
});

