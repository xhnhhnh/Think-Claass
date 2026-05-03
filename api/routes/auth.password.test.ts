import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../utils/password';

const authMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../prismaClient.js', () => ({
  prisma: {
    users: {
      findFirst: authMocks.findFirst,
      update: authMocks.update,
    },
  },
}));

import authRoutes from './auth';

async function postLogin(body: Record<string, unknown>) {
  const layer = (authRoutes as any).stack.find((item: any) => item.route?.path === '/login' && item.route?.methods?.post);
  const handler = layer.route.stack[0].handle;
  const req = { body, method: 'POST', originalUrl: '/api/auth/login' };
  const res = { json: vi.fn() };
  const next = vi.fn();

  handler(req, res, next);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const error = next.mock.calls[0]?.[0];
  if (error) {
    return { status: error.statusCode ?? 500, body: { success: false, message: error.message } };
  }

  return { status: 200, body: res.json.mock.calls[0][0] };
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
