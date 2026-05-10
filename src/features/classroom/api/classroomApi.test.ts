import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiDelete: mocks.apiDelete,
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
}));

import { analyticsApi } from './analyticsApi';
import { classroomApi } from './classesApi';
import { studentsApi } from './studentsApi';

describe('classroom feature APIs', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('uses typed student operation paths', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, students: [] });
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiPut.mockResolvedValue({ success: true });

    await studentsApi.getStudents(3);
    await studentsApi.createStudent({ name: '小明', username: 'xm', class_id: 3 });
    await studentsApi.batchPoints({ studentIds: [1, 2], amount: 5, reason: '表现' });
    await studentsApi.updateGroup(1, null);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/students?classId=3');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/students', { name: '小明', username: 'xm', class_id: 3 });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/students/batch-points', { studentIds: [1, 2], amount: 5, reason: '表现' });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/students/1/group', { group_id: null });
  });

  it('uses typed class operation paths', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, classes: [] });
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiDelete.mockResolvedValue({ success: true });

    await classroomApi.getClasses(8);
    await classroomApi.createGroup('A组', 3);
    await classroomApi.deletePreset(5);
    await classroomApi.getGuildRanking(3);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/classes?teacherId=8');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/groups', { name: 'A组', class_id: 3 });
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/presets/5');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/classes/3/guild-ranking');
  });

  it('keeps analytics paths stable', async () => {
    mocks.apiGet.mockResolvedValue({ success: true });

    await analyticsApi.getClassOverview(3);
    await analyticsApi.getStudentReport(7);
    await analyticsApi.getStudentRadar(7);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/analytics/classes/3/overview');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/analytics/students/7/report');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/analytics/students/7/radar');
  });
});
