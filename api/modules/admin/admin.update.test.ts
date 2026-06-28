import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { AdminUpdateController } from './admin.update';

function mockReq(role = 'superadmin'): Request {
  return {
    header: vi.fn((name: string) => {
      if (name === 'x-user-role') return role;
      if (name === 'x-user-id') return '1';
      return undefined;
    }),
  } as unknown as Request;
}

describe('AdminUpdateController', () => {
  it('checks the latest GitHub release for superadmins', async () => {
    const status = {
      state: 'idle',
      currentVersion: 'v1.6.7',
      latestVersion: 'v1.6.8',
      hasUpdate: true,
    };
    const service = {
      checkLatest: vi.fn().mockResolvedValue(status),
    };
    const controller = new AdminUpdateController(service as any);

    await expect(controller.checkLatest(mockReq(), '80')).resolves.toEqual({
      success: true,
      data: status,
    });
    expect(service.checkLatest).toHaveBeenCalledWith(80);
  });

  it('rejects non-superadmins before starting an update', async () => {
    const service = {
      startUpdate: vi.fn(),
    };
    const controller = new AdminUpdateController(service as any);

    await expect(controller.startUpdate(mockReq('admin'))).rejects.toMatchObject({
      status: 403,
      response: { success: false, message: '无权限执行该操作' },
    });
    expect(service.startUpdate).not.toHaveBeenCalled();
  });
});
