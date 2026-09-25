/**
 * homework route authorization - the per-route proof at the layer that decides.
 *
 * Every one of this plugin's sixteen routes is `auth: "actor"` in its manifest, and this suite
 * asserts the controller gate for **each** of them:
 *
 *   - anonymous -> 401 `未登录或登录已过期`, and the service is *not reached* - so a refusal can
 *     never depend on a validation message coming first;
 *   - a role the route does not list -> 403 `无权限执行该操作`, likewise before the service;
 *   - every listed role reaches the service with the resolved actor as its **first argument**,
 *     which is what every scope and ownership rule in `homework.service.ts` is computed from.
 *
 * That last assertion is the one that matters most here and is the easiest to lose: the legacy
 * `assignments` plugin's student-submit route was gated to `teacher`, and its student page called
 * exactly that route - so the gate passed for the wrong role and the feature was dead in production
 * while its unit tests were green. `student` is therefore on the allowed list of the four
 * student-facing writes and *only* those, and `teacher` is on the grading writes and not on the
 * submitting ones.
 *
 * The controllers are constructed directly, as `tests/plugins/assignments-controllers.test.ts` does,
 * so no HTTP server is involved and the request is exactly the object the kernel's request-context
 * middleware would have left behind.
 */

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@thinkclass/kernel';

import { HomeworkController } from '../../plugins/homework/src/homework.controllers.js';

/** A request whose kernel context carries an actor, as the middleware would leave it. */
function fakeRequest(actor: { userId: number; role: string; studentId?: number; classId?: number } | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'session' : 'none' } } as unknown as Request;
}

/** The role -> actor mapping the kernel would resolve: students and parents carry their scope. */
const REQUESTS: Record<string, () => Request> = {
  teacher: () => fakeRequest({ userId: 7, role: 'teacher' }),
  admin: () => fakeRequest({ userId: 2, role: 'admin' }),
  superadmin: () => fakeRequest({ userId: 1, role: 'superadmin' }),
  student: () => fakeRequest({ userId: 8, role: 'student', studentId: 10, classId: 1 }),
  parent: () => fakeRequest({ userId: 9, role: 'parent', studentId: 10, classId: 1 }),
};

const ANONYMOUS = () => fakeRequest(null);

/** The service's public surface, each method returning a value the envelope can carry. */
function fakeService() {
  return {
    listHomeworks: vi.fn(() => []),
    listMyHomeworks: vi.fn(() => []),
    getHomework: vi.fn(() => ({ id: 1, questions: [] })),
    createHomework: vi.fn(() => ({ id: 1, questions: [] })),
    updateHomework: vi.fn(() => ({ id: 1, questions: [] })),
    deleteHomework: vi.fn(() => ({ deleted: true })),
    listSubmissions: vi.fn(() => []),
    getSubmission: vi.fn(() => ({ homework: { id: 1 }, submission: { id: 11 }, answers: [], photos: [] })),
    gradeSubmission: vi.fn(() => ({ homework: { id: 1 }, submission: { id: 11 }, answers: [], photos: [] })),
    saveAnswers: vi.fn(() => ({ homework: { id: 1 }, submission: { id: 11 }, answers: [], photos: [] })),
    submitAttempt: vi.fn(() => ({ homework: { id: 1 }, submission: { id: 11 }, answers: [], photos: [] })),
    uploadPhoto: vi.fn(() => ({ id: 3, storage_path: '/uploads/homework/a.jpg' })),
    startAttempt: vi.fn(() => ({ homework: { id: 1 }, submission: { id: 11 }, answers: [], photos: [] })),
    aiGrade: vi.fn(async () => []),
    generateQuestions: vi.fn(async () => ({ questions: [], skipped: 0, ai: { source: 'mock', available: false, confidence: 0, message: 'x' } })),
    listQa: vi.fn(() => ({ messages: [], ai: null })),
    askQa: vi.fn(async () => ({ messages: [], ai: null })),
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

/**
 * One entry per METHOD+PATH, in the manifest's declaration order.
 *
 * `forbidden` is written out rather than derived as "everyone not in `allowed`", because listing the
 * roles that must be refused is what makes the `parent` and `admin` cases visible: a parent may read
 * their own child's submission but not the class-wide list, and an admin is the mirror - on the
 * class-wide routes, absent from the per-student ones.
 */
function routeCases(service: FakeService): RouteCase[] {
  const controller = new HomeworkController(service as never);

  return [
    {
      label: 'GET /api/homework',
      run: (req) => controller.listHomeworks(req, '1'),
      method: 'listHomeworks',
      allowed: ['teacher', 'admin', 'superadmin', 'student'],
      forbidden: ['parent'],
    },
    {
      label: 'POST /api/homework',
      run: (req) => controller.createHomework(req, {} as never),
      method: 'createHomework',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'GET /api/homework/my',
      run: (req) => controller.listMyHomeworks(req),
      method: 'listMyHomeworks',
      allowed: ['student', 'parent'],
      forbidden: ['teacher', 'admin', 'superadmin'],
    },
    {
      label: 'GET /api/homework/:id',
      run: (req) => controller.getHomework(req, '1'),
      method: 'getHomework',
      allowed: ['teacher', 'admin', 'superadmin', 'student'],
      forbidden: ['parent'],
    },
    {
      label: 'PUT /api/homework/:id',
      run: (req) => controller.updateHomework(req, '1', {} as never),
      method: 'updateHomework',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'DELETE /api/homework/:id',
      run: (req) => controller.deleteHomework(req, '1'),
      method: 'deleteHomework',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'GET /api/homework/:id/submissions',
      run: (req) => controller.listSubmissions(req, '1'),
      method: 'listSubmissions',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'POST /api/homework/:id/ai-grade',
      run: (req) => controller.aiGrade(req, '1', {} as never),
      method: 'aiGrade',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      // 出题 is the one AI route with no `:id` and no student counterpart: it drafts questions for
      // the publish dialog, so the role gate is the same as authoring rather than the same as the
      // assistant routes below it.
      label: 'POST /api/homework/ai/questions',
      run: (req) => controller.generateQuestions(req, { topic: '分数' }),
      method: 'generateQuestions',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'GET /api/homework/:id/qa',
      run: (req) => controller.listQa(req, '1', {}),
      method: 'listQa',
      allowed: ['teacher', 'admin', 'superadmin', 'student', 'parent'],
      forbidden: [],
    },
    {
      label: 'POST /api/homework/:id/qa',
      run: (req) => controller.askQa(req, '1', { content: 'why' } as never),
      method: 'askQa',
      allowed: ['teacher', 'admin', 'superadmin', 'student', 'parent'],
      forbidden: [],
    },
    {
      label: 'POST /api/homework/:id/attempt',
      run: (req) => controller.startAttempt(req, '1'),
      method: 'startAttempt',
      allowed: ['student'],
      forbidden: ['teacher', 'admin', 'superadmin', 'parent'],
    },
    {
      label: 'GET /api/homework/submissions/:id',
      run: (req) => controller.getSubmission(req, '11'),
      method: 'getSubmission',
      allowed: ['teacher', 'admin', 'superadmin', 'student', 'parent'],
      forbidden: [],
    },
    {
      label: 'PUT /api/homework/submissions/:id',
      run: (req) => controller.gradeSubmission(req, '11', {} as never),
      method: 'gradeSubmission',
      allowed: ['teacher', 'admin', 'superadmin'],
      forbidden: ['student', 'parent'],
    },
    {
      label: 'PUT /api/homework/submissions/:id/answers',
      run: (req) => controller.saveAnswers(req, '11', {} as never),
      method: 'saveAnswers',
      allowed: ['student'],
      forbidden: ['teacher', 'admin', 'superadmin', 'parent'],
    },
    {
      label: 'POST /api/homework/submissions/:id/photos',
      run: (req) => controller.uploadPhoto(req, '11', undefined),
      method: 'uploadPhoto',
      allowed: ['student'],
      forbidden: ['teacher', 'admin', 'superadmin', 'parent'],
    },
    {
      label: 'POST /api/homework/submissions/:id/submit',
      run: (req) => controller.submitAttempt(req, '11', {} as never),
      method: 'submitAttempt',
      allowed: ['student'],
      forbidden: ['teacher', 'admin', 'superadmin', 'parent'],
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

describe('homework controllers: the 17 routes are gated', () => {
  it('covers every route the manifest declares', () => {
    // Non-vacuity: a route added to the controller but not to the table above would otherwise be
    // untested, and this is the only place that notices. 16 -> 17 in the AI round, when 出题 joined
    // as the only route without a `:id`.
    expect(routeCases(fakeService())).toHaveLength(17);
  });

  it('answers 401 to an anonymous caller on every route, before the service is reached', async () => {
    const service = fakeService();

    for (const route of routeCases(service)) {
      const error = await apiErrorOf(() => route.run(ANONYMOUS()));
      expect({ label: route.label, status: error.statusCode, message: error.message }).toEqual({
        label: route.label,
        status: 401,
        message: '未登录或登录已过期',
      });
      expect(service[route.method], route.label).not.toHaveBeenCalled();
    }
  });

  it('answers 403 to a known role the route does not list, before the service is reached', async () => {
    const service = fakeService();

    for (const route of routeCases(service)) {
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

  it('lets every listed role through and hands it the resolved actor first', async () => {
    const service = fakeService();

    for (const route of routeCases(service)) {
      service[route.method].mockClear();

      for (const role of route.allowed) {
        const response = (await route.run(REQUESTS[role]())) as { success: boolean };
        expect(response.success, `${route.label} (${role})`).toBe(true);
      }

      // The actor is the first argument of every service call. A handler that dropped it would be
      // unguarded in practice - the role gate answers "may this kind of user call this endpoint",
      // not "may this teacher touch this row", and only the service can tell the two apart.
      expect(service[route.method].mock.calls.length, route.label).toBe(route.allowed.length);
      route.allowed.forEach((role, index) => {
        expect(service[route.method].mock.calls[index][0], `${route.label} (${role})`).toMatchObject({
          id: expect.any(Number),
          role,
        });
      });
    }
  });

  it('reserves the four student writes for students alone', async () => {
    // Named separately from the table above because this is the defect the plugin exists to fix: a
    // teacher must not be able to submit a pupil's homework, and the pupil must be able to.
    const service = fakeService();
    const studentRoutes = routeCases(service).filter((route) => route.allowed.join() === 'student');

    expect(studentRoutes.map((route) => route.label)).toEqual([
      'POST /api/homework/:id/attempt',
      'PUT /api/homework/submissions/:id/answers',
      'POST /api/homework/submissions/:id/photos',
      'POST /api/homework/submissions/:id/submit',
    ]);
  });
});

describe('homework controllers: delegation and envelopes', () => {
  it('forwards the raw query and body so the service owns validation', async () => {
    const service = fakeService();
    const controller = new HomeworkController(service as never);
    const teacher = REQUESTS.teacher();
    const student = REQUESTS.student();

    await controller.listHomeworks(teacher, '3');
    expect(service.listHomeworks).toHaveBeenCalledWith(
      { id: 7, role: 'teacher', studentId: null, classId: null },
      '3',
    );

    await controller.createHomework(teacher, { class_id: 1, title: 'x' } as never);
    expect(service.createHomework).toHaveBeenCalledWith(
      { id: 7, role: 'teacher', studentId: null, classId: null },
      { class_id: 1, title: 'x' },
    );

    // The student's own id is never read from the body: the service takes it from the actor, which
    // is the whole reason a forged `student_id` cannot submit as someone else.
    await controller.submitAttempt(student, '11', { answers: [{ question_id: 1, value: { text: 'a' } }] } as never);
    expect(service.submitAttempt).toHaveBeenCalledWith(
      { id: 8, role: 'student', studentId: 10, classId: 1 },
      '11',
      { answers: [{ question_id: 1, value: { text: 'a' } }] },
    );

    await controller.uploadPhoto(student, '11', undefined);
    expect(service.uploadPhoto).toHaveBeenCalledWith(
      { id: 8, role: 'student', studentId: 10, classId: 1 },
      '11',
      undefined,
    );
  });

  it('answers `{ success, data }` and nothing else', async () => {
    // The legacy `assignments` plugin spread its payload into the envelope as well as nesting it -
    // `{ success, data: { id }, id }`. These routes are new, so there is no such history to keep, and
    // the manifest's `_envelope_note` says so. This pins the choice against a later "restore".
    const service = fakeService();
    const controller = new HomeworkController(service as never);
    const teacher = REQUESTS.teacher();

    const created = await controller.createHomework(teacher, { class_id: 1, title: 'x' } as never);
    expect(created).toEqual({ success: true, data: { id: 1, questions: [] } });
    expect(Object.keys(created).sort()).toEqual(['data', 'success']);

    const deleted = await controller.deleteHomework(teacher, '1');
    expect(deleted).toEqual({ success: true, data: { deleted: true } });
  });

  it('awaits the two async routes and returns the AI outcome inside a 200', async () => {
    // The whole point of the AI outcome shape: an unavailable provider is a success payload with a
    // message, not a thrown error, because the write the teacher asked for has already succeeded.
    const service = fakeService();
    const controller = new HomeworkController(service as never);
    const teacher = REQUESTS.teacher();

    service.aiGrade.mockResolvedValueOnce([
      { submission: { id: 11 }, answers: [], ai: { source: 'mock', available: false, confidence: null, message: '未配置模型' } },
    ] as never);

    const graded = (await controller.aiGrade(teacher, '1', { submission_ids: [11] } as never)) as {
      data: Array<{ ai: { available: boolean; message: string } }>;
    };
    expect(graded.data[0].ai.available).toBe(false);
    expect(graded.data[0].ai.message).toBe('未配置模型');

    service.askQa.mockResolvedValueOnce({ messages: [], ai: null } as never);
    expect(await controller.askQa(REQUESTS.student(), '1', { content: 'why' } as never)).toEqual({
      success: true,
      data: { messages: [], ai: null },
    });
  });
});
