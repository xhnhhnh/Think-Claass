import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuctions: vi.fn(),
  getStudents: vi.fn(),
  bidAuction: vi.fn(),
  toastError: vi.fn(),
  // One stable object: the page's effect keys off `user` and creates a new auctions array on
  // every fetch, so a fresh user per render would make mount -> fetch -> render -> effect loop.
  user: { id: 5, role: 'student', studentId: 101 },
}));

vi.mock('@/features/marketplace/api/shopApi', () => ({
  shopApi: { getAuctions: mocks.getAuctions, bidAuction: mocks.bidAuction },
}));

vi.mock('@/features/classroom/api/studentsApi', () => ({
  studentsApi: { getStudents: mocks.getStudents },
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) => selector({ user: mocks.user }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: mocks.toastError, warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/confetti', () => ({ launchConfetti: vi.fn() }));

import StudentAuctionPage from './StudentAuctionPage';

/**
 * 拍卖行 - the server's refusal is the sentence the pupil needs.
 *
 * `success: false` never reaches the page (the api layer throws), so the page's `else` branch was
 * dead and the catch reported 「网络错误」 for a refusal that actually said 已结束 / 已被抢先 /
 * 积分不足. The test pins that the page no longer invents its own reason.
 */
describe('StudentAuctionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuctions.mockResolvedValue({
      success: true,
      auctions: [
        {
          id: 7,
          item_name: '限量徽章',
          description: '稀有',
          status: 'active',
          current_price: 10,
          starting_price: 5,
          end_time: new Date(Date.now() + 3_600_000).toISOString(),
          highest_bidder_id: null,
        },
      ],
    });
    mocks.getStudents.mockResolvedValue({
      success: true,
      students: [{ id: 101, available_points: 100 }],
    });
    mocks.bidAuction.mockResolvedValue({ success: true });
  });

  it('does not report a refused bid as 网络错误', async () => {
    mocks.bidAuction.mockRejectedValueOnce(new Error('Not enough points'));

    render(<StudentAuctionPage />);

    fireEvent.click(await screen.findByRole('button', { name: '参与竞拍' }));

    await waitFor(() => expect(mocks.bidAuction).toHaveBeenCalledWith(7, { studentId: 101, bid_amount: 20 }));
    expect(mocks.toastError).not.toHaveBeenCalledWith('网络错误');
  });
});
