import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';

const { dbMocks, featureMocks } = vi.hoisted(() => ({
  dbMocks: {
    all: vi.fn(),
    get: vi.fn(),
    prepare: vi.fn(),
    run: vi.fn(),
    transaction: vi.fn((fn: (...args: any[]) => unknown) => (...args: any[]) => fn(...args)),
  },
  featureMocks: {
    assertClassFeatureEnabled: vi.fn(),
    assertStudentFeatureEnabled: vi.fn(),
  },
}));

vi.mock('../../db.js', () => ({
  default: {
    prepare: dbMocks.prepare,
    transaction: dbMocks.transaction,
  },
  decrypt: (value: string) => value.replace(/^enc:/, ''),
}));

vi.mock('../../utils/classFeatures.js', () => ({
  assertClassFeatureEnabled: featureMocks.assertClassFeatureEnabled,
  assertStudentFeatureEnabled: featureMocks.assertStudentFeatureEnabled,
}));

import { CollaborationService } from './collaboration.service';

function mockPreparedStatement() {
  dbMocks.prepare.mockImplementation((sql: string) => ({
    all: (...args: unknown[]) => dbMocks.all(sql, ...args),
    get: (...args: unknown[]) => dbMocks.get(sql, ...args),
    run: (...args: unknown[]) => dbMocks.run(sql, ...args),
  }));
}

function expectApiError(fn: () => unknown, statusCode: number, message: string) {
  try {
    fn();
    throw new Error('Expected function to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(statusCode);
    expect((error as ApiError).message).toBe(message);
  }
}

describe('CollaborationService', () => {
  let service: CollaborationService;

  beforeEach(() => {
    Object.values(dbMocks).forEach((mock) => mock.mockReset());
    Object.values(featureMocks).forEach((mock) => mock.mockReset());
    dbMocks.transaction.mockImplementation((fn: (...args: any[]) => unknown) => (...args: any[]) => fn(...args));
    mockPreparedStatement();
    service = new CollaborationService();
  });

  it('keeps task-tree teacher and student behavior', () => {
    dbMocks.all.mockReturnValueOnce([{ id: 1, class_id: 9 }]);
    expect(service.listTeacherNodes('9')).toEqual([{ id: 1, class_id: 9 }]);
    expect(featureMocks.assertClassFeatureEnabled).toHaveBeenCalledWith(9, 'enable_task_tree');

    expectApiError(() => service.createTeacherNode({ class_id: 9 }), 400, 'Missing required fields');

    dbMocks.run.mockReturnValueOnce({ lastInsertRowid: 2 });
    dbMocks.all.mockReturnValueOnce([{ id: 7 }]);
    dbMocks.get.mockReturnValueOnce({ id: 2, title: 'Root' });
    expect(service.createTeacherNode({ class_id: 9, title: 'Root' })).toEqual({ id: 2, title: 'Root' });

    dbMocks.get.mockReturnValueOnce(undefined);
    expectApiError(() => service.updateTeacherNode('99', { title: 'Nope' }), 404, 'Task node not found');

    dbMocks.get.mockReturnValueOnce({ class_id: 9 }).mockReturnValueOnce({ id: 3 });
    expectApiError(() => service.deleteTeacherNode('2'), 400, '请先删除子节点');

    dbMocks.get.mockReturnValueOnce({ class_id: 9 });
    dbMocks.all
      .mockReturnValueOnce([{ id: 10 }])
      .mockReturnValueOnce([{ id: 10, status: null }, { id: 11, status: 'completed' }]);
    expect(service.getStudentTree('7')).toEqual([
      { id: 10, status: 'locked' },
      { id: 11, status: 'completed' },
    ]);

    dbMocks.get.mockReturnValueOnce({ id: 10, title: 'Root', points_reward: 5 });
    dbMocks.all.mockReturnValueOnce([{ id: 12 }]);
    expect(service.completeStudentNode('7', '10')).toBeUndefined();
    expect(featureMocks.assertStudentFeatureEnabled).toHaveBeenCalledWith(7, 'enable_task_tree');
  });

  it('keeps team quest validation, fixed paths, aggregation, current quest, and progress upsert', () => {
    dbMocks.all.mockReturnValueOnce([{ id: 1 }]);
    expect(service.listTeamQuests({ class_id: '3', status: 'active' })).toEqual([{ id: 1 }]);
    expectApiError(() => service.listTeamQuests({ status: 'bad' }), 400, 'Invalid status');

    dbMocks.run.mockReturnValueOnce({ lastInsertRowid: 2 });
    expect(service.createTeamQuest({ class_id: 3, teacher_id: 4, title: 'Quest', target_score: 100, reward_points: 5 })).toBe(2);

    dbMocks.get.mockReturnValueOnce(undefined);
    expectApiError(() => service.updateTeamQuest('9', { status: 'active' }), 404, 'Team quest not found');

    dbMocks.get.mockReturnValueOnce({ id: 2, target_score: 100 });
    dbMocks.all.mockReturnValueOnce([{ group_id: null, group_name: null, contribution_score: 4 }]);
    expect(service.listGroupProgress({ quest_id: '2', class_id: '3' })).toEqual([
      { group_id: null, group_name: '未分组', contribution_score: 4, target_score: 100 },
    ]);

    dbMocks.get
      .mockReturnValueOnce({ id: 7, class_id: 3, group_id: 1 })
      .mockReturnValueOnce({ id: 2, class_id: 3 })
      .mockReturnValueOnce({ contribution_score: 2 })
      .mockReturnValueOnce({ contribution_score: 8 });
    dbMocks.all.mockReturnValueOnce([{ id: 7, name: 'enc:Ada' }]);
    expect(service.getStudentCurrentQuest({ student_id: '7' })).toEqual({
      quest: { id: 2, class_id: 3 },
      team: { class_id: 3, group_id: 1, members: [{ id: 7, name: 'Ada' }] },
      progress: { my_contribution_score: 2, team_contribution_score: 8 },
    });

    dbMocks.get.mockReturnValueOnce({ id: 2 }).mockReturnValueOnce({ id: 7 }).mockReturnValueOnce({ id: 20, contribution_score: 3 });
    expect(service.addTeamQuestProgress({ quest_id: 2, student_id: 7, contribution_score: 4 })).toBe(20);
  });

  it('keeps peer review filters and create validation', () => {
    dbMocks.all.mockReturnValueOnce([{ id: 1, reviewer_id: 7 }]);
    expect(service.listPeerReviews({ reviewer_id: '7' })).toEqual([{ id: 1, reviewer_id: 7 }]);
    expectApiError(() => service.listPeerReviews({ reviewer_id: 'x' }), 400, 'Invalid reviewer_id');
    expectApiError(() => service.createPeerReview({ reviewer_id: 1, reviewee_id: 2, score: 5 }), 400, 'assignment_id or team_quest_id is required');

    dbMocks.run.mockReturnValueOnce({ lastInsertRowid: 3 });
    expect(service.createPeerReview({ reviewer_id: 1, reviewee_id: 2, assignment_id: '4', score: 5, comment: 'good' })).toBe(3);
  });
});
