/**
 * Engagement route authorization.
 *
 * The 23 private routes of `plugins/engagement/src/engagement.controllers.ts` used to answer
 * anyone with a URL. This suite pins the doors that replaced that:
 *
 *   * anonymous -> **401** `未登录或登录已过期`, thrown before any service call;
 *   * known but not allowed -> **403** `无权限执行该操作`;
 *   * allowed -> the handler runs, and the identity columns it writes are the *actor's*.
 *
 * The last point is the one a role check alone does not prove, so each route that used to trust a
 * body/query id asserts what the service was handed instead:
 *
 *   `POST /api/class-announcements`  teacher_id  <- actor (body ignored)
 *   `POST /api/praises`              teacher_id  <- actor (body ignored)
 *   `GET  /api/redemption/my`        student id  <- actor (the `?studentId=` was an enumeration)
 *   `POST /api/messages`             sender_id/sender_role <- actor
 *   `GET|POST /api/family-tasks`     student/parent ids <- actor
 *   `GET|POST /api/lucky-draw/config` teacher id <- actor
 *   `POST /api/lucky-draw/draw`      student id  <- actor
 *   `POST /api/danmaku`              sender_name <- actor
 *
 * The controllers are constructed directly, as the neighbouring suites do; the request is the
 * object the kernel's middleware leaves behind, so `getRequestContext` is the real one. The service
 * is a fake: what is under test here is the gate and the derivation, not the SQL.
 *
 * `GET /api/announcements/active` is public **on purpose** (it is in the audit script's
 * `PUBLIC_BY_DESIGN`), and the last case proves it stayed that way.
 */

import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@thinkclass/kernel';

import {
  AnnouncementsController,
  CertificatesController,
  ClassAnnouncementsController,
  DanmakuController,
  FamilyTasksController,
  LuckyDrawController,
  MessagesController,
  PraisesController,
  RedemptionController,
} from '../../plugins/engagement/src/engagement.controllers.js';

type Actor = { userId: number; role: string; studentId?: number };

/** A request whose kernel context carries an actor, as the middleware would leave it. */
function fakeRequest(actor: Actor | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'session' : 'none' } } as unknown as Request;
}

/** The `@Res()` stand-in: `status()` returns the same object so `status(...).json(...)` works. */
function fakeResponse() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

const ANONYMOUS = { message: '未登录或登录已过期', status: 401 };
const FORBIDDEN = { message: '无权限执行该操作', status: 403 };

async function refuserOf(run: () => unknown): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected the call to throw, but it resolved');
}

/**
 * A service double that records every call.
 *
 * `assertClassAccess`/`assertStudentAccess` resolve, which is what "the actor owns this" means at
 * the controller's level; the tests that care about a refusal override them.
 */
function fakeService() {
  const service = {
    // scope
    scopedClassIds: vi.fn(async () => [3]),
    scopedStudentIds: vi.fn(async () => [7]),
    ownStudentId: vi.fn(async () => 7),
    classTeacherId: vi.fn(async () => 5),
    assertClassAccess: vi.fn(async (_actor: unknown, id: unknown) => Number(id)),
    assertStudentAccess: vi.fn(async (_actor: unknown, id: unknown) => Number(id)),
    displayNameOf: vi.fn(async () => '小明'),
    familyTaskQueryFor: vi.fn(async () => ({ studentId: 7 })),
    assertFamilyTaskAccess: vi.fn(async () => ({ student_id: 7 })),
    assertFamilyTaskOwner: vi.fn(async () => ({ parent_id: 8 })),
    getCertificatesFor: vi.fn(async () => [{ id: 1, student_id: 7, student_name: '小明' }]),
    classAnnouncementAuthor: vi.fn(() => 5),
    praiseAuthor: vi.fn(() => 5),

    // reads and writes
    getActiveAnnouncement: vi.fn(() => ({ id: 1, text: 'banner' })),
    getClassAnnouncements: vi.fn(() => [{ id: 1 }]),
    createClassAnnouncement: vi.fn((input: Record<string, unknown>) => ({ id: 1, ...input })),
    deleteClassAnnouncement: vi.fn(),
    getPraisesByClass: vi.fn(async () => [{ id: 1 }]),
    getPraisesByStudent: vi.fn(async () => [{ id: 2 }]),
    createPraise: vi.fn(async (input: Record<string, unknown>) => ({ id: 1, ...input })),
    deletePraise: vi.fn(),
    createCertificate: vi.fn((input: Record<string, unknown>) => ({ id: 1, ...input })),
    getRedemptionTickets: vi.fn(() => [{ id: 1, code: 'RED-1' }]),
    verifyRedemption: vi.fn(async () => ({ status: 200, body: { success: true, message: '核销成功' } })),
    getMessages: vi.fn(async () => [{ id: 1 }]),
    createMessage: vi.fn(async () => 11),
    getFamilyTasks: vi.fn(async () => [{ id: 1 }]),
    createFamilyTask: vi.fn(async (input: Record<string, unknown>) => ({ id: 1, ...input })),
    updateFamilyTask: vi.fn(async () => true),
    deleteFamilyTask: vi.fn(async () => true),
    getLuckyDrawConfig: vi.fn(async () => ({ configs: [{ id: 1 }], cost_points: 10 })),
    updateLuckyDrawConfig: vi.fn(async () => undefined),
    drawLuckyPrize: vi.fn(async () => ({ status: 200, body: { success: true, message: '恭喜' } })),
    getDanmakuMessages: vi.fn(async () => [{ id: 1 }]),
    createDanmakuMessage: vi.fn(async (input: Record<string, unknown>) => ({ id: 1, ...input })),
    cleanupDanmakuMessages: vi.fn(),
  };
  return service;
}

const teacher = fakeRequest({ userId: 5, role: 'teacher' });
const student = fakeRequest({ userId: 9, role: 'student', studentId: 7 });
const parent = fakeRequest({ userId: 8, role: 'parent', studentId: 7 });
const admin = fakeRequest({ userId: 1, role: 'admin' });

// ---------------------------------------------------------------------------

describe('engagement: anonymous callers get 401 on every private route', () => {
  it('class announcements', async () => {
    const service = fakeService();
    const controller = new ClassAnnouncementsController(service as never);

    expect((await refuserOf(() => controller.getClassAnnouncements(fakeRequest(null), '3'))).status).toBe(401);
    expect(
      (await refuserOf(() => controller.createClassAnnouncement(fakeRequest(null), { class_id: 3, title: 't', content: 'c' })))
        .message,
    ).toBe(ANONYMOUS.message);
    expect((await refuserOf(() => controller.deleteClassAnnouncement(fakeRequest(null), '1'))).status).toBe(401);
    expect(service.createClassAnnouncement).not.toHaveBeenCalled();
  });

  it('praises', async () => {
    const service = fakeService();
    const controller = new PraisesController(service as never);

    expect((await refuserOf(() => controller.getPraises(fakeRequest(null), '3'))).status).toBe(401);
    expect((await refuserOf(() => controller.getStudentPraises(fakeRequest(null), '7'))).status).toBe(401);
    expect(
      (await refuserOf(() => controller.createPraise(fakeRequest(null), { student_id: 7, content: 'c' }))).status,
    ).toBe(401);
    expect((await refuserOf(() => controller.deletePraise(fakeRequest(null), '1'))).status).toBe(401);
    expect(service.createPraise).not.toHaveBeenCalled();
  });

  it('certificates', async () => {
    const service = fakeService();
    const controller = new CertificatesController(service as never);

    expect((await refuserOf(() => controller.getCertificates(fakeRequest(null), undefined))).status).toBe(401);
    expect((await refuserOf(() => controller.createCertificate(fakeRequest(null), { student_id: 7, title: 't' }))).status).toBe(
      401,
    );
  });

  it('redemption, including the @Res() verify route', async () => {
    const service = fakeService();
    const controller = new RedemptionController(service as never);

    expect((await refuserOf(() => controller.getMyTickets(fakeRequest(null)))).status).toBe(401);

    const res = fakeResponse();
    await controller.verify(fakeRequest(null), { code: 'RED-1' }, res);
    expect(res.statusCode).toBe(401);
    // The same envelope the handler writes for its own 400/404/500 answers - not a thrown error.
    expect(res.body).toEqual({ success: false, message: '未登录或登录已过期' });
    expect(service.verifyRedemption).not.toHaveBeenCalled();
  });

  it('the message feed and its write', async () => {
    const service = fakeService();
    const controller = new MessagesController(service as never);

    expect((await refuserOf(() => controller.getMessages(fakeRequest(null), { classId: '3' }))).status).toBe(401);
    expect(
      (await refuserOf(() =>
        controller.createMessage(fakeRequest(null), { class_id: 3, content: 'c', type: 'TREE_HOLE' }),
      )).status,
    ).toBe(401);
  });

  it('family tasks', async () => {
    const service = fakeService();
    const controller = new FamilyTasksController(service as never);

    expect((await refuserOf(() => controller.getTasks(fakeRequest(null), { studentId: '7' }))).status).toBe(401);
    expect(
      (await refuserOf(() =>
        controller.createTask(fakeRequest(null), { student_id: 7, title: 't', points: 1 }),
      )).status,
    ).toBe(401);
    expect((await refuserOf(() => controller.updateTask(fakeRequest(null), '1', { status: 'approved' }))).status).toBe(401);
    expect((await refuserOf(() => controller.deleteTask(fakeRequest(null), '1'))).status).toBe(401);
  });

  it('the lucky draw, including the @Res() draw route', async () => {
    const service = fakeService();
    const controller = new LuckyDrawController(service as never);

    expect((await refuserOf(() => controller.getConfig(fakeRequest(null), undefined))).status).toBe(401);
    expect(
      (await refuserOf(() => controller.saveConfig(fakeRequest(null), { configs: new Array(9).fill({}) }))).status,
    ).toBe(401);

    const res = fakeResponse();
    await controller.draw(fakeRequest(null), { studentId: 7 }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, message: '未登录或登录已过期' });
    expect(service.drawLuckyPrize).not.toHaveBeenCalled();
  });

  it('danmaku', async () => {
    const service = fakeService();
    const controller = new DanmakuController(service as never);

    expect((await refuserOf(() => controller.getMessages(fakeRequest(null), '3'))).status).toBe(401);
    expect(
      (await refuserOf(() => controller.createMessage(fakeRequest(null), { class_id: 3, content: 'c' }))).status,
    ).toBe(401);
    expect((await refuserOf(() => controller.cleanup(fakeRequest(null)))).status).toBe(401);
  });
});

describe('engagement: the wrong role gets 403', () => {
  it('class announcements are for the class teacher and its students', async () => {
    const service = fakeService();
    const controller = new ClassAnnouncementsController(service as never);

    expect((await refuserOf(() => controller.getClassAnnouncements(parent, '3'))).status).toBe(403);
    // Only a teacher may publish, and only into a class they own.
    expect((await refuserOf(() => controller.createClassAnnouncement(student, { class_id: 3, title: 't', content: 'c' }))).message).toBe(
      FORBIDDEN.message,
    );
    // Deletion is the author's or an admin's.
    expect((await refuserOf(() => controller.deleteClassAnnouncement(student, '1'))).status).toBe(403);
  });

  it('praises: writing is teacher-only, and only for their own class', async () => {
    const service = fakeService();
    const controller = new PraisesController(service as never);

    expect((await refuserOf(() => controller.createPraise(student, { student_id: 7, content: 'c' }))).status).toBe(403);
    expect((await refuserOf(() => controller.deletePraise(parent, '1'))).status).toBe(403);

    // A teacher may not praise a student outside their classes: the scope check is the refusal.
    service.assertStudentAccess.mockRejectedValueOnce(new ApiError(403, '无权限执行该操作'));
    expect((await refuserOf(() => controller.createPraise(teacher, { student_id: 99, content: 'c' }))).status).toBe(403);
  });

  it('certificates: issuing is teacher/admin, reading is not', async () => {
    const service = fakeService();
    const controller = new CertificatesController(service as never);

    expect((await refuserOf(() => controller.createCertificate(student, { student_id: 7, title: 't' }))).status).toBe(403);

    // The scope refusal inside the legacy catch clause must stay a 403, not become the 500 that
    // clause turns every other error into.
    service.getCertificatesFor.mockRejectedValueOnce(new ApiError(403, '无权限执行该操作'));
    expect((await refuserOf(() => controller.getCertificates(student, '99'))).status).toBe(403);
  });

  it('redemption verification is teacher/admin; the ticket list is the student’s own', async () => {
    const service = fakeService();
    const controller = new RedemptionController(service as never);

    const res = fakeResponse();
    await controller.verify(student, { code: 'RED-1' }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, message: '无权限执行该操作' });

    expect((await refuserOf(() => controller.getMyTickets(parent))).status).toBe(403);
  });

  it('the lucky draw is the student’s own, and config is the class teacher’s', async () => {
    const service = fakeService();
    const controller = new LuckyDrawController(service as never);

    const res = fakeResponse();
    await controller.draw(teacher, { studentId: 7 }, res);
    expect(res.statusCode).toBe(403);

    // Reading the prize grid is the class's own: a parent is refused, a student is scoped to their
    // own class's teacher (the query parameter is ignored for them).
    expect((await refuserOf(() => controller.getConfig(parent, '5'))).status).toBe(403);
    expect((await refuserOf(() => controller.saveConfig(student, { configs: new Array(9).fill({}) }))).status).toBe(403);

    await controller.getConfig(student, '999');
    expect(service.scopedClassIds).toHaveBeenCalledTimes(1);
    expect(service.classTeacherId).toHaveBeenCalledWith(3);
    expect(service.getLuckyDrawConfig).toHaveBeenCalledWith(5);

    // A student with no class has no config to read.
    service.scopedClassIds.mockResolvedValueOnce([]);
    expect((await refuserOf(() => controller.getConfig(student, '999'))).status).toBe(403);
  });

  it('family tasks are the family’s, not any logged-in account’s', async () => {
    const service = fakeService();
    const controller = new FamilyTasksController(service as never);

    expect((await refuserOf(() => controller.getTasks(teacher, { studentId: '7' }))).status).toBe(403);
    expect(
      (await refuserOf(() => controller.createTask(teacher, { student_id: 7, title: 't', points: 1 }))).status,
    ).toBe(403);
    expect((await refuserOf(() => controller.updateTask(student, '1', { status: 'approved' }))).status).toBe(403);
    expect((await refuserOf(() => controller.deleteTask(teacher, '1'))).status).toBe(403);

    // A parent may only touch their own children's tasks.
    service.assertFamilyTaskAccess.mockRejectedValueOnce(new ApiError(403, '无权限执行该操作'));
    expect((await refuserOf(() => controller.updateTask(parent, '9', { status: 'approved' }))).status).toBe(403);
  });

  it('danmaku: reading is any logged-in class member, writing is student/teacher', async () => {
    const service = fakeService();
    const controller = new DanmakuController(service as never);

    expect((await refuserOf(() => controller.createMessage(admin, { class_id: 3, content: 'c' }))).status).toBe(403);
    // And an out-of-class reader is refused by the scope check, not merely logged in.
    service.assertClassAccess.mockRejectedValueOnce(new ApiError(403, '无权限执行该操作'));
    expect((await refuserOf(() => controller.getMessages(student, '99'))).status).toBe(403);
  });
});

describe('engagement: identity comes from the actor, never from the request', () => {
  it('stamps class announcements with the calling teacher', async () => {
    const service = fakeService();
    const controller = new ClassAnnouncementsController(service as never);

    await controller.createClassAnnouncement(teacher, {
      class_id: 3,
      // A forged signature in the body is ignored, not validated.
      teacher_id: 999,
      title: 't',
      content: 'c',
    });

    expect(service.assertClassAccess).toHaveBeenCalledWith({ id: 5, role: 'teacher', studentId: undefined }, 3);
    expect(service.createClassAnnouncement).toHaveBeenCalledWith({
      class_id: 3,
      teacher_id: 5,
      title: 't',
      content: 'c',
    });
  });

  it('stamps praises with the calling teacher and checks the student is theirs', async () => {
    const service = fakeService();
    const controller = new PraisesController(service as never);

    await controller.createPraise(teacher, { teacher_id: 999, student_id: 7, content: '很棒', color: 'bg-red-100' });

    expect(service.assertStudentAccess).toHaveBeenCalledWith({ id: 5, role: 'teacher', studentId: undefined }, 7);
    expect(service.createPraise).toHaveBeenCalledWith({
      teacher_id: 5,
      student_id: 7,
      content: '很棒',
      color: 'bg-red-100',
    });
  });

  it('answers GET /api/redemption/my with the actor’s tickets, ignoring ?studentId=', async () => {
    const service = fakeService();
    const controller = new RedemptionController(service as never);

    // The controller has no `studentId` parameter any more: the enumerable query is gone, not
    // merely checked.
    const result = await controller.getMyTickets(student);
    expect(result).toEqual({ success: true, tickets: [{ id: 1, code: 'RED-1' }] });
    expect(service.getRedemptionTickets).toHaveBeenCalledWith(7);
    expect(service.ownStudentId).toHaveBeenCalledTimes(1);

    // A student account with no roster row owns nothing and is refused.
    service.ownStudentId.mockResolvedValueOnce(null);
    expect((await refuserOf(() => controller.getMyTickets(student))).status).toBe(403);
  });

  it('stamps messages with the actor as sender and the actor’s class', async () => {
    const service = fakeService();
    const controller = new MessagesController(service as never);

    await controller.createMessage(student, {
      class_id: 3,
      sender_id: 999,
      sender_role: 'teacher',
      content: 'hi',
      type: 'TREE_HOLE',
      is_anonymous: true,
    });

    expect(service.assertClassAccess).toHaveBeenCalledWith({ id: 9, role: 'student', studentId: 7 }, 3);
    expect(service.createMessage).toHaveBeenCalledWith({
      class_id: 3,
      sender_id: 7,
      sender_role: 'student',
      content: 'hi',
      type: 'TREE_HOLE',
      is_anonymous: true,
    });
  });

  it('keeps a teacher’s reply signed by the teacher', async () => {
    const service = fakeService();
    const controller = new MessagesController(service as never);

    // The teacher's home-school reply is a live frontend flow (`TeacherCommunicationPage.tsx:95`),
    // so the route admits the teacher as well as the student the matrix names; both are bound the
    // same way - the sender is the actor and the class must be theirs.
    await controller.createMessage(teacher, { class_id: 3, sender_id: 7, content: 'reply', type: 'HOME_SCHOOL' });
    expect(service.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sender_id: 5, sender_role: 'teacher', class_id: 3 }),
    );

    // No parent flow posts a message, so a parent stays out.
    expect(
      (await refuserOf(() => controller.createMessage(parent, { class_id: 3, content: 'x', type: 'HOME_SCHOOL' }))).status,
    ).toBe(403);
  });

  it('derives the anonymity rule from the actor’s role, not the query', async () => {
    const service = fakeService();
    const controller = new MessagesController(service as never);

    await controller.getMessages(student, { classId: '3', type: 'TREE_HOLE', role: 'teacher' });
    expect(service.getMessages).toHaveBeenCalledWith(
      expect.objectContaining({ classId: '3', role: 'student', type: 'TREE_HOLE' }),
    );
  });

  it('narrows the message feed to the actor’s classes when none is named', async () => {
    const service = fakeService();
    const controller = new MessagesController(service as never);

    await controller.getMessages(teacher, { type: 'TREE_HOLE' });

    expect(service.scopedClassIds).toHaveBeenCalledTimes(1);
    expect(service.getMessages).toHaveBeenCalledWith(
      expect.objectContaining({ classIds: [3], role: 'teacher', type: 'TREE_HOLE' }),
    );
  });

  it('refuses a feed asked about a student the actor does not own', async () => {
    const service = fakeService();
    const controller = new MessagesController(service as never);

    expect((await refuserOf(() => controller.getMessages(student, { classId: '3', involvedId: '99' }))).status).toBe(403);
    expect(service.getMessages).not.toHaveBeenCalled();
  });

  it('binds the family-task read to the actor and the write to the parent', async () => {
    const service = fakeService();
    const controller = new FamilyTasksController(service as never);

    await controller.getTasks(student, { studentId: '999' });
    // The query is handed to the service for binding; the service answers with the actor's own id.
    expect(service.familyTaskQueryFor).toHaveBeenCalledWith({ id: 9, role: 'student', studentId: 7 }, { studentId: '999' });
    expect(service.getFamilyTasks).toHaveBeenCalledWith({ studentId: 7 });

    await controller.createTask(parent, { student_id: 7, parent_id: 999, title: '阅读', points: 3 });
    expect(service.assertStudentAccess).toHaveBeenCalledWith({ id: 8, role: 'parent', studentId: 7 }, 7);
    expect(service.createFamilyTask).toHaveBeenCalledWith({
      student_id: 7,
      parent_id: 8,
      title: '阅读',
      points: 3,
    });

    await controller.updateTask(teacher, '1', { status: 'approved' });
    expect(service.assertFamilyTaskAccess).toHaveBeenCalledTimes(1);

    await controller.deleteTask(parent, '1');
    expect(service.assertFamilyTaskOwner).toHaveBeenCalledTimes(1);
  });

  it('scopes the lucky-draw config to the calling teacher', async () => {
    const service = fakeService();
    const controller = new LuckyDrawController(service as never);

    await controller.getConfig(teacher, '999');
    expect(service.getLuckyDrawConfig).toHaveBeenCalledWith(5);

    await controller.saveConfig(teacher, { teacher_id: 999, cost_points: 10, configs: new Array(9).fill({}) });
    expect(service.updateLuckyDrawConfig).toHaveBeenCalledWith({
      teacher_id: 5,
      cost_points: 10,
      configs: new Array(9).fill({}),
    });

    // An admin may still name a teacher explicitly: the console is allowed to look anywhere.
    await controller.getConfig(admin, '999');
    expect(service.getLuckyDrawConfig).toHaveBeenLastCalledWith('999');
  });

  it('draws for the actor’s own student row, ignoring the body', async () => {
    const service = fakeService();
    const controller = new LuckyDrawController(service as never);

    const res = fakeResponse();
    await controller.draw(student, { studentId: 999 }, res);

    expect(service.ownStudentId).toHaveBeenCalledTimes(1);
    expect(service.drawLuckyPrize).toHaveBeenCalledWith(7);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, message: '恭喜' });
  });

  it('stamps danmaku with the actor’s display name, not the body’s', async () => {
    const service = fakeService();
    const controller = new DanmakuController(service as never);

    await controller.createMessage(student, { class_id: 3, sender_name: '张老师', content: '加油', color: '#fff' });

    expect(service.assertClassAccess).toHaveBeenCalledWith({ id: 9, role: 'student', studentId: 7 }, 3);
    expect(service.displayNameOf).toHaveBeenCalledTimes(1);
    expect(service.createDanmakuMessage).toHaveBeenCalledWith({
      class_id: 3,
      sender_name: '小明',
      content: '加油',
      color: '#fff',
    });

    await controller.createMessage(teacher, { class_id: 3, sender_name: '随便', content: '上课了' });
    expect(service.displayNameOf).toHaveBeenCalledTimes(2);
    expect(service.createDanmakuMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ sender_name: '小明', class_id: 3 }),
    );
  });
});

describe('engagement: the allowed roles get through, with the legacy envelopes', () => {
  it('serves the public banner to anyone', async () => {
    const service = fakeService();
    const controller = new AnnouncementsController(service as never);

    // Public by design (audit script `PUBLIC_BY_DESIGN`): no actor, still an answer.
    expect(controller.getActiveAnnouncement()).toEqual({ success: true, announcement: { id: 1, text: 'banner' } });
    expect(service.getActiveAnnouncement).toHaveBeenCalledTimes(1);
  });

  it('serves the class announcement, praise, certificate and danmaku reads', async () => {
    const service = fakeService();

    expect(await new ClassAnnouncementsController(service as never).getClassAnnouncements(teacher, '3')).toEqual({
      success: true,
      announcements: [{ id: 1 }],
    });
    expect(await new PraisesController(service as never).getPraises(student, '3')).toEqual({
      success: true,
      praises: [{ id: 1 }],
    });
    expect(await new PraisesController(service as never).getStudentPraises(parent, '7')).toEqual({
      success: true,
      praises: [{ id: 2 }],
    });
    expect(await new CertificatesController(service as never).getCertificates(parent, '7')).toEqual({
      success: true,
      certificates: [{ id: 1, student_id: 7, student_name: '小明' }],
    });
    expect(await new DanmakuController(service as never).getMessages(student, '3', '9')).toEqual({
      success: true,
      messages: [{ id: 1 }],
    });
  });

  it('serves the writes the frontend calls', async () => {
    const service = fakeService();

    expect(await new PraisesController(service as never).createPraise(teacher, { student_id: 7, content: 'c' })).toMatchObject({
      success: true,
    });
    expect(
      await new CertificatesController(service as never).createCertificate(teacher, { student_id: 7, title: 't' }),
    ).toMatchObject({ success: true });
    expect(
      await new MessagesController(service as never).createMessage(teacher, { class_id: 3, content: 'c', type: 'HOME_SCHOOL' }),
    ).toEqual({ success: true, message: 'Message sent successfully', id: 11 });
    expect(await new FamilyTasksController(service as never).getTasks(parent, {})).toEqual({
      success: true,
      tasks: [{ id: 1 }],
    });
    expect(await new DanmakuController(service as never).cleanup(teacher)).toEqual({ success: true });

    const res = fakeResponse();
    await new RedemptionController(service as never).verify(teacher, { code: 'RED-1' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, message: '核销成功' });
  });

  it('keeps the @Res() 400 for a missing verification code', async () => {
    const service = fakeService();
    const controller = new RedemptionController(service as never);

    const res = fakeResponse();
    await controller.verify(teacher, {}, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, message: '核销码不能为空' });
  });
});
