import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherTeamQuests from './TeamQuests';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
  useTeamQuests: vi.fn(),
  useTeamQuestGroupProgress: vi.fn(),
  createTeamQuest: vi.fn(),
  deleteTeamQuest: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

vi.mock('@/hooks/queries/useTeamQuests', () => ({
  useTeamQuests: mocks.useTeamQuests,
  useTeamQuestGroupProgress: mocks.useTeamQuestGroupProgress,
}));

vi.mock('@/api/teamQuests', () => ({
  teamQuestsApi: {
    createTeamQuest: mocks.createTeamQuest,
    deleteTeamQuest: mocks.deleteTeamQuest,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('TeacherTeamQuests', () => {
  beforeEach(() => {
    mocks.useStore.mockImplementation((selector: any) =>
      selector({ user: { id: 9, class_id: 1 } }),
    );
    mocks.useTeamQuests.mockReturnValue({
      data: [
        {
          id: 1,
          class_id: 1,
          teacher_id: 9,
          title: '阅读挑战',
          description: '每组完成阅读目标',
          target_score: 10,
          reward_points: 50,
          start_date: null,
          end_date: null,
          status: 'active',
          created_at: '2026-04-11T00:00:00.000Z',
        },
      ],
      isLoading: false,
      error: null,
    });
    mocks.useTeamQuestGroupProgress.mockReturnValue({
      data: [{ group_id: 1, group_name: '第一组', contribution_score: 6, target_score: 10 }],
      isLoading: false,
    });
    mocks.createTeamQuest.mockReset();
    mocks.deleteTeamQuest.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  const renderPage = () => {
    const queryClient = new QueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <TeacherTeamQuests />
      </QueryClientProvider>,
    );
  };

  it('creates a real team quest payload through the API layer', async () => {
    mocks.createTeamQuest.mockResolvedValue({ success: true, id: 2 });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '发布团队任务' }));
    fireEvent.change(screen.getByPlaceholderText('例如：书香班级挑战'), {
      target: { value: '协作阅读' },
    });
    fireEvent.change(screen.getByPlaceholderText('说明任务内容...'), {
      target: { value: '每组共同完成阅读与分享' },
    });
    fireEvent.change(screen.getByPlaceholderText('例如: 10'), {
      target: { value: '12' },
    });
    fireEvent.change(screen.getByPlaceholderText('例如: 50'), {
      target: { value: '80' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认发布' }));

    await waitFor(() => {
      expect(mocks.createTeamQuest).toHaveBeenCalledWith(
        {
          class_id: 1,
          teacher_id: 9,
          title: '协作阅读',
          description: '每组共同完成阅读与分享',
          target_score: 12,
          reward_points: 80,
        },
        expect.anything(),
      );
    });
  });

  it('shows group progress from the aggregated backend response', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '查看各组进度' }));

    expect(await screen.findByText('第一组')).toBeInTheDocument();
    expect(screen.getByText('6 / 10')).toBeInTheDocument();
  });
});
