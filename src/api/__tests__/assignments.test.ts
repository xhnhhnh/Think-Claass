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

import { assignmentsApi } from '../assignments';

describe('assignmentsApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.apiDelete.mockReset();
  });

  it('loads assignments with class filter', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, data: [] });
    await assignmentsApi.list(3);
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/assignments?class_id=3');
  });

  it('creates assignments through the legacy-compatible endpoint', async () => {
    const payload = { class_id: 3, teacher_id: 2, title: '阅读', reward_points: 10 };
    mocks.apiPost.mockResolvedValue({ success: true, id: 1 });
    await assignmentsApi.create(payload);
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/assignments', payload);
  });

  it('updates student assignment submissions', async () => {
    mocks.apiPut.mockResolvedValue({ success: true });
    await assignmentsApi.updateStudentAssignment(8, { status: 'submitted', content: 'done' });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/assignments/student-assignments/8', { status: 'submitted', content: 'done' });
  });
});
