import { beforeEach, describe, expect, it, vi } from 'vitest';

const authActivateMocks = vi.hoisted(() => ({
  findActivationCode: vi.fn(),
  markActivationCodeUsed: vi.fn(),
  activateUser: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  decrypt: vi.fn(),
}));

vi.mock('../../prismaClient.js', () => ({
  prisma: {
    activation_codes: {
      findUnique: authActivateMocks.findActivationCode,
    },
    $transaction: async (callback: any) => callback({
      activation_codes: {
        update: authActivateMocks.markActivationCodeUsed,
      },
    }),
  },
}));

vi.mock('../../services/activationService.js', () => ({
  activateUser: authActivateMocks.activateUser,
}));

import { AuthService } from './auth.service';

async function postActivate(body: Record<string, unknown>) {
  try {
    return { status: 200, body: await new AuthService().activate(body) };
  } catch (error: any) {
    return { status: error.statusCode ?? 500, body: { success: false, message: error.message } };
  }
}

describe('auth activation code flow', () => {
  beforeEach(() => {
    authActivateMocks.findActivationCode.mockReset();
    authActivateMocks.markActivationCodeUsed.mockReset();
    authActivateMocks.activateUser.mockReset();
  });

  it('activates a user with an unused card key', async () => {
    authActivateMocks.findActivationCode.mockResolvedValue({ id: 3, code: 'TC-ABCD1234', status: 'unused' });

    const response = await postActivate({ code: 'TC-ABCD1234', userId: 9 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: '激活成功' });
    expect(authActivateMocks.markActivationCodeUsed).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'used', used_by: 9, used_at: expect.any(Date) },
    });
    expect(authActivateMocks.activateUser).toHaveBeenCalledWith({
      userId: 9,
      source: 'activation_code',
      activationCode: 'TC-ABCD1234',
      remark: '通过激活码完成开通',
    });
  });

  it('rejects a card key that has already been used', async () => {
    authActivateMocks.findActivationCode.mockResolvedValue({ id: 4, code: 'TC-USED1234', status: 'used' });

    const response = await postActivate({ code: 'TC-USED1234', userId: 9 });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('该激活码已被使用');
    expect(authActivateMocks.markActivationCodeUsed).not.toHaveBeenCalled();
    expect(authActivateMocks.activateUser).not.toHaveBeenCalled();
  });

  it('rejects an unknown card key', async () => {
    authActivateMocks.findActivationCode.mockResolvedValue(null);

    const response = await postActivate({ code: 'TC-NOTFOUND', userId: 9 });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('无效的激活码');
    expect(authActivateMocks.markActivationCodeUsed).not.toHaveBeenCalled();
    expect(authActivateMocks.activateUser).not.toHaveBeenCalled();
  });
});
