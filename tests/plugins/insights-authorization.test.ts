/**
 * `api/analytics` route authorization.
 *
 * The audit script already counted these three handlers as "guarded", because they resolve the
 * caller through `actorOf(req)` and pass it to the service - but that was a **false clean**: only the
 * two student-scoped routes actually refused, and `GET /api/analytics/classes/:classId/overview`
 * answered an anonymous caller with 200 and skipped the ownership branch entirely for every
 * non-teacher role. The gate is real now, and this suite pins it:
 *
 *   - anonymous -> 401 `未登录或登录已过期`, before any port call;
 *   - a known caller outside the matrix's scope -> 403;
 *   - `admin 任意；teacher 本班；parent 孩子；student 本人` for the class overview.
 */

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';

import { AnalyticsController } from '../../plugins/insights/src/insights.controllers.js';
import { InsightsService } from '../../plugins/insights/src/insights.service.js';

type Actor = { userId: number; role: string; studentId?: number; classId?: number };

function request(actor: Actor | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'bearer' : 'none' } } as unknown as Request;
}

async function refused(run: () => unknown): Promise<any> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to be refused, but it resolved');
}

const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, child() { return silentLogger; } };

/** A classroom double: class 1 is taught by teacher 7; student 1 (login 100) is in it. */
function realService() {
  const classroom = {
    async getClassReportInputs(classId: number) {
      return {
        class: classId === 1 ? { id: 1, name: '一班', teacher_id: 7 } : null,
        summary: {
          total_students: 1,
          average_points: 70,
          max_points: 70,
          min_points: 70,
          average_exam_score: 80,
          total_assignment_records: 0,
          submitted_assignment_records: 0,
          total_attendance_records: 0,
          present_records: 0,
          distribution: [],
          top_students: [],
        },
        exam_trend: [],
        assignment_trend: [],
      };
    },
    async getStudentByUserId(userId: number) {
      return userId === 100 ? { id: 1, classId: 1, userId: 100, name: '小明', totalPoints: 0, availablePoints: 0 } : null;
    },
    async listStudentsByParent(parentId: number) {
      return parentId === 30
        ? [{ id: 1, classId: 1, userId: 100, name: '小明', totalPoints: 0, availablePoints: 0 }]
        : [];
    },
    async listClassStudents() {
      return [];
    },
    async getStudentAccessView() {
      return null;
    },
  } as unknown as ClassroomPort;

  return new InsightsService({ ctx: { log: silentLogger } as never, classroom, engagement: () => null });
}

function recordingService() {
  const calls: string[] = [];
  const record = (name: string) =>
    vi.fn(async () => {
      calls.push(name);
      return {} as never;
    });
  const service = {
    getClassOverview: record('getClassOverview'),
    getStudentReport: record('getStudentReport'),
    getStudentRadar: record('getStudentRadar'),
  };
  return { service, calls };
}

const ROUTES: Array<{ label: string; invoke: (controller: AnalyticsController, req: Request) => unknown }> = [
  { label: 'GET /api/analytics/classes/:classId/overview', invoke: (c, req) => c.getClassOverview(req, '1') },
  { label: 'GET /api/analytics/students/:studentId/report', invoke: (c, req) => c.getStudentReport(req, '1') },
  { label: 'GET /api/analytics/students/:studentId/radar', invoke: (c, req) => c.getStudentRadar(req, '1') },
];

describe('insights: anonymous callers are refused with 401', () => {
  for (const route of ROUTES) {
    it(`${route.label} answers 401 without any credential`, async () => {
      const { service, calls } = recordingService();
      const controller = new AnalyticsController(service as never);

      const error = await refused(() => route.invoke(controller, request(null)));

      expect(error).toMatchObject({ status: 401, message: '未登录或登录已过期' });
      expect(calls).toEqual([]);
    });
  }

  it('passes a known caller through to the service, which owns the scope decision', async () => {
    const { service, calls } = recordingService();
    const controller = new AnalyticsController(service as never);

    await controller.getClassOverview(request({ userId: 7, role: 'teacher' }), '1');
    await controller.getStudentRadar(request({ userId: 100, role: 'student', studentId: 1, classId: 1 }), '1');
    expect(calls).toEqual(['getClassOverview', 'getStudentRadar']);
  });
});

describe('insights: the class overview is scoped per the matrix', () => {
  it('lets an admin read any class', async () => {
    const service = realService();
    for (const role of ['admin', 'superadmin']) {
      expect(await service.getClassOverview({ id: 1, role }, '1')).toMatchObject({ class: { id: 1 } });
    }
  });

  it('lets the owning teacher read their class and refuses a colleague', async () => {
    const service = realService();

    await service.getClassOverview({ id: 7, role: 'teacher' }, '1');
    expect(await refused(() => service.getClassOverview({ id: 8, role: 'teacher' }, '1'))).toMatchObject({
      status: 403,
      message: '无权限查看该班级分析',
    });
  });

  it('lets a student read their own class, resolved through the port, and refuses another', async () => {
    const service = realService();

    // No scope on the actor: the class comes from classroom.public by userId.
    await service.getClassOverview({ id: 100, role: 'student' }, '1');
    expect(await refused(() => service.getClassOverview({ id: 101, role: 'student' }, '1'))).toMatchObject({
      status: 403,
    });
  });

  it("lets a parent read a child's class and refuses an unrelated class", async () => {
    const service = realService();

    await service.getClassOverview({ id: 30, role: 'parent' }, '1');
    expect(await refused(() => service.getClassOverview({ id: 31, role: 'parent' }, '1'))).toMatchObject({ status: 403 });
  });

  it('refuses an unknown role rather than falling through to the report', async () => {
    const service = realService();

    expect(await refused(() => service.getClassOverview({ id: 5, role: 'guest' }, '1'))).toMatchObject({ status: 403 });
    expect(await refused(() => service.getClassOverview({ id: null, role: null }, '1'))).toMatchObject({ status: 403 });
  });
});
