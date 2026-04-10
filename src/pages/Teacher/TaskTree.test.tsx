import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherTaskTree from './TaskTree';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
  apiDelete: mocks.apiDelete,
}));

describe('TeacherTaskTree', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.apiDelete.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          classes: [{ id: 42, name: '一班' }],
        }),
      })
    );
    mocks.apiGet.mockResolvedValue({ success: true, nodes: [] });
    mocks.apiPost.mockResolvedValue({ success: true });
  });

  it('submits new nodes with the teacher task-tree write contract', async () => {
    render(<TeacherTaskTree />);

    await screen.findByRole('button', { name: '新建节点' });

    fireEvent.click(screen.getByRole('button', { name: '新建节点' }));
    fireEvent.change(screen.getByPlaceholderText('如: 第一章：魔法起源'), {
      target: { value: '测试节点' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存节点' }));

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        '/api/task-tree/teacher',
        expect.objectContaining({
          class_id: 42,
          title: '测试节点',
          parent_node_id: null,
          x_pos: 50,
          y_pos: 50,
        })
      );
    });

    expect(mocks.apiPut).not.toHaveBeenCalled();
  });
});
