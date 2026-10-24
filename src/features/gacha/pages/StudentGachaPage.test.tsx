import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useGachaPools: vi.fn(),
  useGachaDrawMutation: vi.fn(),
  draw: vi.fn(),
  refetchPools: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/gacha/hooks/useGacha', () => ({
  useGachaPools: mocks.useGachaPools,
  useGachaDrawMutation: mocks.useGachaDrawMutation,
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 5, role: 'student', studentId: 101, class_id: 1 } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: mocks.toastError, warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/confetti', () => ({ launchConfetti: vi.fn() }));

import StudentGachaPage from './StudentGachaPage';

function pool() {
  return { id: 2, name: '群星卡池', cost_points: 10, ssr_rate: 0.02, sr_rate: 0.1, r_rate: 0.88 };
}

function renderPage() {
  return render(<StudentGachaPage />);
}

/**
 * 召唤法阵 - a broken read must not look like an empty stage.
 *
 * The page destructured only `data`/`isLoading`, so a failed pools request rendered the starfield
 * with no cards, no explanation and no retry. It now separates error, empty and loaded.
 */
describe('StudentGachaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useGachaPools.mockReturnValue({
      data: [pool()],
      isLoading: false,
      isError: false,
      refetch: mocks.refetchPools,
    });
    mocks.useGachaDrawMutation.mockReturnValue({ mutateAsync: mocks.draw, isPending: false });
    mocks.draw.mockResolvedValue({ success: true, data: { results: [] } });
  });

  it('shows a retryable error instead of an empty starfield when the read failed', () => {
    mocks.useGachaPools.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      refetch: mocks.refetchPools,
    });

    renderPage();

    expect(screen.getByText('召唤卡池没有加载出来')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(mocks.refetchPools).toHaveBeenCalled();
  });

  it('says the shelves are empty when the read succeeded with no pools', () => {
    mocks.useGachaPools.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mocks.refetchPools,
    });

    renderPage();

    expect(screen.getByText('还没有可召唤的卡池')).toBeInTheDocument();
    expect(screen.queryByText('召唤卡池没有加载出来')).not.toBeInTheDocument();
  });

  it('does not report a refused draw as 网络错误', async () => {
    mocks.draw.mockRejectedValueOnce(new Error('Not enough points'));

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /单次召唤/ }));

    await waitFor(() => expect(mocks.draw).toHaveBeenCalledWith({ poolId: 2, times: 1 }));
    expect(mocks.toastError).not.toHaveBeenCalledWith('网络错误');
  });
});
