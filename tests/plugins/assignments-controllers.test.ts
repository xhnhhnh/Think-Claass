/**
 * Assignments / exams route authorization.
 *
 * The matrix (`docs/security/route-authorization-matrix.md`) records all fourteen routes of this
 * plugin as 无鉴权 at the baseline: `GET /api/assignments?class_id=` read any class's work,
 * `GET /api/exams/:id/grades` pulled a whole class's grade sheet, and every write was open. This
 * suite is the per-route proof of the fix at the layer that makes the decision:
 *
 *   - the controller gate, asserted for **every** route: anonymous -> 401
 *     (`未登录或登录已过期`), a role the 应属角色 column does not list -> 403
 *     (`无权限执行该操作`), and the service is *not reached* in either case - so a refusal can
 *     never depend on a validation message coming first;
 *   - the actor handover: each permitted role reaches the service with the resolved actor as its
 *     first argument, which is what the scope/ownership rules in `assignments.service.ts` are
 *     computed from (`assignments-service.test.ts` covers those rules themselves).
 *
 * The controllers are constructed directly, as `tests/plugins/classroom-authorization.test.ts`
 * does, so no HTTP server is involved and the request is exactly the object the kernel's
 * request-context middleware would have left behind.
 *
 * The `parent` role is the one that shows the matrix is being followed rather than a blanket
 * "logged in": it may read a per-student record (`student-assignments`, `student-exams`) but not
 * the class-wide assignment or exam lists. `admin` is the mirror case: it is on the class-wide
 * lists and the ownership-gated writes, but the matrix gives it no route into the two per-student
 * record reads, and it is refused there.
 */

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@thinkclass/kernel';

import { AssignmentsController, ExamsController } from '../../plugins/assignments/src/assignments.controllers.js';

/** A request whose kernel context carries an actor, as the middleware would leave it. */
function fakeRequest(actor: { userId: number; role: string; studentId?: number; classId?: number } | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'session' : 'none' } } as unknown as Request;
}

/** The role -> actor mapping the kernel would resolve: students/parents carry their scope. */
const REQUESTS: Record<string, () => Request> = {
  teacher: () => fakeRequest({ userId: 7, role: 'teacher' }),
  admin: () => fakeRequest({ userId: 2, role: 'admin' }),
  superadmin: () => fakeRequest({ userId: 1, role: 'superadmin' }),
  student: () => fakeRequest({ userId: 8, role: 'student', studentId: 10, classId: 1 }),
  parent: () => fakeRequest({ userId: 9, role: 'parent', studentId: 10, classId: 1 }),
};

const ANONYMOUS = () => fakeRequest(null);

/** The service's public surface, with each method returning a value the envelope can carry. */
function fakeService() {
  return {
    listAssignments: vi.fn(() => []),
    createAssignment: vi.fn(() => ({ id: 1 })),
    listStudentAssignments: vi.fn(() => []),
    updateStudentAssignment: vi.fn(() => ({ updated: true })),
    updateAssignment: vi.fn(() => ({ updated: true })),
    deleteAssignment: vi.fn(() => ({ deleted: true })),
    listExams: vi.fn(() => []),
    createExam: vi.fn(() => ({ id: 2 })),
    listStudentExams: vi.fn(() => []),
    updateStudentExam: vi.fn(() => ({ updated: true })),
    getGrades: vi.fn(() => ({ exam: { id: 2 }, grades: [] })),
    saveGrades: vi.fn(() => ({ saved: true })),
    updateExam: vi.fn(() => ({ updated: true })),
    deleteExam: vi.fn(() => ({ deleted: true })),
  };
}

type FakeService = ReturnType<typeof fakeService>;

interface RouteCase {
  label: string;
  run: (req: Request) => unknown;
  method: keyof FakeService;
  allowed: string[];
  forbidden: string[];
}

/** One entry per METHOD+PATH, in the plugin's declaration order. */
function routeCases(service: FakeService): RouteCase[] {
  const assignments = new AssignmentsController(service as never);
  const exams = new ExamsController(service as never);

  return [
    {
      label: 'GET /api/assignments',
      run: (req) => assignments.listAssignments(req, '1'),
      method: 'listAssignments',
      allowed: ['teacher', 'admin', 'superadmin', 'student'],
      forbidden: ['parent'],
    },
    {
      label: 'POST /api/assignments',
      run: (req) => assignments.createAssignment(req, {} as never),
      method: 'createAssignment',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'GET /api/assignments/student-assignments',
      run: (req) => assignments.listStudentAssignments(req, { student_id: '10' }),
      method: 'listStudentAssignments',
      allowed: ['teacher', 'student', 'parent'],
      forbidden: ['admin', 'superadmin'],
    },
    {
      label: 'PUT /api/assignments/student-assignments/:id',
      run: (req) => assignments.updateStudentAssignment(req, '1', { status: 'submitted' }),
      method: 'updateStudentAssignment',
      allowed: ['teacher'],
      forbidden: ['admin', 'superadmin', 'student', 'parent'],
    },
    {
      label: 'PUT /api/assignments/:id',
      run: (req) => assignments.updateAssignment(req, '1', { title: 't' } as never),
      method: 'updateAssignment',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'DELETE /api/assignments/:id',
      run: (req) => assignments.deleteAssignment(req, '1'),
      method: 'deleteAssignment',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'GET /api/exams',
      run: (req) => exams.listExams(req, '1'),
      method: 'listExams',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'POST /api/exams',
      run: (req) => exams.createExam(req, {} as never),
      method: 'createExam',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'GET /api/exams/student-exams',
      run: (req) => exams.listStudentExams(req, { student_id: '10' }),
      method: 'listStudentExams',
      allowed: ['teacher', 'student', 'parent'],
      forbidden: ['admin', 'superadmin'],
    },
    {
      label: 'PUT /api/exams/student-exams/:id',
      run: (req) => exams.updateStudentExam(req, '1', { score: 90 }),
      method: 'updateStudentExam',
      allowed: ['teacher'],
      forbidden: ['admin', 'superadmin', 'student', 'parent'],
    },
    {
      label: 'GET /api/exams/:id/grades',
      run: (req) => exams.getGrades(req, '2'),
      method: 'getGrades',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'PUT /api/exams/:id/grades',
      run: (req) => exams.saveGrades(req, '2', { grades: [{ student_id: 10, score: 90 }] }),
      method: 'saveGrades',
      allowed: ['teacher'],
      forbidden: ['admin', 'superadmin', 'student', 'parent'],
    },
    {
      label: 'PUT /api/exams/:id',
      run: (req) => exams.updateExam(req, '2', { title: 't' } as never),
      method: 'updateExam',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'DELETE /api/exams/:id',
      run: (req) => exams.deleteExam(req, '2'),
      method: 'deleteExam',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
  ];
}

async function apiErrorOf(run: () => unknown): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected the call to throw, but it resolved');
}

describe('assignments controllers: the 14 routes are gated', () => {
  it('answers 401 to an anonymous caller on every route, before the service is reached', async () => {
    const service = fakeService();
    const routes = routeCases(service);

    // Non-vacuity: the table must cover the whole surface the manifest declares.
    expect(routes).toHaveLength(14);

    for (const route of routes) {
      const error = await apiErrorOf(() => route.run(ANONYMOUS()));
      expect({ label: route.label, status: error.statusCode, message: error.message }).toEqual({
        label: route.label,
        status: 401,
        message: '未登录或登录已过期',
      });
      expect(service[route.method], route.label).not.toHaveBeenCalled();
    }
  });

  it('answers 403 to a known role the 应属角色 column does not list, on every route', async () => {
    const service = fakeService();
    const routes = routeCases(service);

    for (const route of routes) {
      for (const role of route.forbidden) {
        const error = await apiErrorOf(() => route.run(REQUESTS[role]()));
        expect({ label: route.label, role, status: error.statusCode, message: error.message }).toEqual({
          label: route.label,
          role,
          status: 403,
          message: '无权限执行该操作',
        });
        expect(service[route.method], `${route.label} (${role})`).not.toHaveBeenCalled();
      }
    }
  });

  it('lets every listed role through and hands it the resolved actor', async () => {
    const service = fakeService();
    const routes = routeCases(service);

    for (const route of routes) {
      service[route.method].mockClear();

      for (const role of route.allowed) {
        const response = (await route.run(REQUESTS[role]())) as { success: boolean };
        expect(response.success, `${route.label} (${role})`).toBe(true);
      }

      // The actor is the first argument of every service call - it is what the SQL scope and the
      // ownership checks are computed from, so a handler that dropped it would be unguarded in
      // practice even though the role gate passed.
      expect(service[route.method].mock.calls.length, route.label).toBe(route.allowed.length);
      route.allowed.forEach((role, index) => {
        expect(service[route.method].mock.calls[index][0], `${route.label} (${role})`).toMatchObject({
          id: expect.any(Number),
          role,
        });
      });
    }
  });
});

describe('assignments controllers: delegation', () => {
  it('forwards the raw query and body so the service owns validation', async () => {
    const service = fakeService();
    const assignments = new AssignmentsController(service as never);
    const exams = new ExamsController(service as never);
    const teacher = REQUESTS.teacher();

    await assignments.listAssignments(teacher, '3');
    // Raw strings: the service normalises them, exactly as it did before the gates existed.
    expect(service.listAssignments).toHaveBeenCalledWith({ id: 7, role: 'teacher', studentId: null, classId: null }, '3');

    await assignments.listStudentAssignments(teacher, { student_id: '10', assignment_id: '4' });
    expect(service.listStudentAssignments).toHaveBeenCalledWith(
      { id: 7, role: 'teacher', studentId: null, classId: null },
      { student_id: '10', assignment_id: '4' },
    );

    await assignments.createAssignment(teacher, { class_id: 1, teacher_id: 999, title: 'x' });
    // The body still reaches the service whole; it is the service that discards `teacher_id` in
    // favour of the actor (asserted in `assignments-service.test.ts`).
    expect(service.createAssignment).toHaveBeenCalledWith(
      { id: 7, role: 'teacher', studentId: null, classId: null },
      { class_id: 1, teacher_id: 999, title: 'x' },
    );

    await exams.saveGrades(teacher, '2', { grades: [{ student_id: 10, score: 90 }] });
    expect(service.saveGrades).toHaveBeenCalledWith({ id: 7, role: 'teacher', studentId: null, classId: null }, '2', [
      { student_id: 10, score: 90 },
    ]);

    await exams.updateStudentExam(teacher, '1', { score: 88 });
    expect(service.updateStudentExam).toHaveBeenCalledWith(
      { id: 7, role: 'teacher', studentId: null, classId: null },
      '1',
      { score: 88 },
    );
  });

  it('keeps the legacy envelopes, duplicate keys included', async () => {
    const service = fakeService();
    const assignments = new AssignmentsController(service as never);
    const exams = new ExamsController(service as never);
    const teacher = REQUESTS.teacher();

    expect(await assignments.createAssignment(teacher, { class_id: 1, teacher_id: 7, title: 'x' })).toEqual({
      success: true,
      data: { id: 1 },
      id: 1,
    });
    expect(await exams.getGrades(teacher, '2')).toEqual({
      success: true,
      data: { exam: { id: 2 }, grades: [] },
      exam: { id: 2 },
      grades: [],
    });
    expect(await assignments.deleteAssignment(teacher, '1')).toEqual({ success: true, data: { deleted: true } });
  });
});
