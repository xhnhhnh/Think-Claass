/**
 * `api/battles` route authorization.
 *
 * All thirteen routes were anonymous before this batch - including `GET /api/battles/classes/search`,
 * which enumerated every class (names and teachers), and the accept/reject/end writes, which let an
 * unnamed caller drive any class's battle. The matrix is the contract:
 *
 *   search + every write        teacher/admin, and a write needs a participating class
 *   a class's battle list       that class's teacher, its students, staff admin
 *   a battle's stats            the participating classes' teachers/students, staff admin
 *
 * The role cases use a recording fake service (the gate must refuse before any work); the scope
 * cases use the *real* service over a repository/port double. `refused()` awaits whatever the
 * handler does, so a synchronous throw cannot escape the assertion.
 */

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { BattlesController } from '../../plugins/battles/src/battles.controllers.js';
import { BattlesService } from '../../plugins/battles/src/battles.service.js';

type Actor = { userId: number; role: string; studentId?: number; classId?: number };

function request(actor: Actor | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'bearer' : 'none' } } as unknown as Request;
}

function actor(input: Actor) {
  return { id: input.userId, role: input.role, studentId: input.studentId, classId: input.classId };
}

async function refused(run: () => unknown): Promise<any> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to be refused, but it resolved');
}

/** A battle between classes 1 (teacher 7) and 2 (teacher 8); class 3 (teacher 9) is a bystander. */
function realService() {
  const battles = new Map([[5, { id: 5, initiator_class_id: 1, target_class_id: 2, status: 'pending' }]]);
  const classes = new Map<number, { id: number; name: string; teacherId: number | null }>([
    [1, { id: 1, name: '一班', teacherId: 7 }],
    [2, { id: 2, name: '二班', teacherId: 8 }],
    [3, { id: 3, name: '三班', teacherId: 9 }],
  ]);
  const repository = { getBattle: (battleId: number) => battles.get(battleId) ?? null };
  const classroom = {
    async getClassById(classId: number) {
      return classes.get(classId) ?? null;
    },
    async getStudentByUserId(userId: number) {
      if (userId === 100) return { id: 1, classId: 1, userId: 100 };
      if (userId === 101) return { id: 2, classId: 2, userId: 101 };
      if (userId === 102) return { id: 3, classId: 3, userId: 102 };
      return null;
    },
    async checkClassFeature() {
      return { value: true as const };
    },
    async searchClasses() {
      return [];
    },
    async sumClassPointsEarnedSince() {
      return 0;
    },
  };
  return new BattlesService(repository as never, classroom as never);
}

function recordingService() {
  const calls: string[] = [];
  const record = (name: string) =>
    vi.fn(async () => {
      calls.push(name);
      return {} as never;
    });
  const service = {
    searchClasses: vi.fn(async () => {
      calls.push('searchClasses');
      return [];
    }),
    listBattles: record('listBattles'),
    initiate: record('initiate'),
    accept: record('accept'),
    reject: record('reject'),
    end: record('end'),
    getStats: record('getStats'),
    assertClassAccess: vi.fn(async () => {
      calls.push('assertClassAccess');
    }),
    assertBattleAccess: vi.fn(async () => {
      calls.push('assertBattleAccess');
    }),
    assertBattleTeacher: vi.fn(async () => {
      calls.push('assertBattleTeacher');
    }),
    assertInitiatorClass: vi.fn(async () => {
      calls.push('assertInitiatorClass');
    }),
  };
  return { service, calls };
}

const INITIATE_BODY = { initiator_class_id: 1, target_class_id: 2 };

const ROUTES: Array<{ label: string; method: string; invoke: (controller: BattlesController, req: Request) => unknown }> = [
  { label: 'GET /api/battles/classes/search', method: 'GET', invoke: (c, req) => c.searchClasses(req, undefined, undefined) },
  { label: 'GET /api/battles/teacher/:classId', method: 'GET', invoke: (c, req) => c.legacyList(req, '1') },
  { label: 'POST /api/battles/teacher/initiate', method: 'POST', invoke: (c, req) => c.legacyInitiate(req, INITIATE_BODY) },
  { label: 'PUT /api/battles/teacher/accept/:battleId', method: 'PUT', invoke: (c, req) => c.legacyAccept(req, '5') },
  { label: 'PUT /api/battles/teacher/reject/:battleId', method: 'PUT', invoke: (c, req) => c.legacyReject(req, '5') },
  { label: 'PUT /api/battles/teacher/end/:battleId', method: 'PUT', invoke: (c, req) => c.legacyEnd(req, '5', {}) },
  { label: 'GET /api/battles/stats/:battleId', method: 'GET', invoke: (c, req) => c.legacyStats(req, '5') },
  { label: 'GET /api/battles/classes/:classId', method: 'GET', invoke: (c, req) => c.list(req, '1') },
  { label: 'GET /api/battles/:battleId/stats', method: 'GET', invoke: (c, req) => c.stats(req, '5') },
  { label: 'POST /api/battles', method: 'POST', invoke: (c, req) => c.initiate(req, INITIATE_BODY) },
  { label: 'PUT /api/battles/:battleId/accept', method: 'PUT', invoke: (c, req) => c.accept(req, '5') },
  { label: 'PUT /api/battles/:battleId/reject', method: 'PUT', invoke: (c, req) => c.reject(req, '5') },
  { label: 'PUT /api/battles/:battleId/end', method: 'PUT', invoke: (c, req) => c.end(req, '5', {}) },
];

const WRITE_ROUTES = ROUTES.filter((route) => route.method === 'POST' || route.method === 'PUT');

describe('battles: anonymous callers are refused with 401', () => {
  for (const route of ROUTES) {
    it(`${route.label} answers 401 without any credential`, async () => {
      const { service, calls } = recordingService();
      const controller = new BattlesController(service as never);

      const error = await refused(() => route.invoke(controller, request(null)));

      expect(error).toMatchObject({ status: 401, message: '未登录或登录已过期' });
      expect(calls).toEqual([]);
    });
  }
});

describe('battles: a student may not write, and may only read a battle they are in', () => {
  it('refuses every write to a student before any work', async () => {
    const { service, calls } = recordingService();
    const controller = new BattlesController(service as never);
    const student = request({ userId: 100, role: 'student', studentId: 1, classId: 1 });

    for (const route of WRITE_ROUTES) {
      expect(await refused(() => route.invoke(controller, student))).toMatchObject({
        status: 403,
        message: '无权限执行该操作',
      });
    }
    expect(calls).toEqual([]);
  });

  it('refuses the class search to a student too', async () => {
    const { service } = recordingService();
    const controller = new BattlesController(service as never);

    expect(
      await refused(() =>
        controller.searchClasses(request({ userId: 100, role: 'student', studentId: 1, classId: 1 }), undefined, undefined),
      ),
    ).toMatchObject({ status: 403 });
  });

  it('admits a student of a participating class to its list and stats, and refuses a bystander class', async () => {
    const service = realService();

    await service.assertClassAccess(actor({ userId: 100, role: 'student', studentId: 1, classId: 1 }), '1');
    await service.assertBattleAccess(actor({ userId: 100, role: 'student', studentId: 1, classId: 1 }), '5');

    expect(
      await refused(() => service.assertClassAccess(actor({ userId: 102, role: 'student', studentId: 3, classId: 3 }), '1')),
    ).toMatchObject({ status: 403 });
    expect(
      await refused(() => service.assertBattleAccess(actor({ userId: 102, role: 'student', studentId: 3, classId: 3 }), '5')),
    ).toMatchObject({ status: 403 });
    // POST /api/battles is a write role gate first: a student never reaches the scope check.
    expect(
      await refused(() => service.assertInitiatorClass(actor({ userId: 102, role: 'student', studentId: 3, classId: 3 }), '3')),
    ).toMatchObject({ status: 403 });
  });
});

describe('battles: writes belong to the participating teachers', () => {
  it('admits a teacher of either class and refuses a colleague', async () => {
    const service = realService();

    await service.assertBattleTeacher(actor({ userId: 7, role: 'teacher' }), '5');
    await service.assertBattleTeacher(actor({ userId: 8, role: 'teacher' }), '5');
    expect(await refused(() => service.assertBattleTeacher(actor({ userId: 9, role: 'teacher' }), '5'))).toMatchObject({
      status: 403,
      message: '无权限管理该对战',
    });
  });

  it('only lets a teacher open a battle from a class they teach', async () => {
    const service = realService();

    await service.assertInitiatorClass(actor({ userId: 7, role: 'teacher' }), '1');
    expect(await refused(() => service.assertInitiatorClass(actor({ userId: 9, role: 'teacher' }), '1'))).toMatchObject({
      status: 403,
    });
    expect(await refused(() => service.assertInitiatorClass(actor({ userId: 7, role: 'teacher' }), '999'))).toMatchObject({
      status: 404,
    });
  });

  it('lets staff admin through and reports an unknown battle as 404', async () => {
    const service = realService();

    await service.assertBattleTeacher(actor({ userId: 1, role: 'admin' }), '5');
    await service.assertBattleAccess(actor({ userId: 2, role: 'superadmin' }), '5');
    expect(await refused(() => service.assertBattleTeacher(actor({ userId: 7, role: 'teacher' }), '404'))).toMatchObject({
      status: 404,
    });
  });
});

describe('battles: the search route is a teacher/admin surface', () => {
  it('lets a teacher search and reaches the service', async () => {
    const { service, calls } = recordingService();
    const controller = new BattlesController(service as never);

    await controller.searchClasses(request({ userId: 7, role: 'teacher' }), '一', '1');
    expect(calls).toEqual(['searchClasses']);
  });
});
