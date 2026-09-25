/**
 * `api/slg` route authorization.
 *
 * Before this suite, all eight routes were reachable with no credential at all: an anonymous caller
 * could read any class's map, create territories for any class, settle a class's yield, and spend
 * any student's points *as that student*. The gates are now two layers, and both are asserted here:
 *
 *   - the **role** gate in the controller: anonymous -> 401 `未登录或登录已过期`,
 *     a role that may not call the route -> 403 `无权限执行该操作`;
 *   - the **scope** gate in `SlgService`: a teacher naming someone else's class, a student naming
 *     another class, or a student contributing as another student -> 403.
 *
 * The controller tests use a recording fake service for the role cases (the point is that the
 * service is never reached) and the *real* service with a small port fake for the ownership cases,
 * so "a student may only contribute as themselves" is proven against the shipped decision.
 *
 * `refused()` exists because these handlers are a mix of async and sync: it awaits whatever the
 * handler does and returns the thrown `ApiError`, so a synchronous throw cannot escape the assertion.
 */

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';

import { SlgController } from '../../plugins/slg/src/slg.controllers.js';
import { SlgService } from '../../plugins/slg/src/slg.service.js';

type Actor = { userId: number; role: string; studentId?: number; classId?: number };

/** A request whose kernel context carries an actor, as the middleware would leave it. */
function request(actor: Actor | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'bearer' : 'none' } } as unknown as Request;
}

/** The actor itself, for the service-level scope checks. */
function actor(input: Actor) {
  return { id: input.userId, role: input.role, studentId: input.studentId, classId: input.classId };
}

/** Runs the call and returns what it threw, whichever way it threw. */
async function refused(run: () => unknown): Promise<any> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to be refused, but it resolved');
}

/**
 * A classroom whose only facts are the ones a scope decision needs: the class's teacher and the
 * student a login is bound to.
 */
function classroomDouble() {
  const classes = new Map<number, { id: number; teacherId: number | null }>([[3, { id: 3, teacherId: 7 }]]);
  const students = new Map<number, { id: number; classId: number; userId: number }>([
    [1, { id: 1, classId: 3, userId: 100 }],
  ]);
  return {
    classes,
    students,
    async getClassById(classId: number) {
      return classes.get(classId) ?? null;
    },
    async getStudentByUserId(userId: number) {
      return [...students.values()].find((student) => student.userId === userId) ?? null;
    },
  } as unknown as ClassroomPort;
}

/** The real service over the port double; the repository is unreachable on every refused path. */
function realService() {
  return new SlgService({} as never, classroomDouble());
}

/** A service that records calls, so a role gate can be proven to refuse before any work. */
function recordingService() {
  const calls: string[] = [];
  const service = {
    getMap: vi.fn(async () => {
      calls.push('getMap');
      return { territories: [], resources: {} };
    }),
    contribute: vi.fn(async () => {
      calls.push('contribute');
      return { contributed: true };
    }),
    createTerritory: vi.fn(async () => {
      calls.push('createTerritory');
      return { territoryId: 1 };
    }),
    yieldResources: vi.fn(async () => {
      calls.push('yieldResources');
      return { yield: {} };
    }),
    assertClassAccess: vi.fn(async () => {
      calls.push('assertClassAccess');
    }),
    assertTeacherClass: vi.fn(async () => {
      calls.push('assertTeacherClass');
    }),
    assertSelfStudent: vi.fn(async () => {
      calls.push('assertSelfStudent');
    }),
  };
  return { service, calls };
}

/** Every route, with the arguments each handler takes. */
const ROUTES: Array<{ label: string; invoke: (controller: SlgController, req: Request) => unknown }> = [
  { label: 'GET /api/slg/map/:classId', invoke: (c, req) => c.legacyMap(req, '3') },
  { label: 'POST /api/slg/student/:studentId/contribute/:territoryId', invoke: (c, req) => c.legacyContribute(req, '1', '1', { amount: 10 }) },
  { label: 'POST /api/slg/teacher', invoke: (c, req) => c.legacyCreateTerritory(req, { class_id: 3, name: '森林', type: 'forest' }) },
  { label: 'POST /api/slg/teacher/yield/:classId', invoke: (c, req) => c.legacyYield(req, '3') },
  { label: 'GET /api/slg/classes/:classId/map', invoke: (c, req) => c.map(req, '3') },
  { label: 'POST /api/slg/students/:studentId/territories/:territoryId/contributions', invoke: (c, req) => c.contribute(req, '1', '1', { amount: 10 }) },
  { label: 'POST /api/slg/classes/:classId/territories', invoke: (c, req) => c.createTerritory(req, '3', { name: '森林', type: 'forest' }) },
  { label: 'POST /api/slg/classes/:classId/yield', invoke: (c, req) => c.yieldResources(req, '3') },
];

describe('slg: anonymous callers are refused with 401', () => {
  for (const route of ROUTES) {
    it(`${route.label} answers 401 without any credential`, async () => {
      const { service, calls } = recordingService();
      const controller = new SlgController(service as never);

      const error = await refused(() => route.invoke(controller, request(null)));

      expect(error).toMatchObject({ status: 401, message: '未登录或登录已过期' });
      // Refused before any work: no scope check, no service call.
      expect(calls).toEqual([]);
    });
  }
});

describe('slg: a known caller without the required role is refused with 403', () => {
  it('a student cannot create a territory for a class', async () => {
    const { service, calls } = recordingService();
    const controller = new SlgController(service as never);
    const student = request({ userId: 100, role: 'student', studentId: 1, classId: 3 });

    const error = await refused(() => controller.createTerritory(student, '3', { name: '森林', type: 'forest' }));

    expect(error).toMatchObject({ status: 403, message: '无权限执行该操作' });
    expect(calls).toEqual([]);
  });

  it('a student cannot settle a class yield, on any spelling', async () => {
    const { service, calls } = recordingService();
    const controller = new SlgController(service as never);
    const student = request({ userId: 100, role: 'student', studentId: 1, classId: 3 });

    expect(await refused(() => controller.yieldResources(student, '3'))).toMatchObject({ status: 403 });
    expect(await refused(() => controller.legacyYield(student, '3'))).toMatchObject({ status: 403 });
    expect(
      await refused(() => controller.legacyCreateTerritory(student, { class_id: 3, name: '森林', type: 'forest' })),
    ).toMatchObject({ status: 403 });
    expect(calls).toEqual([]);
  });

  it('a teacher cannot contribute as a student', async () => {
    const { service, calls } = recordingService();
    const controller = new SlgController(service as never);

    const error = await refused(() => controller.contribute(request({ userId: 7, role: 'teacher' }), '1', '1', { amount: 10 }));

    expect(error).toMatchObject({ status: 403, message: '无权限执行该操作' });
    expect(calls).toEqual([]);
  });
});

describe('slg: a student may only contribute as themselves', () => {
  it('refuses a student naming another student, on both spellings', async () => {
    const controller = new SlgController(realService() as never);
    const student = request({ userId: 100, role: 'student', studentId: 1, classId: 3 });

    const error = await refused(() => controller.contribute(student, '2', '1', { amount: 10 }));
    expect(error).toMatchObject({ status: 403, message: '无权限使用该学生账号' });
    expect(await refused(() => controller.legacyContribute(student, '2', '1', { amount: 10 }))).toMatchObject({
      status: 403,
    });
  });

  it("resolves the student row from the actor's login when no scope was resolved", async () => {
    // No `studentId` on the actor: the claim comes from `classroom.public` by `userId`, so the
    // gate still admits the student's own row rather than refusing every student on a host that
    // does not install a scope resolver.
    const service = realService();

    await service.assertSelfStudent(actor({ userId: 100, role: 'student' }), '1');
    expect(await refused(() => service.assertSelfStudent(actor({ userId: 100, role: 'student' }), '2'))).toMatchObject({
      status: 403,
    });
  });
});

describe('slg: class scope', () => {
  it('refuses a teacher naming a class they do not own', async () => {
    const service = realService();
    const other = actor({ userId: 8, role: 'teacher' });

    expect(await refused(() => service.assertClassAccess(other, '3'))).toMatchObject({
      status: 403,
      message: '无权限访问该班级',
    });
    expect(await refused(() => service.assertTeacherClass(other, '3'))).toMatchObject({
      status: 403,
      message: '无权限管理该班级',
    });
  });

  it('refuses a student naming a class they are not in, and admits their own', async () => {
    const service = realService();

    expect(
      await refused(() => service.assertClassAccess(actor({ userId: 100, role: 'student', studentId: 1, classId: 9 }), '3')),
    ).toMatchObject({ status: 403 });
    await service.assertClassAccess(actor({ userId: 100, role: 'student', studentId: 1, classId: 3 }), '3');
  });

  it('lets staff admin through, and reports an unknown class as 404', async () => {
    const service = realService();

    await service.assertClassAccess(actor({ userId: 1, role: 'admin' }), '3');
    await service.assertTeacherClass(actor({ userId: 1, role: 'superadmin' }), '3');
    expect(await refused(() => service.assertClassAccess(actor({ userId: 7, role: 'teacher' }), '999'))).toMatchObject({
      status: 404,
    });
  });
});
