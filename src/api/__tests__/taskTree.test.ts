import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
  apiDelete: mocks.apiDelete,
}));

import { taskTreeApi } from '../taskTree';

describe('taskTreeApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.apiDelete.mockReset();
  });

  it('loads teacher nodes by class id', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, nodes: [] });
    await taskTreeApi.getTeacherNodes(6);
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/task-tree/teacher/6');
  });

  it('deletes node by node id', async () => {
    mocks.apiDelete.mockResolvedValue({ success: true });
    await taskTreeApi.deleteNode(12);
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/task-tree/teacher/12');
  });
});
