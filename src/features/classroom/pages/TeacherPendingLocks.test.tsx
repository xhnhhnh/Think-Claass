/**
 * Pending locks on teacher write modals.
 *
 * A slow request used to leave the confirm button live, so a second click created a duplicate
 * product / boss / territory / structure write (and the shop's 保存 was double-submittable). These
 * pin that the mutation's pending flag disables the trigger and that a second click in the paper
 * editor's save does not issue a second write.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useClasses: vi.fn(),
  useWorldBosses: vi.fn(),
  useWorldBossMutation: vi.fn(),
  useTerritoryMap: vi.fn(),
  useCreateTerritoryMutation: vi.fn(),
  useTriggerYieldMutation: vi.fn(),
  useTeacherShopItems: vi.fn(),
  useTeacherShopMutation: vi.fn(),
  usePaper: vi.fn(),
  saveStructure: vi.fn(),
  updatePaper: vi.fn(),
  uploadAsset: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/app/commands/registry', () => ({ useRegisterPageCommands: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: '12' }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@/hooks/queries/useClasses', () => ({ useClasses: mocks.useClasses }));

vi.mock('@/features/challenge/hooks/useChallenge', () => ({
  useWorldBosses: mocks.useWorldBosses,
  useWorldBossMutation: mocks.useWorldBossMutation,
}));

vi.mock('@/features/slg/hooks/useTerritory', () => ({
  useTerritoryMap: mocks.useTerritoryMap,
  useCreateTerritoryMutation: mocks.useCreateTerritoryMutation,
  useTriggerYieldMutation: mocks.useTriggerYieldMutation,
}));

vi.mock('@/hooks/queries/useTeacherShop', () => ({
  useTeacherShopItems: mocks.useTeacherShopItems,
  useTeacherShopMutation: mocks.useTeacherShopMutation,
}));

vi.mock('@/features/learning/hooks/usePapers', () => ({ usePaper: mocks.usePaper }));

vi.mock('@/features/learning/api/papersApi', () => ({
  papersApi: {
    update: mocks.updatePaper,
    saveStructure: mocks.saveStructure,
    uploadAsset: mocks.uploadAsset,
  },
}));

import { useWorldBossMutation, useWorldBosses } from '@/features/challenge/hooks/useChallenge';
import { useTeacherShopItems, useTeacherShopMutation } from '@/hooks/queries/useTeacherShop';
import { useCreateTerritoryMutation, useTerritoryMap, useTriggerYieldMutation } from '@/features/slg/hooks/useTerritory';
import { usePaper } from '@/features/learning/hooks/usePapers';
import { useClasses } from '@/hooks/queries/useClasses';
import TeacherWorldBoss from '@/features/challenge/pages/TeacherWorldBossPage';
import TeacherTerritory from '@/features/slg/pages/TeacherTerritoryPage';
import TeacherShop from '@/features/marketplace/pages/TeacherShopPage';
import TeacherPaperEditor from '@/features/learning/pages/TeacherPaperEditorPage';

const wrapper = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('pending locks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useClasses as any).mockReturnValue({ data: [{ id: 1, name: '一班' }], isLoading: false });
    (useWorldBosses as any).mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
    (useWorldBossMutation as any).mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    (useTerritoryMap as any).mockReturnValue({ data: { territories: [] }, isError: false, refetch: vi.fn() });
    (useCreateTerritoryMutation as any).mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    (useTriggerYieldMutation as any).mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    (useTeacherShopItems as any).mockReturnValue({
      data: [{ id: 1, name: '免值日卡', description: '', price: 10, stock: 3, is_active: 1 }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    (useTeacherShopMutation as any).mockReturnValue({ mutateAsync: vi.fn(), isPending: true });
    (usePaper as any).mockReturnValue({
      data: {
        id: 12,
        title: '期中试卷',
        class_id: 1,
        paper_sections: [],
        paper_items: [
          { id: 1, order_no: 1, section_id: null, points_override: 5, questions: { stem: '1+1', type: 'single', answer_json: '2', default_points: 5, is_subjective: 0 } },
        ],
        paper_assets: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('disables 确认召唤 while a boss summon is pending', async () => {
    wrapper(<TeacherWorldBoss />);

    fireEvent.click(await screen.findByRole('button', { name: /召唤新BOSS/ }));

    expect(await screen.findByRole('button', { name: '召唤中...' })).toBeDisabled();
  });

  it('disables 确认部署领地 while a deploy is pending', async () => {
    wrapper(<TeacherTerritory />);

    fireEvent.click(await screen.findByRole('button', { name: '配置新领地' }));

    expect(await screen.findByRole('button', { name: '部署中...' })).toBeDisabled();
  });

  it('disables the shop save while the mutation is pending', async () => {
    wrapper(<TeacherShop />);

    fireEvent.click(await screen.findByRole('button', { name: '添加商品' }));

    expect(await screen.findByRole('button', { name: '保存中...' })).toBeDisabled();
  });

  it('does not write the paper structure twice from a double click', async () => {
    let resolveSave: (value: unknown) => void = () => undefined;
    mocks.saveStructure.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );

    wrapper(<TeacherPaperEditor />);

    const save = await screen.findByRole('button', { name: '保存结构' });
    fireEvent.click(save);
    const pendingSave = await screen.findByRole('button', { name: /保存中/ });
    expect(pendingSave).toBeDisabled();
    fireEvent.click(pendingSave);

    expect(mocks.saveStructure).toHaveBeenCalledTimes(1);

    resolveSave({ success: true, data: { id: 12 } });
    await waitFor(() => expect(screen.getByRole('button', { name: '保存结构' })).toBeInTheDocument());
  });
});
