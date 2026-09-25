/**
 * `api/dungeon` route authorization.
 *
 * Every route here was anonymous before this batch: an unnamed caller could start, advance and
 * abandon any student's run and settle its rewards. The matrix rules them
 * `student（本人）/teacher（本班，只读）`, and that is what this suite pins:
 *
 *   - anonymous -> 401 `未登录或登录已过期`;
 *   - a teacher on a write -> 403 `无权限执行该操作` (read-only is the matrix's word);
 *   - a student acting on another student's row -> 403;
 *   - a teacher reading a student outside their classes -> 403.
 *
 * The role cases use a recording fake service (the gate must refuse before any work); the scope
 * cases use the *real* service over a small `classroom.public` double. `refused()` awaits whatever
 * the handler does, so a synchronous throw cannot escape the assertion.
 */

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';

import { DungeonController } from '../../plugins/dungeon/src/dungeon.controllers.js';
import { DungeonService } from '../../plugins/dungeon/src/dungeon.service.js';

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

/** A classroom with one class (teacher 7) and one student (row 1, login 100). */
function classroomDouble() {
  const students = new Map<number, { id: number; classId: number; userId: number }>([
    [1, { id: 1, classId: 3, userId: 100 }],
  ]);
  return {
    students,
    async getStudentById(studentId: number) {
      return students.get(studentId) ?? null;
    },
    async getStudentByUserId(userId: number) {
      return [...students.values()].find((student) => student.userId === userId) ?? null;
    },
    async listClassIdsByTeacher(teacherId: number) {
      return teacherId === 7 ? [3] : [];
    },
  } as unknown as ClassroomPort;
}

function realService() {
  return new DungeonService({} as never, classroomDouble(), () => 0.1);
}

function recordingService() {
  const calls: string[] = [];
  const record = (name: string) =>
    vi.fn(async () => {
      calls.push(name);
      return {} as never;
    });
  const service = {
    getRun: record('getRun'),
    startRun: record('startRun'),
    choose: record('choose'),
    abandon: record('abandon'),
    assertSelfStudent: vi.fn(async () => {
      calls.push('assertSelfStudent');
    }),
    assertStudentReadable: vi.fn(async () => {
      calls.push('assertStudentReadable');
    }),
  };
  return { service, calls };
}

const ROUTES: Array<{ label: string; invoke: (controller: DungeonController, req: Request) => unknown }> = [
  { label: 'GET /api/dungeon/students/:studentId/run', invoke: (c, req) => c.run(req, '1') },
  { label: 'POST /api/dungeon/students/:studentId/start', invoke: (c, req) => c.start(req, '1') },
  { label: 'POST /api/dungeon/students/:studentId/choices', invoke: (c, req) => c.choose(req, '1', { hpCost: 1 }) },
  { label: 'POST /api/dungeon/students/:studentId/abandon', invoke: (c, req) => c.abandon(req, '1') },
  { label: 'GET /api/dungeon/:studentId', invoke: (c, req) => c.legacyRun(req, '1') },
  { label: 'POST /api/dungeon/start/:studentId', invoke: (c, req) => c.legacyStart(req, '1') },
  { label: 'POST /api/dungeon/choice/:studentId', invoke: (c, req) => c.legacyChoice(req, '1', { hpCost: 1 }) },
  { label: 'POST /api/dungeon/abandon/:studentId', invoke: (c, req) => c.legacyAbandon(req, '1') },
];

/** The six acting routes: the four legacy aliases plus the two non-read `/students/:id` writes. */
const WRITE_ROUTES = ROUTES.slice(1, 4).concat(ROUTES.slice(5));

describe('dungeon: anonymous callers are refused with 401', () => {
  for (const route of ROUTES) {
    it(`${route.label} answers 401 without any credential`, async () => {
      const { service, calls } = recordingService();
      const controller = new DungeonController(service as never);

      const error = await refused(() => route.invoke(controller, request(null)));

      expect(error).toMatchObject({ status: 401, message: '未登录或登录已过期' });
      expect(calls).toEqual([]);
    });
  }
});

describe('dungeon: a teacher is read-only', () => {
  const teacher = request({ userId: 7, role: 'teacher' });

  for (const route of WRITE_ROUTES) {
    it(`${route.label} answers 403 for a teacher`, async () => {
      const { service, calls } = recordingService();
      const controller = new DungeonController(service as never);

      const error = await refused(() => route.invoke(controller, teacher));

      expect(error).toMatchObject({ status: 403, message: '无权限执行该操作' });
      expect(calls).toEqual([]);
    });
  }

  it('lets a teacher reach the scope check on a read route', async () => {
    const { service, calls } = recordingService();
    const controller = new DungeonController(service as never);

    await controller.run(teacher, '1');
    expect(calls).toEqual(['assertStudentReadable', 'getRun']);
  });
});

describe('dungeon: a student may only act on their own row', () => {
  it('refuses another student, on the acting and reading routes alike', async () => {
    const controller = new DungeonController(realService() as never);
    const student = request({ userId: 100, role: 'student', studentId: 1, classId: 3 });

    expect(await refused(() => controller.start(student, '2'))).toMatchObject({
      status: 403,
      message: '无权限使用该学生账号',
    });
    expect(await refused(() => controller.choose(student, '2', { hpCost: 1 }))).toMatchObject({ status: 403 });
    expect(await refused(() => controller.abandon(student, '2'))).toMatchObject({ status: 403 });
    expect(await refused(() => controller.legacyStart(student, '2'))).toMatchObject({ status: 403 });
    expect(await refused(() => controller.legacyChoice(student, '2', { hpCost: 1 }))).toMatchObject({ status: 403 });
    expect(await refused(() => controller.legacyAbandon(student, '2'))).toMatchObject({ status: 403 });
    expect(await refused(() => controller.run(student, '2'))).toMatchObject({ status: 403, message: '无权限查看该学生' });
    expect(await refused(() => controller.legacyRun(student, '2'))).toMatchObject({ status: 403 });
  });

  it("admits the student's own row, resolved through the port when no scope was resolved", async () => {
    const service = realService();

    await service.assertSelfStudent(actor({ userId: 100, role: 'student' }), '1');
    await service.assertStudentReadable(actor({ userId: 100, role: 'student' }), '1');
  });
});

describe('dungeon: teacher scope on a read', () => {
  it('admits the teacher of the student class and refuses a colleague', async () => {
    const service = realService();

    await service.assertStudentReadable(actor({ userId: 7, role: 'teacher' }), '1');
    expect(await refused(() => service.assertStudentReadable(actor({ userId: 8, role: 'teacher' }), '1'))).toMatchObject({
      status: 403,
      message: '无权限查看该学生',
    });
  });

  it('reports an unknown student as 404 for a teacher', async () => {
    const service = realService();
    expect(await refused(() => service.assertStudentReadable(actor({ userId: 7, role: 'teacher' }), '999'))).toMatchObject({
      status: 404,
      message: '学生未找到',
    });
  });
});
