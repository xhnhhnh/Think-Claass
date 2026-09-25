/**
 * Parent-buff route authorization.
 *
 * One route, `POST /api/parent-buff`, and the matrix's reason for gating it: the write records a
 * parent's participation, and the classroom turns that record into a 20% points bonus - so an
 * anonymous caller could forge the bonus. The matrix's roles are `parent（本人孩子）/teacher`.
 *
 * The cases below pin the three doors (401 / 403 / pass), the parent/child binding through
 * `classroom.public`, and the ordering choice the boot probe forces: an empty body still answers
 * the legacy `400 Student ID required` before the gate, because
 * `tests/plugins/legacy-boot-probe.test.ts` uses that body to prove the route is mounted at all.
 * A body that names a student - the only shape that can write - is gated first.
 */

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@thinkclass/kernel';

import { ParentBuffController } from '../../plugins/parent-buff/src/parentBuff.controller.js';

function fakeRequest(actor: { userId: number; role: string } | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'session' : 'none' } } as unknown as Request;
}

async function refuserOf(run: () => unknown): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected the call to throw, but it resolved');
}

function fakeService() {
  return {
    assertActorMayBless: vi.fn(async () => undefined),
    createParentBuff: vi.fn(),
  };
}

const parent = fakeRequest({ userId: 8, role: 'parent' });
const teacher = fakeRequest({ userId: 5, role: 'teacher' });
const student = fakeRequest({ userId: 9, role: 'student' });

describe('parent-buff: the gate', () => {
  it('refuses an anonymous caller with 401', async () => {
    const service = fakeService();
    const controller = new ParentBuffController(service as never);

    const error = await refuserOf(() => controller.createParentBuff(fakeRequest(null), { studentId: 20 }));

    expect(error.status).toBe(401);
    expect(error.message).toBe('未登录或登录已过期');
    expect(service.assertActorMayBless).not.toHaveBeenCalled();
    expect(service.createParentBuff).not.toHaveBeenCalled();
  });

  it('refuses a role the matrix does not list with 403', async () => {
    const service = fakeService();
    const controller = new ParentBuffController(service as never);

    const error = await refuserOf(() => controller.createParentBuff(student, { studentId: 20 }));

    expect(error.status).toBe(403);
    expect(error.message).toBe('无权限执行该操作');
    expect(service.createParentBuff).not.toHaveBeenCalled();
  });

  it('refuses a parent naming somebody else’s child, and lets them name their own', async () => {
    const service = fakeService();
    service.assertActorMayBless.mockRejectedValueOnce(new ApiError(403, '无权限执行该操作'));
    const controller = new ParentBuffController(service as never);

    const error = await refuserOf(() => controller.createParentBuff(parent, { studentId: 99 }));
    expect(error.status).toBe(403);
    expect(service.createParentBuff).not.toHaveBeenCalled();

    expect(await controller.createParentBuff(parent, { studentId: 20 })).toEqual({ success: true });
    expect(service.assertActorMayBless).toHaveBeenLastCalledWith({ id: 8, role: 'parent', studentId: undefined }, 20);
    expect(service.createParentBuff).toHaveBeenCalledWith({ studentId: 20 });
  });

  it('lets a teacher through - the matrix does not qualify the teacher case further', async () => {
    const service = fakeService();
    const controller = new ParentBuffController(service as never);

    expect(await controller.createParentBuff(teacher, { studentId: 20 })).toEqual({ success: true });
    expect(service.assertActorMayBless).toHaveBeenCalledWith({ id: 5, role: 'teacher', studentId: undefined }, 20);
  });

  it('keeps the legacy 400 for an empty body, before the gate', async () => {
    const service = fakeService();
    const controller = new ParentBuffController(service as never);

    // `legacy-boot-probe.test.ts` posts exactly this request anonymously and pins the status and
    // the message, because they distinguish "the plugin's controller ran" from "not mounted".
    const error = await refuserOf(() => controller.createParentBuff(fakeRequest(null), {}));
    expect(error.status).toBe(400);
    expect(error.message).toBe('Student ID required');
    expect(service.assertActorMayBless).not.toHaveBeenCalled();
    expect(service.createParentBuff).not.toHaveBeenCalled();
  });
});
