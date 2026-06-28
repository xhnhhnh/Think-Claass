import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';
import { AdminController, AuditLogsController, OpenApiController } from './admin.controllers';

function mockAdminReq(): Request {
  return {
    ip: '127.0.0.1',
    header(name: string) {
      if (name === 'x-user-role') return 'superadmin';
      if (name === 'x-user-id') return '1';
      return undefined;
    },
  } as unknown as Request;
}

function expectHttpError(error: unknown, status: number, message: string) {
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
  expect((error as HttpException).getResponse()).toEqual({ success: false, message });
}

describe('Admin Nest controllers', () => {
  it('keeps admin session and protected admin contract response shapes', async () => {
    const service = {
      createSession: vi.fn().mockResolvedValue({ user: { id: 1, role: 'superadmin', username: 'root' } }),
      getSystemSettings: vi.fn().mockResolvedValue({ site_title: 'Think-Class' }),
      createTeacher: vi.fn().mockResolvedValue({ id: 2, username: 'teacher01', role: 'teacher', isActivated: true }),
      generateActivationCodes: vi.fn().mockResolvedValue({ message: 'created', createdCount: 1, codes: [] }),
      createAnnouncement: vi.fn().mockResolvedValue({ id: 3, title: 'A', content: 'B', isActive: true, createdAt: null }),
    };
    const controller = new AdminController(service as any);

    await expect(controller.createSession({ username: 'root', password: 'secret' })).resolves.toEqual({
      success: true,
      data: { user: { id: 1, role: 'superadmin', username: 'root' } },
    });
    await expect(controller.getSystemSettings(mockAdminReq())).resolves.toEqual({
      success: true,
      data: { site_title: 'Think-Class' },
    });
    await expect(controller.createUser(mockAdminReq(), { username: 'teacher01', password: 'pass' })).resolves.toEqual({
      success: true,
      data: { id: 2, username: 'teacher01', role: 'teacher', isActivated: true },
      message: '教师创建成功',
    });
    await expect(controller.createCodes(mockAdminReq(), { count: 1 })).resolves.toEqual({
      success: true,
      data: { message: 'created', createdCount: 1, codes: [] },
      message: 'created',
    });
    await expect(controller.createAnnouncement(mockAdminReq(), { title: 'A', content: 'B', isActive: true })).resolves.toMatchObject({
      success: true,
      message: '公告创建成功',
    });
  });

  it('maps admin ApiError and OpenAPI legacy fallback messages', async () => {
    const admin = new AdminController({
      getSystemStats: vi.fn().mockImplementation(() => {
        throw new ApiError(403, '无权限执行该操作');
      }),
    } as any);
    const openapi = new OpenApiController({
      createKey: vi.fn().mockImplementation(() => {
        throw new ApiError(400, '名称为必填项');
      }),
      listSchools: vi.fn().mockImplementation(() => {
        throw new Error('sqlite busy');
      }),
    } as any);

    const noRoleReq = {
      header: () => undefined,
    } as unknown as Request;
    await expect(admin.getSystemStats(noRoleReq)).rejects.toMatchObject({
      response: { success: false, message: '无权限执行该操作' },
      status: 403,
    });

    try {
      openapi.createKey({});
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 400, '名称为必填项');
    }

    try {
      openapi.listSchools();
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 500, '获取校园列表失败');
    }
  });

  it('keeps audit logs legacy data/total shape and raw error.message fallback', () => {
    const controller = new AuditLogsController({
      listLogs: vi.fn().mockReturnValue({ data: [{ id: 1 }], total: 1 }),
    } as any);
    expect(controller.listLogs({ action: 'LOGIN' })).toEqual({ success: true, data: [{ id: 1 }], total: 1 });

    const failingController = new AuditLogsController({
      listLogs: vi.fn().mockImplementation(() => {
        throw new Error('database locked');
      }),
    } as any);

    try {
      failingController.listLogs({});
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 500, 'database locked');
    }
  });
});
