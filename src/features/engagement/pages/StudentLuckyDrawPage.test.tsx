import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useLuckyDrawConfig: vi.fn(),
  useLuckyDrawMutation: vi.fn(),
  getStudents: vi.fn(),
  getSummary: vi.fn(),
  getClasses: vi.fn(),
  draw: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/queries/useLuckyDraw', () => ({
  useLuckyDrawConfig: mocks.useLuckyDrawConfig,
  useLuckyDrawMutation: mocks.useLuckyDrawMutation,
}));

vi.mock('@/features/classroom/api/studentsApi', () => ({
  studentsApi: { getStudents: mocks.getStudents, getSummary: mocks.getSummary },
}));

vi.mock('@/features/classroom/api/classesApi', () => ({
  teacherApi: { getClasses: mocks.getClasses },
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 5, role: 'student', studentId: 101 } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: mocks.toastError, warning: vi.fn(), info: vi.fn() },
}));

import StudentLuckyDrawPage from './StudentLuckyDrawPage';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StudentLuckyDrawPage />
    </QueryClientProvider>,
  );
}

/**
 * 幸运翻牌 - the balance has to be the live one.
 *
 * `available_points` came from `['students']`, which nothing invalidates after a draw. The card
 * kept the old number and the draw guard kept letting the pupil press, only for the server to
 * refuse; and a failed balance read collapsed to 0. It now reads the shell's
 * `['motivation-summary']` query and stays disabled until that answer exists.
 */
describe('StudentLuckyDrawPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStudents.mockResolvedValue({
      success: true,
      // A stale list row: it says 999, the live summary says 5.
      students: [{ id: 101, class_id: 1, available_points: 999 }],
    });
    mocks.getClasses.mockResolvedValue({ success: true, classes: [{ id: 1, teacher_id: 7 }] });
    mocks.getSummary.mockResolvedValue({
      success: true,
      summary: { studentId: 101, availableCredits: 5 },
    });
    mocks.useLuckyDrawConfig.mockReturnValue({
      data: { configs: [{ prize_name: '贴纸', prize_type: 'POINTS', prize_value: 1 }], cost_points: 10 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useLuckyDrawMutation.mockReturnValue({ mutateAsync: mocks.draw, isPending: false });
  });

  /** The cards start `aria-disabled` until the balance query answers; wait for that. */
  async function waitForBalance() {
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '翻开第 1 张牌' })).toHaveAttribute(
        'aria-disabled',
        'false',
      ),
    );
  }

  it('uses the live balance for the affordability guard, not the stale student row', async () => {
    renderPage();

    // Wait for the summary query to settle, then press a card.
    await waitForBalance();
    fireEvent.click(screen.getByRole('button', { name: '翻开第 1 张牌' }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('积分不足'));
    expect(mocks.draw).not.toHaveBeenCalled();
  });

  it('offers a retry when the balance read fails instead of treating it as zero', async () => {
    mocks.getSummary.mockRejectedValueOnce(new Error('offline'));

    renderPage();

    expect(await screen.findByText('积分余额没有加载出来')).toBeInTheDocument();
    expect(screen.queryByText('积分不足')).not.toBeInTheDocument();

    mocks.getSummary.mockResolvedValue({
      success: true,
      summary: { studentId: 101, availableCredits: 100 },
    });
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));

    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(2));
  });

  it('leaves a refused draw to the api layer instead of claiming 网络错误', async () => {
    mocks.getSummary.mockResolvedValue({
      success: true,
      summary: { studentId: 101, availableCredits: 100 },
    });
    mocks.draw.mockRejectedValueOnce(new Error('No active lucky draw config'));

    renderPage();
    await waitForBalance();
    fireEvent.click(screen.getByRole('button', { name: '翻开第 1 张牌' }));

    await waitFor(() => expect(mocks.draw).toHaveBeenCalled());
    expect(mocks.toastError).not.toHaveBeenCalledWith('网络错误');
  });
});
