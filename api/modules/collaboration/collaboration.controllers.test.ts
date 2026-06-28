import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';
import { PeerReviewsController, TaskTreeController, TeamQuestsController } from './collaboration.controllers';

function expectHttpError(error: unknown, status: number, message: string) {
  expect(error).toBeInstanceOf(HttpException);
  const httpError = error as HttpException;
  expect(httpError.getStatus()).toBe(status);
  expect(httpError.getResponse()).toEqual({ success: false, message });
}

describe('Collaboration Nest controllers', () => {
  it('keeps task-tree success shapes and legacy task-tree fallback errors', () => {
    const controller = new TaskTreeController({
      listTeacherNodes: vi.fn().mockReturnValue([{ id: 1 }]),
      createTeacherNode: vi.fn().mockReturnValue({ id: 2 }),
      updateTeacherNode: vi.fn().mockReturnValue(undefined),
      deleteTeacherNode: vi.fn().mockImplementation(() => {
        throw new ApiError(400, '请先删除子节点');
      }),
      getStudentTree: vi.fn().mockReturnValue([{ id: 3, status: 'locked' }]),
      completeStudentNode: vi.fn().mockImplementation(() => {
        throw new Error('Task node not found');
      }),
    } as any);

    expect(controller.listTeacherNodes('9')).toEqual({ success: true, nodes: [{ id: 1 }] });
    expect(controller.createTeacherNode({ class_id: 9, title: 'Root' })).toEqual({ success: true, node: { id: 2 } });
    expect(controller.updateTeacherNode('2', { title: 'Updated' })).toEqual({ success: true });
    try {
      controller.deleteTeacherNode('2');
      throw new Error('Expected deleteTeacherNode to throw');
    } catch (error) {
      expectHttpError(error, 400, '请先删除子节点');
    }
    expect(controller.getStudentTree('7')).toEqual({ success: true, nodes: [{ id: 3, status: 'locked' }] });
    try {
      controller.completeStudentNode('7', '3');
      throw new Error('Expected completeStudentNode to throw');
    } catch (error) {
      expectHttpError(error, 500, 'Task node not found');
    }
  });

  it('keeps team quest response shapes and ApiError mapping', () => {
    const controller = new TeamQuestsController({
      listTeamQuests: vi.fn().mockReturnValue([{ id: 1 }]),
      createTeamQuest: vi.fn().mockReturnValue(2),
      updateTeamQuest: vi.fn().mockReturnValue(undefined),
      deleteTeamQuest: vi.fn().mockReturnValue(undefined),
      listTeamQuestProgress: vi.fn().mockReturnValue([{ id: 3 }]),
      listGroupProgress: vi.fn().mockReturnValue([{ group_name: 'A' }]),
      getStudentCurrentQuest: vi.fn().mockReturnValue({ quest: null }),
      addTeamQuestProgress: vi.fn().mockImplementation(() => {
        throw new ApiError(400, 'Missing or invalid contribution_score');
      }),
    } as any);

    expect(controller.listTeamQuests({ class_id: '1' })).toEqual({ success: true, data: [{ id: 1 }] });
    expect(controller.createTeamQuest({ class_id: 1, teacher_id: 2, title: 'Quest', target_score: 100, reward_points: 5 })).toEqual({
      success: true,
      id: 2,
    });
    expect(controller.updateTeamQuest('2', { status: 'completed' })).toEqual({ success: true });
    expect(controller.deleteTeamQuest('2')).toEqual({ success: true });
    expect(controller.listTeamQuestProgress({ quest_id: '2' })).toEqual({ success: true, data: [{ id: 3 }] });
    expect(controller.listGroupProgress({ quest_id: '2', class_id: '1' })).toEqual({ success: true, data: [{ group_name: 'A' }] });
    expect(controller.getStudentCurrentQuest({ student_id: '7' })).toEqual({ success: true, quest: null });
    try {
      controller.addTeamQuestProgress({ quest_id: 2, student_id: 7, contribution_score: 0 });
      throw new Error('Expected addTeamQuestProgress to throw');
    } catch (error) {
      expectHttpError(error, 400, 'Missing or invalid contribution_score');
    }
  });

  it('keeps peer review query/create response shapes', () => {
    const controller = new PeerReviewsController({
      listPeerReviews: vi.fn().mockReturnValue([{ id: 1 }]),
      createPeerReview: vi.fn().mockReturnValue(2),
    } as any);

    expect(controller.listPeerReviews({ reviewer_id: '1' })).toEqual({ success: true, data: [{ id: 1 }] });
    expect(controller.createPeerReview({ reviewer_id: 1, reviewee_id: 2, assignment_id: 3, score: 5 })).toEqual({
      success: true,
      id: 2,
    });
  });
});
