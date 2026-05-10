import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  useTeacherAuctionMutation: vi.fn(),
  useTeacherAuctions: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/hooks/queries/useTeacherShop', () => ({
  useTeacherAuctionMutation: mocks.useTeacherAuctionMutation,
  useTeacherAuctions: mocks.useTeacherAuctions,
}));

import TeacherAuction from './Auction';

describe('TeacherAuction', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.useTeacherAuctionMutation.mockReturnValue({ mutateAsync: mocks.mutateAsync });
    mocks.useTeacherAuctions.mockReturnValue({ data: [], isLoading: false });
  });

  it('creates an auction from the add modal', async () => {
    mocks.mutateAsync.mockResolvedValue({ success: true });
    render(<TeacherAuction />);

    fireEvent.click(screen.getByRole('button', { name: '发布拍品' }));
    fireEvent.change(screen.getByLabelText('拍品名称'), { target: { value: '校长合影体验券' } });
    fireEvent.change(screen.getByLabelText('拍品描述'), { target: { value: '稀有奖励' } });
    fireEvent.change(screen.getByLabelText('起拍价'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('截标时间'), { target: { value: '2026-05-04T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        type: 'create',
        data: {
          item_name: '校长合影体验券',
          description: '稀有奖励',
          starting_price: 120,
          end_time: '2026-05-04T10:00',
          status: 'active',
        },
      }),
    );
  });
});

