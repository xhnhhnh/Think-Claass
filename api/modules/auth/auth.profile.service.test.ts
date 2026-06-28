import { beforeEach, describe, expect, it, vi } from 'vitest';

const authProfileMocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  decrypt: vi.fn(),
}));

vi.mock('../../prismaClient.js', () => ({
  prisma: {
    users: {
      findUnique: authProfileMocks.findUnique,
      findFirst: authProfileMocks.findFirst,
      update: authProfileMocks.update,
    },
  },
}));

import { AuthService } from './auth.service';

async function putProfile(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const req = {
    body,
    method: 'PUT',
    originalUrl: '/api/auth/profile',
    header: (name: string) => headers[name.toLowerCase()],
  };
  try {
    return { status: 200, body: await new AuthService().updateProfile(req as any, body) };
  } catch (error: any) {
    return { status: error.statusCode ?? 500, body: { success: false, message: error.message } };
  }
}

describe('auth profile update', () => {
  beforeEach(() => {
    authProfileMocks.findUnique.mockReset();
    authProfileMocks.findFirst.mockReset();
    authProfileMocks.update.mockReset();
  });

  it('allows a teacher to update their own username and stores password as a hash', async () => {
    authProfileMocks.findUnique.mockResolvedValue({
      id: 5,
      role: 'teacher',
      username: 'old-teacher',
    });
    authProfileMocks.findFirst.mockResolvedValue(null);
    authProfileMocks.update.mockResolvedValue({
      id: 5,
      role: 'teacher',
      username: 'new-teacher',
      is_activated: 1,
    });

    const response = await putProfile(
      { username: 'new-teacher', password: 'new-pass' },
      { 'x-user-id': '5', 'x-user-role': 'teacher' },
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      user: {
        id: 5,
        role: 'teacher',
        username: 'new-teacher',
        is_activated: true,
      },
      message: '个人信息已更新',
    });
    expect(authProfileMocks.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: {
        username: 'new-teacher',
        password_hash: expect.stringMatching(/^scrypt\$/),
      },
      select: {
        id: true,
        role: true,
        username: true,
        is_activated: true,
      },
    });
  });

  it('rejects profile updates that target an existing username', async () => {
    authProfileMocks.findUnique.mockResolvedValue({
      id: 5,
      role: 'teacher',
      username: 'old-teacher',
    });
    authProfileMocks.findFirst.mockResolvedValue({
      id: 7,
      username: 'taken',
    });

    const response = await putProfile(
      { username: 'taken' },
      { 'x-user-id': '5', 'x-user-role': 'teacher' },
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('用户名已存在');
    expect(authProfileMocks.update).not.toHaveBeenCalled();
  });
});
