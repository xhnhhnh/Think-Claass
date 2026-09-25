/**
 * `api/challenge` route authorization.
 *
 * Thirteen of the fourteen routes were anonymous before this batch: an unnamed caller could author
 * and delete world bosses, submit answers as any student (`{studentId}` in the body was taken at
 * face value), and attack a boss on any student's behalf. `GET /api/challenge/questions` already had
 * its student flag gate and is deliberately left alone - this suite asserts it was not re-gated
 * (an anonymous caller still gets the legacy question-bank answer).
 *
 * The role cases use a recording fake service (the gate must refuse before any work); the scope
 * cases use the *real* service over a repository/port double. `refused()` awaits whatever the
 * handler does, so a synchronous throw cannot escape the assertion.
 */

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ChallengeController } from '../../plugins/challenge/src/challenge.controllers.js';
import { ChallengeService } from '../../plugins/challenge/src/challenge.service.js';

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

/** One class (id 3, teacher 7) holding students 1 (login 100) and 2 (login 200). */
function realService() {
  const students = new Map([
    [1, { id: 1, classId: 3, userId: 100 }],
    [2, { id: 2, classId: 3, userId: 200 }],
  ]);
  const repository = {
    listQuestions: () => [],
    listBosses: () => [],
    getActiveBoss: () => null,
    createBoss: () => ({ id: 10 }),
    deleteBoss: () => ({ deleted: true }),
    getBoss: () => null,
  };
  const classroom = {
    async getStudentById(studentId: number) {
      return students.get(studentId) ?? null;
    },
    async getStudentByUserId(userId: number) {
      return [...students.values()].find((student) => student.userId === userId) ?? null;
    },
    async getClassById(classId: number) {
      return classId === 3 ? { id: 3, name: '一班', teacherId: 7, inviteCode: 'ABC' } : null;
    },
    async checkStudentFeature() {
      return { value: true as const };
    },
    async checkClassFeature() {
      return { value: true as const };
    },
  };
  return new ChallengeService(repository as never, classroom as never);
}

function recordingService() {
  const calls: string[] = [];
  const record = (name: string) =>
    vi.fn(async () => {
      calls.push(name);
      return {} as never;
    });
  const service = {
    getQuestions: vi.fn(async () => {
      calls.push('getQuestions');
      return [];
    }),
    submitAnswers: record('submitAnswers'),
    attackBoss: record('attackBoss'),
    getActiveBoss: record('getActiveBoss'),
    listBosses: vi.fn(() => {
      calls.push('listBosses');
      return [];
    }),
    createBoss: vi.fn(() => {
      calls.push('createBoss');
      return { id: 1 };
    }),
    deleteBoss: vi.fn(() => {
      calls.push('deleteBoss');
      return { deleted: true };
    }),
    assertActorCanReadQuestions: record('assertActorCanReadQuestions'),
    assertStudentAction: vi.fn(async () => {
      calls.push('assertStudentAction');
    }),
    assertClassAccess: vi.fn(async () => {
      calls.push('assertClassAccess');
    }),
  };
  return { service, calls };
}

const SUBMIT_BODY = { studentId: 1, answers: [{ questionId: 1, answer: 'A' }] };

const ROUTES: Array<{ label: string; invoke: (controller: ChallengeController, req: Request) => unknown }> = [
  { label: 'POST /api/challenge/submit', invoke: (c, req) => c.legacySubmit(req, SUBMIT_BODY) },
  { label: 'GET /api/challenge/boss/active/:classId', invoke: (c, req) => c.legacyActiveBoss(req, '3') },
  { label: 'POST /api/challenge/boss/:id/attack', invoke: (c, req) => c.legacyAttackBoss(req, '5', { studentId: 1 }) },
  { label: 'GET /api/challenge/boss', invoke: (c, req) => c.legacyListBosses(req) },
  { label: 'POST /api/challenge/boss', invoke: (c, req) => c.legacyCreateBoss(req, { name: 'Boss', hp: 100 }) },
  { label: 'DELETE /api/challenge/boss/:id', invoke: (c, req) => c.legacyDeleteBoss(req, '5') },
  { label: 'GET /api/challenge/students/:studentId/questions', invoke: (c, req) => c.questions(req, '1', '5') },
  { label: 'POST /api/challenge/students/:studentId/submissions', invoke: (c, req) => c.submissions(req, '1', { answers: [] }) },
  { label: 'GET /api/challenge/classes/:classId/bosses/active', invoke: (c, req) => c.activeBoss(req, '3') },
  { label: 'GET /api/challenge/bosses', invoke: (c, req) => c.bosses(req) },
  { label: 'POST /api/challenge/bosses', invoke: (c, req) => c.createBoss(req, { name: 'Boss', hp: 100 }) },
  { label: 'DELETE /api/challenge/bosses/:id', invoke: (c, req) => c.deleteBoss(req, '5') },
  { label: 'POST /api/challenge/bosses/:id/attacks', invoke: (c, req) => c.attackBoss(req, '5', { studentId: 1 }) },
];

const BOSS_WRITES = new Set([
  'POST /api/challenge/boss',
  'DELETE /api/challenge/boss/:id',
  'POST /api/challenge/bosses',
  'DELETE /api/challenge/bosses/:id',
]);

describe('challenge: anonymous callers are refused with 401', () => {
  for (const route of ROUTES) {
    it(`${route.label} answers 401 without any credential`, async () => {
      const { service, calls } = recordingService();
      const controller = new ChallengeController(service as never);

      const error = await refused(() => route.invoke(controller, request(null)));

      expect(error).toMatchObject({ status: 401, message: '未登录或登录已过期' });
      expect(calls).toEqual([]);
    });
  }
});

describe('challenge: boss authoring is teacher/admin only', () => {
  for (const route of ROUTES.filter((entry) => BOSS_WRITES.has(entry.label))) {
    it(`${route.label} answers 403 for a student`, async () => {
      const { service, calls } = recordingService();
      const controller = new ChallengeController(service as never);
      const student = request({ userId: 100, role: 'student', studentId: 1, classId: 3 });

      const error = await refused(() => route.invoke(controller, student));

      expect(error).toMatchObject({ status: 403, message: '无权限执行该操作' });
      expect(calls).toEqual([]);
    });
  }

  it('lets the global boss list through to a signed-in student', async () => {
    const { service, calls } = recordingService();
    const controller = new ChallengeController(service as never);
    const student = request({ userId: 100, role: 'student', studentId: 1, classId: 3 });

    await controller.bosses(student);
    await controller.legacyListBosses(student);
    expect(calls).toEqual(['listBosses', 'listBosses']);
  });
});

describe('challenge: a student may only answer and attack as themselves', () => {
  it('refuses a borrowed studentId on submit, submissions, attack and attacks', async () => {
    const controller = new ChallengeController(realService() as never);
    const student = request({ userId: 100, role: 'student', studentId: 1, classId: 3 });

    expect(await refused(() => controller.legacySubmit(student, { ...SUBMIT_BODY, studentId: 2 }))).toMatchObject({
      status: 403,
      message: '无权限使用该学生账号',
    });
    expect(await refused(() => controller.submissions(student, '2', { answers: [] }))).toMatchObject({ status: 403 });
    expect(await refused(() => controller.legacyAttackBoss(student, '5', { studentId: 2 }))).toMatchObject({ status: 403 });
    expect(await refused(() => controller.attackBoss(student, '5', { studentId: 2 }))).toMatchObject({ status: 403 });
    expect(await refused(() => controller.questions(student, '2', '5'))).toMatchObject({ status: 403 });
  });

  it("admits the student's own row, resolved through the port when no scope was resolved", async () => {
    const service = realService();

    await service.assertStudentAction(actor({ userId: 100, role: 'student' }), '1');
    expect(
      await refused(() => service.assertStudentAction(actor({ userId: 100, role: 'student' }), '2')),
    ).toMatchObject({ status: 403 });
  });

  it('lets the owning teacher act for a student and refuses a colleague', async () => {
    const service = realService();

    await service.assertStudentAction(actor({ userId: 7, role: 'teacher' }), '1');
    expect(await refused(() => service.assertStudentAction(actor({ userId: 8, role: 'teacher' }), '1'))).toMatchObject({
      status: 403,
    });
    expect(await refused(() => service.assertStudentAction(actor({ userId: 7, role: 'teacher' }), '999'))).toMatchObject({
      status: 404,
      message: 'Student not found',
    });
  });
});

describe('challenge: class scope', () => {
  it('admits the class teacher and a student in the class, refuses an outsider', async () => {
    const service = realService();

    await service.assertClassAccess(actor({ userId: 7, role: 'teacher' }), '3');
    await service.assertClassAccess(actor({ userId: 100, role: 'student', studentId: 1, classId: 3 }), '3');

    expect(await refused(() => service.assertClassAccess(actor({ userId: 9, role: 'teacher' }), '3'))).toMatchObject({
      status: 403,
      message: '无权限查看该班级',
    });
    expect(
      await refused(() => service.assertClassAccess(actor({ userId: 100, role: 'student', studentId: 1, classId: 9 }), '3')),
    ).toMatchObject({ status: 403 });
    expect(await refused(() => service.assertClassAccess(actor({ userId: 7, role: 'teacher' }), '999'))).toMatchObject({
      status: 404,
    });
  });
});

describe('challenge: GET /questions anonymous is refused and students are gated', () => {
  it('refuses an anonymous caller the legacy question list', async () => {
    // This used to assert the opposite, and the plugin's own comment explained why: the matrix
    // recorded the route as half-controlled - "a student is checked, other callers are not" - and
    // the guard was literally `if (actor && role === 'student')`. So *anonymous* fell through
    // untouched and the whole question bank answered 200 to anyone who asked. The e2e sweep found
    // it by asking every endpoint as an anonymous caller; the route is now a login gate.
    const { service, calls } = recordingService();
    const controller = new ChallengeController(service as never);

    await expect(controller.legacyQuestions(request(null), '5')).rejects.toThrow('未登录或登录已过期');
    expect(calls).toEqual([]);
  });

  it('keeps the student class-feature gate', async () => {
    const { service, calls } = recordingService();
    const controller = new ChallengeController(service as never);

    await controller.legacyQuestions(request({ userId: 100, role: 'student', studentId: 1 }), '5');
    expect(calls).toEqual(['assertActorCanReadQuestions', 'getQuestions']);
  });
});
