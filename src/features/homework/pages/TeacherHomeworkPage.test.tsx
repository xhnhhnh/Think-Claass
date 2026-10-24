/**
 * 作业管理 - the submission counts column.
 *
 * `useHomeworkSubmissionCounts` reads one grade sheet per homework. While it is pending, or after it
 * failed, the page used to print 待批改 0 and 「已提交 0 / 应交 0」 for every row: a claim the page did
 * not have. It must say unknown (— / "读取失败") instead, and offer a retry.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherHomework from '@/features/homework/pages/TeacherHomeworkPage';

const mocks = vi.hoisted(() => ({
  useClasses: vi.fn(),
  useHomeworkList: vi.fn(),
  useHomeworkSubmissionCounts: vi.fn(),
  usePublishHomeworkMutation: vi.fn(),
  useUpdateHomeworkMutation: vi.fn(),
  useDeleteHomeworkMutation: vi.fn(),
  useHomeworkDetail: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) => selector({ user: { id: 7, role: 'teacher', class_id: null } }),
}));

vi.mock('@/app/commands/registry', () => ({ useRegisterPageCommands: vi.fn() }));

vi.mock('@/hooks/queries/useClasses', () => ({ useClasses: mocks.useClasses }));

vi.mock('@/features/homework/hooks/useHomework', () => ({
  useHomeworkList: mocks.useHomeworkList,
  useHomeworkSubmissionCounts: mocks.useHomeworkSubmissionCounts,
  usePublishHomeworkMutation: mocks.usePublishHomeworkMutation,
  useUpdateHomeworkMutation: mocks.useUpdateHomeworkMutation,
  useDeleteHomeworkMutation: mocks.useDeleteHomeworkMutation,
  useHomeworkDetail: mocks.useHomeworkDetail,
}));

vi.mock('../components/AiQuestionPanel', () => ({ AiQuestionPanel: () => null }));
vi.mock('../components/QuestionEditor', () => ({ QuestionEditor: () => null }));

const homework = {
  id: 3,
  class_id: 1,
  title: '第三章分数练习',
  description: null,
  due_at: null,
  status: 'published',
  reward_points: 0,
  question_count: 0,
  total_points: 100,
  legacy: false,
};

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TeacherHomework />
    </QueryClientProvider>,
  );
}

describe('TeacherHomework submission counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useClasses.mockReturnValue({ data: [{ id: 1, name: '一班' }], isLoading: false });
    mocks.useHomeworkList.mockReturnValue({ data: [homework], isLoading: false, isError: false, refetch: vi.fn() });
    mocks.usePublishHomeworkMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.useUpdateHomeworkMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.useDeleteHomeworkMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.useHomeworkDetail.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('shows unknown instead of zero while the counts are still loading', () => {
    mocks.useHomeworkSubmissionCounts.mockReturnValue({ data: {}, isLoading: true, isError: false, refetch: vi.fn() });

    renderPage();

    // The 待批改 stat is unknown and the row says it is reading, not that nobody submitted.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('正在读取提交进度…')).toBeInTheDocument();
    expect(screen.queryByText(/已提交 0 \/ 应交 0/)).not.toBeInTheDocument();
  });

  it('reports a failed counts read and retries it', () => {
    const refetch = vi.fn();
    mocks.useHomeworkSubmissionCounts.mockReturnValue({ data: {}, isLoading: false, isError: true, refetch });

    renderPage();

    expect(screen.getByText('提交进度读取失败（不代表没人提交）')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/已提交 0 \/ 应交 0/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '提交数据读取失败，点此重试' }));
    expect(refetch).toHaveBeenCalled();
  });
});
