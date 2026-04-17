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

import { familyTasksApi } from '../familyTasks';

describe('familyTasksApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.apiDelete.mockReset();
  });

  it('gets tasks by student id', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, tasks: [] });
    await familyTasksApi.getTasks(1);
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/family-tasks?studentId=1');
  });

  it('updates task status', async () => {
    mocks.apiPut.mockResolvedValue({ success: true });
    await familyTasksApi.updateTaskStatus(11, 'approved');
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/family-tasks/11', { status: 'approved' });
  });
});
