/**
 * Cross-class brawl: settling a battle is irreversible, so it asks first. The old button called
 * the API on a single click, and a misclick ended (and paid out) a running class battle.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherBrawl from '@/features/battles/pages/TeacherBrawlPage';

const mocks = vi.hoisted(() => ({
  useClasses: vi.fn(),
  useTeacherBattles: vi.fn(),
  useBattleStats: vi.fn(),
  useInitiateBattleMutation: vi.fn(),
  useBattleActionMutation: vi.fn(),
  actionMutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  searchClasses: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: vi.fn(),
  },
}));

vi.mock('@/hooks/queries/useClasses', () => ({
  useClasses: mocks.useClasses,
}));

vi.mock('@/features/battles/hooks/useBattles', () => ({
  useTeacherBattles: mocks.useTeacherBattles,
  useBattleStats: mocks.useBattleStats,
  useInitiateBattleMutation: mocks.useInitiateBattleMutation,
  useBattleActionMutation: mocks.useBattleActionMutation,
}));

vi.mock('@/features/battles/api/battlesApi', () => ({
  battlesApi: { searchClasses: mocks.searchClasses },
}));

const activeBattle = {
  id: 99,
  status: 'active',
  initiator_class_id: 7,
  target_class_id: 8,
  initiator_class_name: '一班',
  target_class_name: '二班',
};

describe('TeacherBrawl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useClasses.mockReturnValue({ data: [{ id: 7, name: '一班' }], isError: false, refetch: vi.fn() });
    mocks.useTeacherBattles.mockReturnValue({ data: [activeBattle], isError: false });
    mocks.useBattleStats.mockReturnValue({
      data: {
        battle: activeBattle,
        initiatorScore: 10,
        targetScore: 5,
      },
    });
    mocks.useInitiateBattleMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.useBattleActionMutation.mockReturnValue({
      mutateAsync: mocks.actionMutateAsync,
      isPending: false,
    });
    mocks.actionMutateAsync.mockResolvedValue({ success: true });
  });

  const renderPage = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TeacherBrawl />
      </QueryClientProvider>,
    );

  it('asks before ending and settling a battle', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '结束大乱斗并结算' }));

    expect(await screen.findByText('结束大乱斗并结算？')).toBeInTheDocument();
    expect(mocks.actionMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '结束并结算' }));

    await waitFor(() =>
      expect(mocks.actionMutateAsync).toHaveBeenCalledWith({ battleId: 99, action: 'end', winnerClassId: 7 }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('大乱斗已结束并结算');
  });
});
