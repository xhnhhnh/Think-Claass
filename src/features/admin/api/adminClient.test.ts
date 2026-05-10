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

import { adminClient } from './adminClient';

describe('adminClient platform APIs', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it('uses admin users and codes paths', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, data: { items: [] } });
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiPut.mockResolvedValue({ success: true });
    mocks.apiDelete.mockResolvedValue({ success: true });

    await adminClient.getTeachers();
    await adminClient.createTeacher({ username: 't', password: 'p' });
    await adminClient.updateTeacher(2, { username: 't2' });
    await adminClient.deleteTeacher(2);
    await adminClient.generateActivationCodes(10);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/admin/users');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/admin/users', { username: 't', password: 'p' });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/admin/users/2', { username: 't2' });
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/admin/users/2');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/admin/codes', { count: 10 });
  });

  it('uses audit and openapi paths', async () => {
    mocks.apiGet.mockResolvedValueOnce({ success: true, data: [], total: 0 });
    mocks.apiGet.mockResolvedValueOnce({ success: true, keys: [] });
    mocks.apiGet.mockResolvedValueOnce({ success: true, schools: [] });
    mocks.apiPost.mockResolvedValue({ success: true });
    mocks.apiDelete.mockResolvedValue({ success: true });

    await adminClient.getAuditLogs({ teacherId: 1, limit: 20, offset: 0 });
    await adminClient.getOpenApiKeys();
    await adminClient.createOpenApiKey('app');
    await adminClient.deleteOpenApiKey(3);
    await adminClient.getSchools();

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/audit-logs?teacher_id=1&limit=20');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/openapi/keys');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/openapi/keys', { name: 'app' });
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/openapi/keys/3');
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/openapi/schools');
  });
});
