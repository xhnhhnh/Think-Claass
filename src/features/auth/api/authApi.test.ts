import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}));

import { authApi } from './authApi';

describe('authApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
  });

  it('uses auth paths for login, register, and activation', async () => {
    mocks.apiPost.mockResolvedValue({ success: true });

    await authApi.login({ username: 'student1', password: 'secret', role: 'student' });
    await authApi.register({ username: 'parent1', password: 'secret', role: 'parent', student_id: 3 });
    await authApi.activate({ code: 'ABC123', userId: 9 });

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/auth/login', { username: 'student1', password: 'secret', role: 'student' });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/auth/register', { username: 'parent1', password: 'secret', role: 'parent', student_id: 3 });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/auth/activate', { code: 'ABC123', userId: 9 });
  });

  it('keeps admin session and invite code compatibility paths', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, data: { user: { id: 1 } } });
    mocks.apiGet.mockResolvedValue({ success: true, students: [] });

    const adminResponse = await authApi.adminLogin({ username: 'admin', password: 'secret' });
    await authApi.verifyInviteCode('ABCDEF', 'parent');

    expect(adminResponse).toEqual({ success: true, user: { id: 1 }, data: { user: { id: 1 } } });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/admin/session', { username: 'admin', password: 'secret' });
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/classes/invite/ABCDEF?role=parent');
  });
});
