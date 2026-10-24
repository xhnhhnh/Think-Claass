import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ParentDashboard from './Dashboard';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
  useParentDashboard: vi.fn(),
  useParentBuffMutation: vi.fn(),
  useResolvedClassFeatures: vi.fn(),
  useQuery: vi.fn(),
  useRegisterPageCommands: vi.fn(),
  launchConfetti: vi.fn(),
  navigate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  summaryResult: { current: {} as Record<string, unknown> },
  policyResult: { current: {} as Record<string, unknown> },
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) =>
    selector({ user: { id: 9, role: 'parent', studentId: 6, classId: 3, name: '家长' } }),
}));

vi.mock('@/hooks/queries/useParentDashboard', () => ({
  useParentDashboard: mocks.useParentDashboard,
  useParentBuffMutation: mocks.useParentBuffMutation,
}));

vi.mock('@/features/classroom/hooks/useResolvedClassFeatures', () => ({
  useResolvedClassFeatures: mocks.useResolvedClassFeatures,
}));

vi.mock('@/app/commands/registry', () => ({
  useRegisterPageCommands: mocks.useRegisterPageCommands,
}));

vi.mock('@/lib/confetti', () => ({ launchConfetti: mocks.launchConfetti }));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess, info: mocks.toastInfo },
}));

// The two side queries are mocked by key: the dashboard itself is the query under test.
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));

vi.mock('@/features/classroom/api/studentsApi', () => ({ studentsApi: { getSummary: vi.fn() } }));
vi.mock('@/features/classroom/api/classesApi', () => ({ classroomApi: { getIncentivePolicy: vi.fn() } }));

/**
 * 温馨家园's three distinct states.
 *
 * The defect this pins: a failed dashboard read used to fall through the page's loading guard into the
 * normal render, where the absent data was drawn as 「还没有新的记录哦」 / 「没有进行中的约定」 - a
 * statement about the child, produced by a request that never landed, with no retry.
 */
describe('ParentDashboard', () => {
  const refetchDashboard = vi.fn();
  const castBuff = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.launchConfetti.mockResolvedValue(undefined);
    mocks.useResolvedClassFeatures.mockReturnValue({
      features: { enable_family_tasks: true, enable_parent_buff: true },
      canDecide: true,
    });
    mocks.useParentBuffMutation.mockReturnValue({
      mutateAsync: castBuff,
      isPending: false,
    });
    mocks.useQuery.mockImplementation((options: { queryKey: unknown[] }) =>
      options.queryKey[0] === 'motivation-summary' ? mocks.summaryResult.current : mocks.policyResult.current,
    );
    mocks.summaryResult.current = {
      data: { summary: { parentBlessingActive: false } },
      isLoading: false,
      isError: false,
    };
    mocks.policyResult.current = {
      data: { policy: { parentBonusPercent: 20 } },
      isLoading: false,
      isError: false,
    };
  });

  it('shows an error card with a retry when the dashboard read failed, not the empty states', () => {
    mocks.useParentDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchDashboard,
    });

    render(<ParentDashboard />);

    expect(screen.getByText('孩子的成长数据没有加载出来')).toBeInTheDocument();
    expect(screen.getByText(/这不代表还没有记录/)).toBeInTheDocument();
    expect(screen.queryByText('还没有新的记录哦')).not.toBeInTheDocument();
    expect(screen.queryByText('没有进行中的约定')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(refetchDashboard).toHaveBeenCalledTimes(1);
  });

  it('leaves the blessing failure to the api layer instead of adding a generic network toast', async () => {
    mocks.useParentDashboard.mockReturnValue({
      data: {
        student: { id: 6, name: '小明', total_points: 10, available_points: 10, class_id: 3 },
        records: [],
        tasks: [],
      },
      isLoading: false,
      isError: false,
      refetch: refetchDashboard,
    });
    castBuff.mockRejectedValue(new Error('今日已经施放过祝福了'));

    render(<ParentDashboard />);

    fireEvent.click(screen.getByRole('button', { name: /送上今日祝福/ }));

    await waitFor(() => expect(castBuff).toHaveBeenCalledTimes(1));
    // `@/lib/api` already showed the server's sentence; the page must not replace it with 「网络错误」.
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('does not claim a 0% bonus when the incentive-policy read failed', () => {
    mocks.useParentDashboard.mockReturnValue({
      data: {
        student: { id: 6, name: '小明', total_points: 10, available_points: 10, class_id: 3 },
        records: [],
        tasks: [],
      },
      isLoading: false,
      isError: false,
      refetch: refetchDashboard,
    });
    mocks.policyResult.current = { data: undefined, isLoading: false, isError: true };

    render(<ParentDashboard />);

    const button = screen.getByRole('button', { name: /送上今日祝福/ });
    expect(button).toHaveTextContent('评分加成暂不可用');
    expect(button).not.toHaveTextContent('0%');
  });
});
