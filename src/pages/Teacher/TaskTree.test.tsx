import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherTaskTree from './TaskTree';

const mocks = vi.hoisted(() => ({
  useClasses: vi.fn(),
  useTeacherTaskNodes: vi.fn(),
  useCreateTaskNodeMutation: vi.fn(),
  useUpdateTaskNodeMutation: vi.fn(),
  useDeleteTaskNodeMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
  deleteMutateAsync: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mocks.invalidateQueries,
    }),
  };
});

vi.mock('@/hooks/queries/useClasses', () => ({
  useClasses: mocks.useClasses,
}));

vi.mock('@/hooks/queries/useTaskTree', () => ({
  useTeacherTaskNodes: mocks.useTeacherTaskNodes,
  useCreateTaskNodeMutation: mocks.useCreateTaskNodeMutation,
  useUpdateTaskNodeMutation: mocks.useUpdateTaskNodeMutation,
  useDeleteTaskNodeMutation: mocks.useDeleteTaskNodeMutation,
}));

describe('TeacherTaskTree', () => {
  beforeEach(() => {
    mocks.useClasses.mockReturnValue({ data: [{ id: 42, name: '一班' }] });
    mocks.useTeacherTaskNodes.mockReturnValue({ data: [] });
    mocks.createMutateAsync.mockReset();
    mocks.updateMutateAsync.mockReset();
    mocks.deleteMutateAsync.mockReset();
    mocks.invalidateQueries.mockReset();
    mocks.createMutateAsync.mockResolvedValue({ success: true });
    mocks.useCreateTaskNodeMutation.mockReturnValue({ mutateAsync: mocks.createMutateAsync });
    mocks.useUpdateTaskNodeMutation.mockReturnValue({ mutateAsync: mocks.updateMutateAsync });
    mocks.useDeleteTaskNodeMutation.mockReturnValue({ mutateAsync: mocks.deleteMutateAsync });
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
      expect(mocks.createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          class_id: 42,
          title: '测试节点',
          parent_node_id: null,
          x_pos: 50,
          y_pos: 50,
        })
      );
    });

    expect(mocks.updateMutateAsync).not.toHaveBeenCalled();
  });
});
