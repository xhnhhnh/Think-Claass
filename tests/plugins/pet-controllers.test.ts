/**
 * Pet controller envelopes.
 *
 * Ported from `api/modules/pet/pet.controllers.test.ts` when the domain moved into a plugin.
 * The reason to keep a unit-level copy even though `host.test.ts` and the boot probe exercise
 * the routes over real HTTP: these two controllers deliberately speak *two different
 * envelopes* for the same domain, and the frontend reads specific fields out of each.
 *
 *   `/api/pet/*`   -> `{ success, data, ...flattened copies }`
 *   `/api/pets/*`  -> `{ success, ...payload }` with NO `data` key
 *
 * Every route is asserted here, because "the flat copy is duplicated" is exactly the kind of
 * detail a later cleanup deletes without noticing. The two plugin-only aliases are asserted as
 * well, together with the permission gate that is their only difference from `/adoptions` and
 * `/actions`.
 *
 * The error path changed shape with the migration and cannot be carried over verbatim: the
 * legacy controllers translated the application's `ApiError` into a Nest `HttpException`, while
 * a plugin throws the kernel's `ApiError` and the kernel's global filter renders it. So the
 * assertion is "the service error propagates unchanged" here, and the rendered body
 * (`{success:false, message}`) is asserted over HTTP in `host.test.ts`.
 */

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@thinkclass/kernel';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import { LegacyPetsController, PetController } from '../../plugins/pet/src/pet.controllers.js';

/** A request whose kernel context carries an actor, as the middleware would leave it. */
function fakeRequest(actor: { userId: number; role: string; studentId?: number } | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'session' : 'none' } } as unknown as Request;
}

function fakeContext() {
  const requirePermission = vi.fn();
  const ctx = {
    plugin: { id: 'pet', version: '1.0.0' },
    permissions: { require: requirePermission },
  } as unknown as KernelContext;
  return { ctx, requirePermission };
}

function fakeService() {
  return {
    getStudentPet: vi.fn().mockResolvedValue({ pet: { id: 1 }, hasParentBuff: true }),
    getStudentDashboard: vi.fn().mockResolvedValue({ pet: { id: 1 }, availablePoints: 20 }),
    listClassmates: vi.fn().mockResolvedValue([{ id: 2 }]),
    adoptPet: vi.fn().mockResolvedValue({ petId: 3, pet: { id: 3 } }),
    interact: vi.fn().mockResolvedValue({ pet: { id: 1 }, points: 15 }),
    updatePet: vi.fn().mockResolvedValue({ pet: { id: 1, level: 2 } }),
    listClassPets: vi.fn().mockResolvedValue([{ student_id: 1 }]),
    listLeaderboard: vi.fn().mockResolvedValue([{ student_id: 1 }]),
    battle: vi.fn().mockResolvedValue({ isWin: true }),
  };
}

describe('pet controllers: the /api/pet envelope', () => {
  it('keeps data plus the flattened legacy payloads on every route', async () => {
    const { ctx } = fakeContext();
    const service = fakeService();
    const controller = new PetController(ctx, service as never);

    expect(await controller.getStudentPet('1')).toEqual({
      success: true,
      data: { pet: { id: 1 }, hasParentBuff: true },
      pet: { id: 1 },
      has_parent_buff: true,
    });
    expect(await controller.getStudentDashboard('1')).toEqual({
      success: true,
      data: { pet: { id: 1 }, availablePoints: 20 },
    });
    expect(await controller.getClassmates('1')).toEqual({
      success: true,
      data: { classmatesPets: [{ id: 2 }] },
      classmatesPets: [{ id: 2 }],
    });
    expect(await controller.adoptPet('1', { elementType: 'fire' })).toEqual({
      success: true,
      data: { petId: 3, pet: { id: 3 } },
      petId: 3,
      pet: { id: 3 },
    });
    expect(await controller.interact('1', { actionType: 'feed' })).toEqual({
      success: true,
      data: { pet: { id: 1 }, points: 15 },
      pet: { id: 1 },
      points: 15,
    });
    expect(await controller.updatePet('1', { level: 2 })).toEqual({
      success: true,
      data: { pet: { id: 1, level: 2 } },
      message: 'Pet updated successfully',
      pet: { id: 1, level: 2 },
    });
    expect(await controller.listClassPets('4')).toEqual({
      success: true,
      data: { students: [{ student_id: 1 }] },
      students: [{ student_id: 1 }],
    });
    expect(await controller.listLeaderboard('4')).toEqual({
      success: true,
      data: { leaderboard: [{ student_id: 1 }] },
      leaderboard: [{ student_id: 1 }],
    });
    expect(await controller.battle({ studentId: 1, opponentId: 2 })).toEqual({
      success: true,
      data: { result: { isWin: true } },
      result: { isWin: true },
    });
  });

  it('serves the plugin health route', () => {
    const { ctx } = fakeContext();
    const controller = new PetController(ctx, fakeService() as never);

    expect(controller.health()).toEqual({ success: true, data: { plugin: 'pet', version: '1.0.0' } });
  });
});

describe('pet controllers: the /api/pets envelope', () => {
  it('keeps the data-less legacy shapes', async () => {
    const service = fakeService();
    const controller = new LegacyPetsController(service as never);

    expect(await controller.listClassPets('1')).toEqual({ success: true, students: [{ student_id: 1 }] });
    expect(await controller.listClassmates('1')).toEqual({ success: true, classmatesPets: [{ id: 2 }] });
    expect(await controller.listLeaderboard('1')).toEqual({ success: true, leaderboard: [{ student_id: 1 }] });
    expect(await controller.battle({ studentId: 1, opponentId: 2 })).toEqual({ success: true, result: { isWin: true } });
    expect(await controller.adoptPet({ studentId: 1, elementType: 'fire' })).toEqual({
      success: true,
      petId: 3,
      pet: { id: 3 },
    });
    expect(await controller.interact({ studentId: 1, actionType: 'feed' })).toEqual({
      success: true,
      pet: { id: 1 },
      points: 15,
    });
    expect(await controller.getStudentPet('1')).toEqual({ success: true, pet: { id: 1 }, has_parent_buff: true });
    expect(await controller.updatePet('1', {})).toEqual({
      success: true,
      message: 'Pet updated successfully',
      pet: { id: 1, level: 2 },
    });
  });
});

describe('pet controllers: the plugin-only aliases', () => {
  it('accepts the legacy body and forces the legacy status (200, not Nest POST 201)', async () => {
    const { ctx, requirePermission } = fakeContext();
    const service = fakeService();
    const controller = new PetController(ctx, service as never);
    const req = fakeRequest({ userId: 7, role: 'teacher', studentId: 10 });

    const adopted = await controller.adopt(req, '10', { elementType: 'fire' });
    expect(adopted).toMatchObject({ success: true, petId: 3, pet: { id: 3 } });
    expect(requirePermission).toHaveBeenCalledWith({ userId: 7, role: 'teacher', studentId: 10 }, 'pet.adopt');
    // The alias is the same operation as `/adoptions`, including the actor it forwards.
    expect(service.adoptPet).toHaveBeenCalledWith('10', { elementType: 'fire' }, 7);

    const acted = await controller.act(req, '10', { actionType: 'feed', cost: 5, expGain: 1 });
    expect(acted).toMatchObject({ success: true, pet: { id: 1 }, points: 15 });
    expect(requirePermission).toHaveBeenCalledWith({ userId: 7, role: 'teacher', studentId: 10 }, 'pet.interact');
  });

  it('refuses an unauthenticated caller and a student acting on someone else', async () => {
    const { ctx } = fakeContext();
    const controller = new PetController(ctx, fakeService() as never);

    await expect(controller.act(fakeRequest(null), '10', { actionType: 'feed' })).rejects.toThrow('未登录或登录已过期');
    await expect(
      controller.act(fakeRequest({ userId: 3, role: 'student', studentId: 99 }), '10', { actionType: 'feed' }),
    ).rejects.toThrow('只能操作自己的精灵');
    await expect(
      controller.act(fakeRequest({ userId: 3, role: 'student' }), '10', { actionType: 'feed' }),
    ).rejects.toThrow('当前账号未绑定学生');
  });

  it('propagates a refused permission instead of calling the service', async () => {
    const { ctx, requirePermission } = fakeContext();
    const service = fakeService();
    requirePermission.mockImplementation(() => {
      throw new ApiError(403, '无权限执行该操作');
    });
    const controller = new PetController(ctx, service as never);

    await expect(
      controller.adopt(fakeRequest({ userId: 7, role: 'teacher' }), '10', { elementType: 'fire' }),
    ).rejects.toThrow(ApiError);
    expect(service.adoptPet).not.toHaveBeenCalled();
  });
});

describe('pet controllers: errors', () => {
  it('lets the service error reach the kernel with its status intact', async () => {
    const { ctx } = fakeContext();
    const service = fakeService();
    service.getStudentPet.mockImplementation(() => {
      throw new ApiError(404, 'Student not found');
    });
    const controller = new PetController(ctx, service as never);

    // The kernel's filter renders this as `{success:false, message}` with status 404; the
    // legacy controller built an HttpException by hand. Same wire result, one less translator.
    await expect(controller.getStudentPet('99')).rejects.toThrow('Student not found');
  });
});
