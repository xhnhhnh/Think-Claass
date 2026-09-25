/**
 * Collaboration route authorization.
 *
 * The matrix calls this file "整族无鉴权": none of the 16 routes read the request actor, because
 * the pre-migration controllers never injected `Req`. This suite pins the three doors that
 * replaced that - 401 anonymous, 403 for a role the matrix does not list, and a scoped pass for the
 * roles it does - plus the parts a role check alone would not fix:
 *
 *   * `GET /api/task-tree/teacher/:classId`, the node writes and the quest routes are bound to the
 *     actor's own classes;
 *   * `GET /api/team-quests` with no `class_id` answers the actor's classes, not the whole table,
 *     and `GET /api/team-quests/progress` does the same for students;
 *   * `GET /api/peer-reviews` returns only the rows the actor is party to;
 *   * `POST /api/peer-reviews` signs the review with the caller - `reviewer_id` came from the body;
 *   * `POST /api/team-quests` signs the quest with the caller's class teacher, not the body's
 *     `teacher_id`.
 *
 * The controllers are constructed directly and the request is the object the kernel's middleware
 * leaves behind, so `getRequestContext` is the real one. The service is a fake: what is under test
 * is the gate, the scope call and the derivation, not the SQL.
 */

import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@thinkclass/kernel';

import {
  PeerReviewsController,
  TaskTreeController,
  TeamQuestsController,
} from '../../plugins/collaboration/src/collaboration.controllers.js';

type Actor = { userId: number; role: string; studentId?: number };

function fakeRequest(actor: Actor | null): Request {
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
    scopedClassIds: vi.fn(async () => [3]),
    scopedStudentIds: vi.fn(async () => [101, 102]),
    ownStudentId: vi.fn(async () => 101),
    classTeacherId: vi.fn(async () => 5),
    assertClassAccess: vi.fn(async (_actor: unknown, id: unknown) => Number(id)),
    assertStudentAccess: vi.fn(async (_actor: unknown, id: unknown) => Number(id)),
    assertTeacherNodeAccess: vi.fn(async () => 3),
    assertTeamQuestAccess: vi.fn(async () => 3),
    listPeerReviewsFor: vi.fn(async () => [{ id: 1, reviewer_id: 101, reviewee_id: 102 }]),

    listTeacherNodes: vi.fn(async () => [{ id: 1 }]),
    createTeacherNode: vi.fn(async (input: Record<string, unknown>) => ({ id: 1, ...input })),
    updateTeacherNode: vi.fn(async () => undefined),
    deleteTeacherNode: vi.fn(async () => undefined),
    getStudentTree: vi.fn(async () => [{ id: 1, status: 'unlocked' }]),
    completeStudentNode: vi.fn(async () => undefined),
    listTeamQuests: vi.fn((_filter: Record<string, unknown>) => [{ id: 1 }]),
    createTeamQuest: vi.fn((input: Record<string, unknown>) => Number(input.class_id)),
    updateTeamQuest: vi.fn(),
    deleteTeamQuest: vi.fn(),
    listGroupProgress: vi.fn(async () => [{ group_id: null }]),
    getStudentCurrentQuest: vi.fn(async () => ({ quest: null })),
    listTeamQuestProgress: vi.fn(() => [{ id: 1 }]),
    addTeamQuestProgress: vi.fn(async () => 9),
    createPeerReview: vi.fn((input: Record<string, unknown>) => Number(input.reviewee_id)),
  };
}

const teacher = fakeRequest({ userId: 5, role: 'teacher' });
const student = fakeRequest({ userId: 9, role: 'student', studentId: 101 });
const parent = fakeRequest({ userId: 8, role: 'parent', studentId: 101 });
const admin = fakeRequest({ userId: 1, role: 'admin' });

// ---------------------------------------------------------------------------

describe('collaboration: anonymous callers get 401 on every route', () => {
  it('the task tree', async () => {
    const service = fakeService();
    const controller = new TaskTreeController(service as never);

    expect((await refuserOf(() => controller.listTeacherNodes(fakeRequest(null), '3'))).message).toBe('未登录或登录已过期');
    expect((await refuserOf(() => controller.createTeacherNode(fakeRequest(null), { class_id: 3, title: 't' }))).status).toBe(401);
    expect((await refuserOf(() => controller.updateTeacherNode(fakeRequest(null), '1', { title: 't' }))).status).toBe(401);
    expect((await refuserOf(() => controller.deleteTeacherNode(fakeRequest(null), '1'))).status).toBe(401);
    expect((await refuserOf(() => controller.getStudentTree(fakeRequest(null), '101'))).status).toBe(401);
    expect((await refuserOf(() => controller.completeStudentNode(fakeRequest(null), '101', '1'))).status).toBe(401);
    expect(service.createTeacherNode).not.toHaveBeenCalled();
    expect(service.completeStudentNode).not.toHaveBeenCalled();
  });

  it('team quests', async () => {
    const service = fakeService();
    const controller = new TeamQuestsController(service as never);

    expect((await refuserOf(() => controller.listTeamQuests(fakeRequest(null), { class_id: '3' }))).status).toBe(401);
    expect(
      (await refuserOf(() =>
        controller.createTeamQuest(fakeRequest(null), { class_id: 3, title: 't', target_score: 1, reward_points: 1 }),
      )).status,
    ).toBe(401);
    expect((await refuserOf(() => controller.updateTeamQuest(fakeRequest(null), '1', { status: 'active' }))).status).toBe(401);
    expect((await refuserOf(() => controller.deleteTeamQuest(fakeRequest(null), '1'))).status).toBe(401);
    expect((await refuserOf(() => controller.listGroupProgress(fakeRequest(null), { quest_id: '1', class_id: '3' }))).status).toBe(
      401,
    );
    expect((await refuserOf(() => controller.getStudentCurrentQuest(fakeRequest(null), { student_id: '101' }))).status).toBe(401);
    expect((await refuserOf(() => controller.listTeamQuestProgress(fakeRequest(null), {}))).status).toBe(401);
    expect(
      (await refuserOf(() => controller.addTeamQuestProgress(fakeRequest(null), { quest_id: 1, student_id: 101, contribution_score: 1 })))
        .status,
    ).toBe(401);
    expect(service.createTeamQuest).not.toHaveBeenCalled();
  });

  it('peer reviews', async () => {
    const service = fakeService();
    const controller = new PeerReviewsController(service as never);

    expect((await refuserOf(() => controller.listPeerReviews(fakeRequest(null), {}))).status).toBe(401);
    expect(
      (await refuserOf(() => controller.createPeerReview(fakeRequest(null), { reviewee_id: 102, assignment_id: 3, score: 5 })))
        .status,
    ).toBe(401);
    expect(service.createPeerReview).not.toHaveBeenCalled();
  });
});

describe('collaboration: roles the matrix does not list get 403', () => {
  it('the task tree is teacher/student only', async () => {
    const service = fakeService();
    const controller = new TaskTreeController(service as never);

    expect((await refuserOf(() => controller.listTeacherNodes(student, '3'))).status).toBe(403);
    expect((await refuserOf(() => controller.getStudentTree(admin, '101'))).status).toBe(403);
    expect((await refuserOf(() => controller.completeStudentNode(parent, '101', '1'))).status).toBe(403);
    expect((await refuserOf(() => controller.updateTeacherNode(parent, '1', {}))).status).toBe(403);
  });

  it('team quests are teacher/student only', async () => {
    const service = fakeService();
    const controller = new TeamQuestsController(service as never);

    expect((await refuserOf(() => controller.listTeamQuests(parent, {}))).status).toBe(403);
    expect((await refuserOf(() => controller.createTeamQuest(admin, { class_id: 3 }))).status).toBe(403);
    expect((await refuserOf(() => controller.listTeamQuestProgress(parent, {}))).status).toBe(403);
    expect((await refuserOf(() => controller.addTeamQuestProgress(parent, {}))).status).toBe(403);
  });

  it('peer reviews are teacher/student to read and student to write', async () => {
    const service = fakeService();
    const controller = new PeerReviewsController(service as never);

    expect((await refuserOf(() => controller.listPeerReviews(parent, {}))).status).toBe(403);
    expect(
      (await refuserOf(() => controller.createPeerReview(teacher, { reviewee_id: 102, score: 5, assignment_id: 3 }))).status,
    ).toBe(403);
    expect(service.createPeerReview).not.toHaveBeenCalled();
  });

  it('a class the actor does not own is a 403, not an empty list', async () => {
    const service = fakeService();
    service.assertClassAccess.mockRejectedValueOnce(new ApiError(403, '无权限执行该操作'));

    expect((await refuserOf(() => new TaskTreeController(service as never).listTeacherNodes(teacher, '99'))).status).toBe(403);

    service.assertStudentAccess.mockRejectedValueOnce(new ApiError(403, '无权限执行该操作'));
    expect(
      (await refuserOf(() => new TaskTreeController(service as never).getStudentTree(student, '999'))).status,
    ).toBe(403);

    service.assertTeamQuestAccess.mockRejectedValueOnce(new ApiError(403, '无权限执行该操作'));
    expect(
      (await refuserOf(() => new TeamQuestsController(service as never).updateTeamQuest(student, '1', {}))).status,
    ).toBe(403);
  });

  it('a student who owns no student row may not review', async () => {
    const service = fakeService();
    service.ownStudentId.mockResolvedValueOnce(null);

    expect(
      (await refuserOf(() =>
        new PeerReviewsController(service as never).createPeerReview(student, { reviewee_id: 102, score: 5, assignment_id: 3 }),
      )).status,
    ).toBe(403);
  });
});

describe('collaboration: reads are filtered by the actor scope', () => {
  it('answers the actor’s own classes when GET /api/team-quests names none', async () => {
    const service = fakeService();
    const controller = new TeamQuestsController(service as never);

    await controller.listTeamQuests(teacher, { status: 'active' });

    expect(service.scopedClassIds).toHaveBeenCalledTimes(1);
    expect(service.listTeamQuests).toHaveBeenCalledWith({ status: 'active', classIds: [3] });
  });

  it('checks the named class instead of replacing it', async () => {
    const service = fakeService();
    const controller = new TeamQuestsController(service as never);

    await controller.listTeamQuests(teacher, { class_id: '3', status: 'active' });

    expect(service.assertClassAccess).toHaveBeenCalledWith({ id: 5, role: 'teacher', studentId: undefined }, '3');
    expect(service.listTeamQuests).toHaveBeenCalledWith({ class_id: '3', status: 'active' });
  });

  it('answers the actor’s own roster when GET /api/team-quests/progress names no student', async () => {
    const service = fakeService();
    const controller = new TeamQuestsController(service as never);

    await controller.listTeamQuestProgress(teacher, { quest_id: '5' });

    expect(service.assertTeamQuestAccess).toHaveBeenCalledWith({ id: 5, role: 'teacher', studentId: undefined }, '5');
    expect(service.scopedStudentIds).toHaveBeenCalledTimes(1);
    expect(service.listTeamQuestProgress).toHaveBeenCalledWith({ quest_id: '5', studentIds: [101, 102] });
  });

  it('scopes the peer-review read to the actor’s students', async () => {
    const service = fakeService();
    const controller = new PeerReviewsController(service as never);

    const result = await controller.listPeerReviews(student, { assignment_id: '3' });

    expect(result).toEqual({ success: true, data: [{ id: 1, reviewer_id: 101, reviewee_id: 102 }] });
    expect(service.listPeerReviewsFor).toHaveBeenCalledWith({ id: 9, role: 'student', studentId: 101 }, { assignment_id: '3' });
  });
});

describe('collaboration: identity comes from the actor', () => {
  it('signs a new team quest with the calling teacher', async () => {
    const service = fakeService();
    const controller = new TeamQuestsController(service as never);

    await controller.createTeamQuest(teacher, {
      class_id: 3,
      // A forged signature is ignored, not validated.
      teacher_id: 999,
      title: '阅读挑战',
      target_score: 10,
      reward_points: 2,
    });

    expect(service.assertClassAccess).toHaveBeenCalledWith({ id: 5, role: 'teacher', studentId: undefined }, 3);
    expect(service.createTeamQuest).toHaveBeenCalledWith({
      class_id: 3,
      teacher_id: 5,
      title: '阅读挑战',
      target_score: 10,
      reward_points: 2,
    });
  });

  it('attributes a student’s team quest to the class’s own teacher', async () => {
    const service = fakeService();
    const controller = new TeamQuestsController(service as never);

    await controller.createTeamQuest(student, { class_id: 3, teacher_id: 999, title: 't', target_score: 1, reward_points: 1 });

    expect(service.classTeacherId).toHaveBeenCalledWith(3);
    expect(service.createTeamQuest).toHaveBeenCalledWith(
      expect.objectContaining({ teacher_id: 5, class_id: 3 }),
    );
  });

  it('signs a peer review with the calling student', async () => {
    const service = fakeService();
    const controller = new PeerReviewsController(service as never);

    const result = await controller.createPeerReview(student, {
      reviewer_id: 999,
      reviewee_id: 102,
      assignment_id: 3,
      score: 5,
    });

    expect(result).toEqual({ success: true, id: 102 });
    expect(service.ownStudentId).toHaveBeenCalledTimes(1);
    expect(service.createPeerReview).toHaveBeenCalledWith({
      reviewer_id: 101,
      reviewee_id: 102,
      assignment_id: 3,
      score: 5,
    });
  });
});

describe('collaboration: the allowed roles get through, with the legacy envelopes', () => {
  it('serves the task tree routes', async () => {
    const service = fakeService();
    const controller = new TaskTreeController(service as never);

    expect(await controller.listTeacherNodes(teacher, '3')).toEqual({ success: true, nodes: [{ id: 1 }] });
    expect(await controller.createTeacherNode(teacher, { class_id: 3, title: 't' })).toMatchObject({ success: true });
    expect(await controller.updateTeacherNode(teacher, '1', { title: 't' })).toEqual({ success: true });
    expect(await controller.deleteTeacherNode(teacher, '1')).toEqual({ success: true });
    expect(await controller.getStudentTree(parent, '101')).toEqual({
      success: true,
      nodes: [{ id: 1, status: 'unlocked' }],
    });
    expect(await controller.completeStudentNode(student, '101', '1')).toEqual({ success: true });
  });

  it('serves the team-quest routes', async () => {
    const service = fakeService();
    const controller = new TeamQuestsController(service as never);

    expect(await controller.listTeamQuests(student, { class_id: '3' })).toEqual({ success: true, data: [{ id: 1 }] });
    expect(await controller.updateTeamQuest(teacher, '1', { status: 'completed' })).toEqual({ success: true });
    expect(await controller.deleteTeamQuest(teacher, '1')).toEqual({ success: true });
    expect(await controller.listGroupProgress(student, { quest_id: '1', class_id: '3' })).toEqual({
      success: true,
      data: [{ group_id: null }],
    });
    expect(await controller.getStudentCurrentQuest(student, { student_id: '101' })).toEqual({
      success: true,
      quest: null,
    });
    expect(await controller.listTeamQuestProgress(student, { student_id: '101' })).toEqual({
      success: true,
      data: [{ id: 1 }],
    });
    expect(
      await controller.addTeamQuestProgress(student, { quest_id: 1, student_id: 101, contribution_score: 1 }),
    ).toEqual({ success: true, id: 9 });
  });

  it('serves the peer-review routes', async () => {
    const service = fakeService();
    const controller = new PeerReviewsController(service as never);

    expect(await controller.listPeerReviews(teacher, {})).toMatchObject({ success: true });
    expect(
      await controller.createPeerReview(student, { reviewee_id: 102, assignment_id: 3, score: 4 }),
    ).toEqual({ success: true, id: 102 });
  });

  it('leaves the legacy 400s to the service when a required field is absent', async () => {
    const service = fakeService();
    // The guards do not pre-empt the service's own validation: a missing class/student still
    // reaches it, so its documented 400 answers exactly as before.
    await new TeamQuestsController(service as never).createTeamQuest(teacher, {});
    expect(service.createTeamQuest).toHaveBeenCalledWith({});
    expect(service.assertClassAccess).not.toHaveBeenCalled();
  });
});
