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
function fakeRequest(
  actor: { userId: number; role: string; studentId?: number; classId?: number } | null,
): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'session' : 'none' } } as unknown as Request;
}

/** A teacher's actor, which every scope check admits. */
const STAFF_REQUEST = () => fakeRequest({ userId: 7, role: 'teacher' });

/**
 * The classroom port the scope checks go through.
 *
 * The controller resolves it from the plugin context (`ctx.use('classroom.public')`), so the fake
 * context has to answer that lookup. The returned port says "student 1 is in class 1, taught by
 * teacher 7", which is the minimum shape `PetAuthorization` reads.
 */
function fakeClassroom() {
  return {
    getStudentByUserId: vi.fn().mockResolvedValue({ id: 1, classId: 1 }),
    getClassIdByStudentId: vi.fn().mockResolvedValue(1),
    listClassIdsByTeacher: vi.fn().mockResolvedValue([1]),
    listStudentsByParent: vi.fn().mockResolvedValue([{ id: 1, classId: 1 }]),
  };
}

function fakeContext() {
  const requirePermission = vi.fn();
  const classroom = fakeClassroom();
  const ctx = {
    plugin: { id: 'pet', version: '1.0.0' },
    permissions: { require: requirePermission },
    use: vi.fn().mockReturnValue(classroom),
  } as unknown as KernelContext;
  return { ctx, requirePermission, classroom };
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
    // Every route on this controller is actor-scoped now, so it needs an actor even when the
    // assertion is only about the envelope it returns.
    const req = STAFF_REQUEST();

    expect(await controller.getStudentPet(req, '1')).toEqual({
      success: true,
      data: { pet: { id: 1 }, hasParentBuff: true },
      pet: { id: 1 },
      has_parent_buff: true,
    });
    expect(await controller.getStudentDashboard(req, '1')).toEqual({
      success: true,
      data: { pet: { id: 1 }, availablePoints: 20 },
    });
    expect(await controller.getClassmates(req, '1')).toEqual({
      success: true,
      data: { classmatesPets: [{ id: 2 }] },
      classmatesPets: [{ id: 2 }],
    });
    expect(await controller.adoptPet(req, '1', { elementType: 'fire' })).toEqual({
      success: true,
      data: { petId: 3, pet: { id: 3 } },
      petId: 3,
      pet: { id: 3 },
    });
    expect(await controller.interact(req, '1', { actionType: 'feed' })).toEqual({
      success: true,
      data: { pet: { id: 1 }, points: 15 },
      pet: { id: 1 },
      points: 15,
    });
    expect(await controller.updatePet(req, '1', { level: 2 })).toEqual({
      success: true,
      data: { pet: { id: 1, level: 2 } },
      message: 'Pet updated successfully',
      pet: { id: 1, level: 2 },
    });
    expect(await controller.listClassPets(req, '1')).toEqual({
      success: true,
      data: { students: [{ student_id: 1 }] },
      students: [{ student_id: 1 }],
    });
    expect(await controller.listLeaderboard(req, '1')).toEqual({
      success: true,
      data: { leaderboard: [{ student_id: 1 }] },
      leaderboard: [{ student_id: 1 }],
    });
    expect(await controller.battle(req, { studentId: 1, opponentId: 2 })).toEqual({
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
    const { ctx } = fakeContext();
    const service = fakeService();
    const controller = new LegacyPetsController(ctx, service as never);
    const req = STAFF_REQUEST();

    expect(await controller.listClassPets(req, '1')).toEqual({ success: true, students: [{ student_id: 1 }] });
    expect(await controller.listClassmates(req, '1')).toEqual({ success: true, classmatesPets: [{ id: 2 }] });
    expect(await controller.listLeaderboard(req, '1')).toEqual({ success: true, leaderboard: [{ student_id: 1 }] });
    expect(await controller.battle(req, { studentId: 1, opponentId: 2 })).toEqual({ success: true, result: { isWin: true } });
    expect(await controller.adoptPet(req, { studentId: 1, elementType: 'fire' })).toEqual({
      success: true,
      petId: 3,
      pet: { id: 3 },
    });
    expect(await controller.interact(req, { studentId: 1, actionType: 'feed' })).toEqual({
      success: true,
      pet: { id: 1 },
      points: 15,
    });
    expect(await controller.getStudentPet(req, '1')).toEqual({ success: true, pet: { id: 1 }, has_parent_buff: true });
    expect(await controller.updatePet(req, '1', {})).toEqual({
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

describe('pet controllers: the writes the frontend actually calls', () => {
  /**
   * `/adoptions` and `/actions` are the twins `petApi.ts` posts to. They used to share a service
   * method with the gated aliases while carrying no gate of their own, so `pet.adopt` /
   * `pet.interact` were decorative: the reachable route was the ungated one. These assertions pin
   * that both twins enforce the same thing.
   */
  it('enforces the permission on /adoptions and /actions too, not only on the aliases', async () => {
    const { ctx, requirePermission } = fakeContext();
    const service = fakeService();
    const controller = new PetController(ctx, service as never);
    const req = fakeRequest({ userId: 7, role: 'teacher' });

    await controller.adoptPet(req, '10', { elementType: 'fire' });
    expect(requirePermission).toHaveBeenCalledWith({ userId: 7, role: 'teacher', studentId: 10 }, 'pet.adopt');

    await controller.interact(req, '10', { actionType: 'feed' });
    expect(requirePermission).toHaveBeenCalledWith({ userId: 7, role: 'teacher', studentId: 10 }, 'pet.interact');

    // And the resolved actor reaches the service, so the ledger entry names the real caller.
    expect(service.adoptPet).toHaveBeenCalledWith('10', { elementType: 'fire' }, 7);
  });

  it('refuses an unauthenticated caller before it touches the service', async () => {
    const { ctx } = fakeContext();
    const service = fakeService();
    const controller = new PetController(ctx, service as never);

    await expect(controller.adoptPet(fakeRequest(null), '10', {})).rejects.toThrow('未登录或登录已过期');
    await expect(controller.interact(fakeRequest(null), '10', {})).rejects.toThrow('未登录或登录已过期');
    expect(service.adoptPet).not.toHaveBeenCalled();
    expect(service.interact).not.toHaveBeenCalled();
  });

  it('lets a student act on their own row and refuses another student"s row', async () => {
    const { ctx } = fakeContext();
    const service = fakeService();
    const controller = new PetController(ctx, service as never);

    // The regression this pins: with `Actor.studentId` never populated, this call - the only one a
    // student can make - answered 403「当前账号未绑定学生」for every student in the product.
    await expect(
      controller.interact(fakeRequest({ userId: 3, role: 'student', studentId: 10 }), '10', { actionType: 'feed' }),
    ).resolves.toMatchObject({ success: true, points: 15 });

    await expect(
      controller.interact(fakeRequest({ userId: 3, role: 'student', studentId: 11 }), '10', { actionType: 'feed' }),
    ).rejects.toThrow('只能操作自己的精灵');
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
    // The actor is supplied so the assertion is about the *service* error: the scope gate runs
    // first now, and a request with no context at all would fail there instead.
    await expect(controller.getStudentPet(STAFF_REQUEST(), '99')).rejects.toThrow('Student not found');
  });
});
