import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherLuckyDrawConfig from './LuckyDrawConfig';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  user: { id: 7 },
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

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}));

describe('TeacherLuckyDrawConfig', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/api/shop/all?teacherId=7') {
        return {
          success: true,
          items: [{ id: 1, name: '棒棒糖' }],
        };
      }

      if (url === '/api/lucky-draw/config?teacherId=7') {
        return {
          success: true,
          cost_points: 10,
          configs: Array.from({ length: 9 }, (_, index) => ({
            prize_name: `奖品${index + 1}`,
            prize_type: 'NONE',
            prize_value: null,
            probability: 10,
          })),
        };
      }

      return { success: true };
    });
    mocks.apiPost.mockResolvedValue({ success: true });
  });

  it('loads and saves configs through the hyphenated lucky-draw route', async () => {
    render(<TeacherLuckyDrawConfig />);

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('/api/lucky-draw/config?teacherId=7');
    });

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        '/api/lucky-draw/config',
        expect.objectContaining({
          teacher_id: 7,
          cost_points: 10,
        })
      );
    });
  });
});
