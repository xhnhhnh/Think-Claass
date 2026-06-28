import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../utils/password';

const authMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  decrypt: vi.fn(),
}));

vi.mock('../../prismaClient.js', () => ({
  prisma: {
    users: {
      findFirst: authMocks.findFirst,
      update: authMocks.update,
    },
  },
}));

import { AuthService } from './auth.service';

async function postLogin(body: Record<string, unknown>) {
  try {
    return { status: 200, body: await new AuthService().login(body) };
  } catch (error: any) {
    return { status: error.statusCode ?? 500, body: { success: false, message: error.message } };
  }
}

describe('auth password compatibility', () => {
  beforeEach(() => {
    authMocks.findFirst.mockReset();
    authMocks.update.mockReset();
  });

  it('logs in with hashed passwords without rewriting them', async () => {
    const password_hash = hashPassword('123456');
    authMocks.findFirst.mockResolvedValue({ id: 1, role: 'teacher', username: 'teacher', password_hash, is_activated: 1 });

    const response = await postLogin({ username: 'teacher', password: '123456', role: 'teacher' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(authMocks.update).not.toHaveBeenCalled();
  });

  it('logs in with legacy plaintext and upgrades it to a hash', async () => {
    authMocks.findFirst.mockResolvedValue({ id: 2, role: 'teacher', username: 'legacy', password_hash: '123456', is_activated: 1 });

    const response = await postLogin({ username: 'legacy', password: '123456', role: 'teacher' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(authMocks.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { password_hash: expect.stringMatching(/^scrypt\$/) },
    });
  });

  it('rejects wrong passwords', async () => {
    authMocks.findFirst.mockResolvedValue({ id: 3, role: 'teacher', username: 'teacher', password_hash: hashPassword('123456'), is_activated: 1 });

    const response = await postLogin({ username: 'teacher', password: 'wrong', role: 'teacher' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(authMocks.update).not.toHaveBeenCalled();
  });
});
