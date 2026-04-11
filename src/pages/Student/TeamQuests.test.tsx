import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StudentTeamQuests from './TeamQuests';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
  useStudentCurrentTeamQuest: vi.fn(),
  submitPeerReview: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

vi.mock('@/hooks/queries/useTeamQuests', () => ({
  useStudentCurrentTeamQuest: mocks.useStudentCurrentTeamQuest,
}));

vi.mock('@/api/teamQuests', () => ({
  teamQuestsApi: {
    submitPeerReview: mocks.submitPeerReview,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('StudentTeamQuests', () => {
  beforeEach(() => {
    mocks.useStore.mockImplementation((selector: any) =>
      selector({ user: { studentId: 3, name: '我' } }),
    );
    mocks.useStudentCurrentTeamQuest.mockReturnValue({
      data: {
        success: true,
        quest: {
          id: 5,
          class_id: 1,
          teacher_id: 9,
          title: '协作挑战',
          description: '一起完成主题项目',
          target_score: 10,
          reward_points: 30,
          start_date: null,
          end_date: '2026-04-30',
          status: 'active',
          created_at: '2026-04-11T00:00:00.000Z',
        },
        team: {
          class_id: 1,
          group_id: 2,
          members: [
            { id: 1, name: '张明' },
            { id: 2, name: '李华' },
            { id: 3, name: '我' },
          ],
        },
        progress: {
          my_contribution_score: 4,
          team_contribution_score: 7,
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
    mocks.submitPeerReview.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  const renderPage = () => {
    const queryClient = new QueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <StudentTeamQuests />
      </QueryClientProvider>,
    );
  };

  it('submits peer reviews for each teammate with the current team quest id', async () => {
    mocks.submitPeerReview.mockResolvedValue({ success: true, id: 1 });

    renderPage();

    const firstCard = (screen.getAllByText('张明')[0].closest('div[class*="rounded"]') ?? screen.getAllByText('张明')[0].parentElement) as HTMLElement;
    const secondCard = (screen.getAllByText('李华')[0].closest('div[class*="rounded"]') ?? screen.getAllByText('李华')[0].parentElement) as HTMLElement;

    fireEvent.click(within(firstCard).getAllByRole('button')[3]);
    fireEvent.click(within(secondCard).getAllByRole('button')[4]);

    fireEvent.click(screen.getByRole('button', { name: '提交互评' }));

    await waitFor(() => {
      expect(mocks.submitPeerReview).toHaveBeenCalledTimes(2);
    });

    expect(mocks.submitPeerReview).toHaveBeenNthCalledWith(1, {
      reviewer_id: 3,
      reviewee_id: 1,
      team_quest_id: 5,
      score: 4,
      comment: undefined,
    });
    expect(mocks.submitPeerReview).toHaveBeenNthCalledWith(2, {
      reviewer_id: 3,
      reviewee_id: 2,
      team_quest_id: 5,
      score: 5,
      comment: undefined,
    });
  });
});
