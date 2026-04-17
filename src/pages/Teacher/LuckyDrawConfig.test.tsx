import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherLuckyDrawConfig from './LuckyDrawConfig';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  user: { id: 7 },
  configData: {
    cost_points: 10,
    configs: Array.from({ length: 9 }, (_, index) => ({
      prize_name: `奖品${index + 1}`,
      prize_type: 'NONE' as const,
      prize_value: null,
      probability: 10,
    })),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: { user: { id: number } }) => unknown) =>
    selector({
      user: mocks.user,
    }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn().mockReturnValue({
    data: [{ id: 1, name: '棒棒糖' }],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/queries/useLuckyDraw', () => ({
  useLuckyDrawConfig: vi.fn(() => ({
    data: mocks.configData,
    isLoading: false,
    refetch: mocks.refetch,
  })),
  useSaveLuckyDrawConfigMutation: vi.fn(() => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  })),
}));

describe('TeacherLuckyDrawConfig', () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.refetch.mockReset();
    mocks.mutateAsync.mockResolvedValue({ success: true });
    mocks.refetch.mockResolvedValue(undefined);
  });

  it('loads and saves configs through the hyphenated lucky-draw route', async () => {
    render(<TeacherLuckyDrawConfig />);

    await waitFor(() => {
      expect(screen.getByText('九宫格抽奖设置')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          teacher_id: 7,
          cost_points: 10,
        })
      );
    });
  });
});
