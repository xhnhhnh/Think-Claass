/**
 * CollaborationService unit tests.
 *
 * Rewritten for the plugin world in P4.3b.3. The pre-migration test
 * (`api/modules/collaboration/collaboration.service.test.ts`) mocked the raw
 * `api/db.ts` connection and `api/utils/classFeatures.ts`; both are unreachable from a
 * plugin now, so this test fakes a *repository* (the plugin's own six tables) and a
 * *classroom port* (students, groups membership, the feature flags, the balance and the
 * shared ledger). That split is the migration's whole point, so the test asserts on it:
 * points move through `adjustPoints`, the ledger is appended through
 * `recordStudentLedgerEntry`, and `transferStudentCredits` is never called.
 *
 * The behavioural expectations are carried over from the pre-migration test: the same
 * validation messages, the same `未分组` bucket for students without a group, the same
 * `GROUP BY s.group_id, g.name ORDER BY g.name ASC` bucketing (NULLs first), and the
 * same `TASK_TREE_REWARD` ledger row with its `Completed task node: <title>` text.
 *
 * Two deliberate differences from the legacy behaviour are pinned below so they cannot
 * drift unnoticed:
 *   - a disabled task-tree flag answers 403 (the legacy task-tree translator flattened
 *     every gate failure into a 500);
 *   - a missing task node answers 500 `Task node not found`, which is the legacy answer
 *     and is preserved on purpose.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type {
  ClassroomPort,
  PointLedgerEntry,
  StudentSnapshot,
} from '@thinkclass/contracts/domains/classroom';
import { ApiError } from '@thinkclass/kernel';

import { createCollaborationRepository } from '../../plugins/collaboration/src/collaboration.repository.js';
import { CollaborationService } from '../../plugins/collaboration/src/collaboration.service.js';
import type {
  CollaborationRepository,
  GroupRow,
  PeerReviewFilter,
  PeerReviewInsert,
  PeerReviewRow,
  QuestProgressRow,
  TaskNodeRow,
  TaskNodeWithStatus,
  TeacherNodeInsert,
  TeacherNodeUpdate,
  TeamQuestFilter,
  TeamQuestInsert,
  TeamQuestProgressFilter,
  TeamQuestProgressRow,
  TeamQuestRow,
  TeamQuestTargetRow,
  TeamQuestUpdate,
} from '../../plugins/collaboration/src/collaboration.types.js';

const CLASS_ID = 9;

/** A `student_groups` row plus the class it belongs to (the table carries class_id). */
interface FakeGroupRow extends GroupRow {
  class_id: number;
}

class FakeCollaborationRepository implements CollaborationRepository {
  nodes = new Map<number, TaskNodeRow>();
  /** `${studentId}:${nodeId}` -> the row, mirroring UNIQUE(student_id, task_node_id). */
  studentNodes = new Map<string, { studentId: number; nodeId: number; status: string; completedAt: string | null }>();
  quests = new Map<number, TeamQuestRow>();
  progress = new Map<number, TeamQuestProgressRow>();
  reviews = new Map<number, PeerReviewRow>();
  groups: FakeGroupRow[] = [];

  nextNodeId = 100;
  nextQuestId = 200;
  nextProgressId = 300;
  nextReviewId = 400;

  // -- task tree -----------------------------------------------------------
  listTeacherNodes(classId: number) {
    return [...this.nodes.values()].filter((node) => node.class_id === classId);
  }
  insertTeacherNode(input: TeacherNodeInsert) {
    const id = this.nextNodeId++;
    this.nodes.set(id, { id, ...input, created_at: '2024-01-01 00:00:00' });
    return id;
  }
  getTeacherNode(nodeId: string | number) {
    return this.nodes.get(Number(nodeId)) ?? null;
  }
  getTeacherNodeClassId(nodeId: string | number) {
    return this.nodes.get(Number(nodeId))?.class_id ?? null;
  }
  updateTeacherNode(nodeId: string | number, input: TeacherNodeUpdate) {
    const node = this.nodes.get(Number(nodeId));
    if (!node) return;
    this.nodes.set(node.id, {
      ...node,
      title: input.title as string,
      description: (input.description ?? null) as string | null,
      points_reward: input.points_reward as number,
      x_pos: input.x_pos as number,
      y_pos: input.y_pos as number,
    });
  }
  hasChildNodes(nodeId: string | number) {
    return [...this.nodes.values()].some((node) => node.parent_node_id === Number(nodeId));
  }
  deleteTeacherNode(nodeId: string | number) {
    this.nodes.delete(Number(nodeId));
    for (const [key, row] of this.studentNodes) {
      if (row.nodeId === Number(nodeId)) this.studentNodes.delete(key);
    }
  }
  listRootNodeIds(classId: number) {
    return [...this.nodes.values()]
      .filter((node) => node.class_id === classId && node.parent_node_id === null)
      .map((node) => node.id);
  }
  listChildNodeIds(nodeId: string | number) {
    return [...this.nodes.values()].filter((node) => node.parent_node_id === Number(nodeId)).map((node) => node.id);
  }
  unlockNodesForStudents(studentIds: number[], nodeIds: number[]) {
    for (const studentId of studentIds) {
      for (const nodeId of nodeIds) {
        const key = `${studentId}:${nodeId}`;
        if (!this.studentNodes.has(key)) {
          this.studentNodes.set(key, { studentId, nodeId, status: 'unlocked', completedAt: null });
        }
      }
    }
  }
  completeStudentNode(studentId: number, nodeId: string | number) {
    this.studentNodes.set(`${studentId}:${Number(nodeId)}`, {
      studentId,
      nodeId: Number(nodeId),
      status: 'completed',
      completedAt: '2024-01-02 00:00:00',
    });
    for (const childId of this.listChildNodeIds(nodeId)) {
      const key = `${studentId}:${childId}`;
      if (!this.studentNodes.has(key)) {
        this.studentNodes.set(key, { studentId, nodeId: childId, status: 'unlocked', completedAt: null });
      }
    }
  }
  listStudentTree(studentId: number, classId: number): TaskNodeWithStatus[] {
    return [...this.nodes.values()]
      .filter((node) => node.class_id === classId)
      .map((node) => {
        const row = this.studentNodes.get(`${studentId}:${node.id}`);
        return { ...node, status: row?.status ?? null, completed_at: row?.completedAt ?? null };
      });
  }

  // -- team quests ---------------------------------------------------------
  listTeamQuests(filter: TeamQuestFilter) {
    return [...this.quests.values()]
      .filter((quest) => filter.classId === undefined || quest.class_id === filter.classId)
      .filter((quest) => filter.status === undefined || quest.status === filter.status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  getTeamQuest(questId: number) {
    return this.quests.get(questId) ?? null;
  }
  getTeamQuestTarget(questId: number, classId: number): TeamQuestTargetRow | null {
    const quest = this.quests.get(questId);
    return quest && quest.class_id === classId ? { id: quest.id, target_score: quest.target_score } : null;
  }
  getActiveTeamQuestForClass(classId: number) {
    return [...this.quests.values()].find((quest) => quest.class_id === classId && quest.status === 'active') ?? null;
  }
  insertTeamQuest(input: TeamQuestInsert) {
    const id = this.nextQuestId++;
    this.quests.set(id, {
      id,
      class_id: input.class_id,
      teacher_id: input.teacher_id,
      title: input.title,
      description: input.description,
      target_score: input.target_score,
      reward_points: input.reward_points,
      start_date: (input.start_date ?? null) as string | null,
      end_date: (input.end_date ?? null) as string | null,
      status: 'active',
      created_at: '2024-01-01 00:00:00',
    });
    return id;
  }
  updateTeamQuest(questId: number, input: TeamQuestUpdate) {
    const quest = this.quests.get(questId);
    if (!quest) return;
    this.quests.set(questId, {
      ...quest,
      title: input.title as string,
      description: input.description as string | null,
      target_score: input.target_score as number,
      reward_points: input.reward_points as number,
      start_date: input.start_date as string | null,
      end_date: input.end_date as string | null,
      status: input.status as string,
    });
  }
  deleteTeamQuest(questId: number) {
    this.quests.delete(questId);
    for (const [id, row] of this.progress) {
      if (row.quest_id === questId) this.progress.delete(id);
    }
  }
  listTeamQuestProgress(filter: TeamQuestProgressFilter) {
    return [...this.progress.values()]
      .filter((row) => filter.questId === undefined || row.quest_id === filter.questId)
      .filter((row) => filter.studentId === undefined || row.student_id === filter.studentId);
  }
  getStudentQuestProgress(questId: number, studentId: number): QuestProgressRow | null {
    const row = [...this.progress.values()].find(
      (entry) => entry.quest_id === questId && entry.student_id === studentId,
    );
    return row ? { id: row.id, contribution_score: row.contribution_score } : null;
  }
  listQuestProgressRows(questId: number) {
    return [...this.progress.values()].filter((row) => row.quest_id === questId);
  }
  addQuestProgressScore(progressId: number, score: number) {
    const row = this.progress.get(progressId)!;
    this.progress.set(progressId, { ...row, contribution_score: (row.contribution_score ?? 0) + score });
  }
  insertQuestProgress(questId: number, studentId: number, score: number) {
    const id = this.nextProgressId++;
    this.progress.set(id, {
      id,
      quest_id: questId,
      student_id: studentId,
      contribution_score: score,
      created_at: '2024-01-01 00:00:00',
    });
    return id;
  }

  // -- groups (read-only) --------------------------------------------------
  listGroupsForClass(classId: number) {
    return this.groups
      .filter((group) => group.class_id === classId)
      .map((group) => ({ id: group.id, name: group.name }));
  }

  // -- peer reviews --------------------------------------------------------
  listPeerReviews(filter: PeerReviewFilter) {
    return [...this.reviews.values()]
      .filter((row) => filter.reviewerId === undefined || row.reviewer_id === filter.reviewerId)
      .filter((row) => filter.revieweeId === undefined || row.reviewee_id === filter.revieweeId)
      .filter((row) => filter.assignmentId === undefined || row.assignment_id === filter.assignmentId)
      .filter((row) => filter.teamQuestId === undefined || row.team_quest_id === filter.teamQuestId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  insertPeerReview(input: PeerReviewInsert) {
    const id = this.nextReviewId++;
    this.reviews.set(id, { id, ...input, created_at: '2024-01-01 00:00:00' });
    return id;
  }
}

/**
 * A fake classroom: the student rows (including the `groupId` collaboration groups
 * team-quest progress by), the feature gates, the balance and the shared ledger live
 * here, exactly as they do behind the real port.
 */
class FakeClassroom implements ClassroomPort {
  /** Account-deletion scope (P4.3b.14): collaboration never asks for it; the port requires both. */
  async listClassIdsByTeacher() {
    return [];
  }

  async listStudentAccountsByClassIds() {
    return [];
  }

  students = new Map<number, StudentSnapshot>();
  /** `${classId}:${feature}` keys turned off. */
  disabledFeatures = new Set<string>();
  ledger: PointLedgerEntry[] = [];
  adjustments: Array<{ studentId: number; delta: number; reason: string; actorId: number }> = [];

  async getStudentById(studentId: number) {
    return this.students.get(studentId) ?? null;
  }
  async getStudentByUserId() {
    return null;
  }
  async getClassById(classId: number) {
    return classId === CLASS_ID ? { id: CLASS_ID, name: '一班', teacherId: 7, inviteCode: 'ABC' } : null;
  }
  async listClassStudents(classId: number) {
    return [...this.students.values()]
      .filter((student) => student.classId === classId)
      .sort((a, b) => a.id - b.id);
  }
  async searchClasses() {
    return [];
  }
  async assertStudentInClass(studentId: number, classId: number) {
    const student = this.students.get(studentId);
    if (!student || student.classId !== classId) throw new Error('not in class');
  }
  async adjustPoints(input: { studentId: number; delta: number; reason: string; actorId: number }) {
    const student = this.students.get(input.studentId);
    if (!student) throw new Error(`学生不存在: ${input.studentId}`);
    const next: StudentSnapshot = {
      ...student,
      totalPoints: student.totalPoints + input.delta,
      availablePoints: student.availablePoints + input.delta,
    };
    this.students.set(input.studentId, next);
    this.adjustments.push({ ...input });
    return { totalPoints: next.totalPoints, availablePoints: next.availablePoints };
  }
  async awardStudentPoints(input: { studentId: number; amount: number; type: string; description: string; actorId: number }) {
    const result = await this.adjustPoints({ studentId: input.studentId, delta: input.amount, reason: 'task_tree.reward', actorId: input.actorId });
    await this.recordStudentLedgerEntry({ studentId: input.studentId, type: input.type, amount: input.amount, description: input.description });
    return result;
  }
  async transferStudentCredits() {
    // collaboration awards task-tree points; it never spends credits. If this is ever
    // called the migration has changed the balance semantics, so fail loudly.
    throw new Error('collaboration must use adjustPoints, not transferStudentCredits');
  }
  async recordStudentLedgerEntry(entry: PointLedgerEntry) {
    this.ledger.push({ ...entry });
  }
  async listStudentLedger() {
    return [];
  }
  async sumClassPointsEarnedSince() {
    return 0;
  }
  async checkStudentFeature(studentId: number, feature: string) {
    const student = this.students.get(studentId);
    if (!student) return { refusal: { code: 'student-not-found' as const, message: '学生未找到' } };
    if (this.disabledFeatures.has(`${student.classId}:${feature}`)) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true as const };
  }
  async checkClassFeature(classId: number, feature: string) {
    if (classId !== CLASS_ID) return { refusal: { code: 'class-not-found' as const, message: '班级未找到' } };
    if (this.disabledFeatures.has(`${classId}:${feature}`)) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true as const };
  }
  async checkAnyClassFeature(classId: number, features: string[]) {
    if (classId !== CLASS_ID) return { refusal: { code: 'class-not-found' as const, message: '班级未找到' } };
    if (!features.some((feature) => !this.disabledFeatures.has(`${classId}:${feature}`))) {
      return { refusal: { code: 'feature-disabled' as const, message: '该功能当前已关闭' } };
    }
    return { value: true as const };
  }
}

function setup() {
  const repository = new FakeCollaborationRepository();
  const classroom = new FakeClassroom();

  // Class roster: two students in A组, one in B组, one ungrouped.
  classroom.students.set(101, { id: 101, classId: CLASS_ID, userId: 1, name: '小明', totalPoints: 0, availablePoints: 0, groupId: 1 });
  classroom.students.set(102, { id: 102, classId: CLASS_ID, userId: 2, name: '小红', totalPoints: 0, availablePoints: 0, groupId: 1 });
  classroom.students.set(103, { id: 103, classId: CLASS_ID, userId: 3, name: '小刚', totalPoints: 0, availablePoints: 0, groupId: 2 });
  classroom.students.set(104, { id: 104, classId: CLASS_ID, userId: 4, name: '小美', totalPoints: 0, availablePoints: 0, groupId: null });

  repository.groups = [
    { id: 1, class_id: CLASS_ID, name: 'B组' },
    { id: 2, class_id: CLASS_ID, name: 'A组' },
  ];

  // Root node with a reward, and one child.
  repository.nodes.set(1, {
    id: 1,
    class_id: CLASS_ID,
    title: 'Root',
    description: '',
    points_reward: 5,
    parent_node_id: null,
    x_pos: 0,
    y_pos: 0,
    created_at: '2024-01-01 00:00:00',
  });
  repository.nodes.set(2, {
    id: 2,
    class_id: CLASS_ID,
    title: 'Child',
    description: '',
    points_reward: 0,
    parent_node_id: 1,
    x_pos: 0,
    y_pos: 0,
    created_at: '2024-01-01 00:00:00',
  });

  repository.quests.set(5, {
    id: 5,
    class_id: CLASS_ID,
    teacher_id: 7,
    title: 'Quest',
    description: null,
    target_score: 100,
    reward_points: 5,
    start_date: null,
    end_date: null,
    status: 'active',
    created_at: '2024-01-01 00:00:00',
  });

  // 101 earned 2, 102 earned 3 and 1 across two rows (the table has no UNIQUE
  // constraint, and the pre-migration SUM counted both), 103 earned 7, 104 nothing.
  repository.insertQuestProgress(5, 101, 2);
  repository.insertQuestProgress(5, 102, 3);
  repository.insertQuestProgress(5, 102, 1);
  repository.insertQuestProgress(5, 103, 7);

  return {
    repository,
    classroom,
    service: new CollaborationService(repository, classroom),
  };
}

describe('CollaborationService task tree', () => {
  let repository: FakeCollaborationRepository;
  let classroom: FakeClassroom;
  let service: CollaborationService;

  beforeEach(() => {
    ({ repository, classroom, service } = setup());
  });

  it('gates teacher routes on the class flag and answers 403, not the legacy 500', async () => {
    classroom.disabledFeatures.add(`${CLASS_ID}:enable_task_tree`);

    await expect(service.listTeacherNodes(CLASS_ID)).rejects.toMatchObject({
      status: 403,
      message: '该功能当前已关闭',
    });

    // The gate runs before any read: nothing was listed and no write happened.
    expect(repository.nodes.size).toBe(2);
  });

  it('reports an unknown class as 404 through the class-scoped gate', async () => {
    await expect(service.listTeacherNodes(999)).rejects.toMatchObject({ status: 404, message: '班级未找到' });
  });

  it('creates a root node, unlocking it for every student in the class', async () => {
    const node = await service.createTeacherNode({ class_id: CLASS_ID, title: 'New root' });

    expect(node).toMatchObject({ id: 100, class_id: CLASS_ID, title: 'New root', points_reward: 0, x_pos: 0, y_pos: 0 });

    const unlocked = [...repository.studentNodes.values()].filter((row) => row.nodeId === 100);
    expect(unlocked.map((row) => row.studentId).sort((a, b) => a - b)).toEqual([101, 102, 103, 104]);
    expect(unlocked.every((row) => row.status === 'unlocked')).toBe(true);
  });

  it('does not unlock a child node for the class and rejects a missing title', async () => {
    await service.createTeacherNode({ class_id: CLASS_ID, title: 'Leaf', parent_node_id: 1 });

    expect([...repository.studentNodes.values()]).toEqual([]);
    await expect(service.createTeacherNode({ class_id: CLASS_ID })).rejects.toMatchObject({
      status: 400,
      message: 'Missing required fields',
    });
  });

  it('updates and deletes nodes, preserving the legacy validation answers', async () => {
    await service.updateTeacherNode('2', { title: 'Updated', description: 'd', points_reward: 3, x_pos: 1, y_pos: 2 });
    expect(repository.nodes.get(2)).toMatchObject({ title: 'Updated', points_reward: 3, x_pos: 1, y_pos: 2 });

    await expect(service.updateTeacherNode('999', { title: 'x' })).rejects.toMatchObject({
      status: 404,
      message: 'Task node not found',
    });

    await expect(service.deleteTeacherNode('1')).rejects.toMatchObject({ status: 400, message: '请先删除子节点' });
    await expect(service.deleteTeacherNode('999')).rejects.toMatchObject({
      status: 404,
      message: 'Task node not found',
    });

    await service.deleteTeacherNode('2');
    expect(repository.nodes.has(2)).toBe(false);
  });

  it('returns the student tree with locked defaults and unlocks the roots', async () => {
    repository.studentNodes.set('101:2', { studentId: 101, nodeId: 2, status: 'completed', completedAt: '2024-01-02' });

    const nodes = await service.getStudentTree('101');

    expect(nodes.map((node) => ({ id: node.id, status: node.status }))).toEqual([
      { id: 1, status: 'unlocked' },
      { id: 2, status: 'completed' },
    ]);
    expect(repository.studentNodes.get('101:1')?.status).toBe('unlocked');
  });

  it('gates the student tree on the student flag', async () => {
    classroom.disabledFeatures.add(`${CLASS_ID}:enable_task_tree`);

    await expect(service.getStudentTree('101')).rejects.toMatchObject({
      status: 403,
      message: '该功能当前已关闭',
    });
    await expect(service.getStudentTree('999')).rejects.toMatchObject({
      status: 404,
      message: '学生未找到',
    });
  });

  it('completes a node, paying through the port and appending the ledger', async () => {
    await service.completeStudentNode('101', '1');

    expect(repository.studentNodes.get('101:1')).toMatchObject({ status: 'completed' });
    // The child was unlocked in the same plugin-local transaction.
    expect(repository.studentNodes.get('101:2')?.status).toBe('unlocked');

    // adjustPoints moves both halves of the balance - the pre-migration two-column
    // UPDATE - and records the ledger with the legacy type and description text.
    expect(classroom.students.get(101)).toMatchObject({ totalPoints: 5, availablePoints: 5 });
    expect(classroom.adjustments).toEqual([
      { studentId: 101, delta: 5, reason: 'task_tree.reward', actorId: 0 },
    ]);
    expect(classroom.ledger).toEqual([
      { studentId: 101, type: 'TASK_TREE_REWARD', amount: 5, description: 'Completed task node: Root' },
    ]);
  });

  it('completes a zero-reward node without touching the balance', async () => {
    await service.completeStudentNode('101', '2');

    expect(repository.studentNodes.get('101:2')?.status).toBe('completed');
    expect(classroom.adjustments).toEqual([]);
    expect(classroom.ledger).toEqual([]);
  });

  it('keeps the legacy 500 for a node that does not exist', async () => {
    await expect(service.completeStudentNode('101', '999')).rejects.toMatchObject({
      status: 500,
      message: 'Task node not found',
    });
  });
});

describe('CollaborationService team quests', () => {
  let repository: FakeCollaborationRepository;
  let classroom: FakeClassroom;
  let service: CollaborationService;

  beforeEach(() => {
    ({ repository, classroom, service } = setup());
  });

  it('validates list filters and returns stored quests', () => {
    expect(service.listTeamQuests({ class_id: String(CLASS_ID), status: 'active' })).toHaveLength(1);
    expect(service.listTeamQuests({ class_id: String(CLASS_ID), status: 'completed' })).toEqual([]);
    expect(() => service.listTeamQuests({ class_id: 'x' })).toThrow(ApiError);
    expect(() => service.listTeamQuests({ status: 'bad' })).toThrow(
      new ApiError(400, 'Invalid status'),
    );
  });

  it('keeps create validation and returns the new id', () => {
    expect(() => service.createTeamQuest({ class_id: 9 })).toThrow(ApiError);
    expect(() => service.createTeamQuest({ class_id: 'x', teacher_id: 1, title: 't', target_score: 1, reward_points: 1 })).toThrow(ApiError);
    expect(() => service.createTeamQuest({ class_id: 9, teacher_id: 1, target_score: 1, reward_points: 1 })).toThrow(ApiError);
    expect(() => service.createTeamQuest({ class_id: 9, teacher_id: 1, title: 't', target_score: 0, reward_points: 1 })).toThrow(ApiError);
    expect(() => service.createTeamQuest({ class_id: 9, teacher_id: 1, title: 't', target_score: 1, reward_points: 0 })).toThrow(ApiError);

    expect(
      service.createTeamQuest({ class_id: 9, teacher_id: 7, title: 'Quest 2', target_score: 50, reward_points: 3 }),
    ).toBe(200);
  });

  it('updates only the fields present in the body and validates the rest', () => {
    service.updateTeamQuest('5', { status: 'completed' });

    expect(repository.quests.get(5)).toMatchObject({
      status: 'completed',
      title: 'Quest',
      target_score: 100,
      reward_points: 5,
    });

    expect(() => service.updateTeamQuest('999', { status: 'active' })).toThrow(
      new ApiError(404, 'Team quest not found'),
    );
    expect(() => service.updateTeamQuest('x', { status: 'active' })).toThrow(new ApiError(400, 'Invalid id'));
    expect(() => service.updateTeamQuest('5', { title: '  ' })).toThrow(new ApiError(400, 'Invalid title'));
    expect(() => service.updateTeamQuest('5', { target_score: 0 })).toThrow(new ApiError(400, 'Invalid target_score'));
    expect(() => service.updateTeamQuest('5', { reward_points: -1 })).toThrow(
      new ApiError(400, 'Invalid reward_points'),
    );
    expect(() => service.updateTeamQuest('5', { status: 'bad' })).toThrow(new ApiError(400, 'Invalid status'));
  });

  it('deletes a quest together with its progress rows', () => {
    expect(repository.progress.size).toBe(4);

    service.deleteTeamQuest('5');

    expect(repository.quests.has(5)).toBe(false);
    expect(repository.progress.size).toBe(0);
    expect(() => service.deleteTeamQuest('5')).toThrow(new ApiError(404, 'Team quest not found'));
  });

  it('filters progress and upserts contributions', async () => {
    expect(service.listTeamQuestProgress({ quest_id: '5', student_id: '101' })).toHaveLength(1);
    expect(() => service.listTeamQuestProgress({ quest_id: 'x' })).toThrow(new ApiError(400, 'Invalid quest_id'));
    expect(() => service.listTeamQuestProgress({ student_id: 'x' })).toThrow(new ApiError(400, 'Invalid student_id'));

    // Existing row: add in place and answer its id.
    expect(await service.addTeamQuestProgress({ quest_id: 5, student_id: 101, contribution_score: 4 })).toBe(
      [...repository.progress.values()].find((row) => row.student_id === 101)!.id,
    );
    expect([...repository.progress.values()].find((row) => row.student_id === 101)?.contribution_score).toBe(6);

    // New row for a student who had none.
    const created = await service.addTeamQuestProgress({ quest_id: 5, student_id: 104, contribution_score: 9 });
    expect(repository.progress.get(created)).toMatchObject({ student_id: 104, contribution_score: 9 });
  });

  it('keeps the legacy validation answers for progress writes', async () => {
    await expect(service.addTeamQuestProgress({ quest_id: 'x', student_id: 1, contribution_score: 1 })).rejects.toMatchObject(
      { status: 400, message: 'Missing or invalid quest_id' },
    );
    await expect(service.addTeamQuestProgress({ quest_id: 5, student_id: 'x', contribution_score: 1 })).rejects.toMatchObject(
      { status: 400, message: 'Missing or invalid student_id' },
    );
    await expect(service.addTeamQuestProgress({ quest_id: 5, student_id: 101, contribution_score: 0 })).rejects.toMatchObject(
      { status: 400, message: 'Missing or invalid contribution_score' },
    );
    await expect(service.addTeamQuestProgress({ quest_id: 999, student_id: 101, contribution_score: 1 })).rejects.toMatchObject(
      { status: 404, message: 'Team quest not found' },
    );
    await expect(service.addTeamQuestProgress({ quest_id: 5, student_id: 999, contribution_score: 1 })).rejects.toMatchObject(
      { status: 404, message: 'Student not found' },
    );
  });

  /**
   * The aggregate the pre-migration SQL expressed as one join over `students`,
   * `student_groups` and `team_quest_progress`. Group names come from the declared
   * `student_groups` read, membership and the roster from `classroom.public`, and the
   * ordering reproduces `ORDER BY g.name ASC` - SQLite sorts NULL first, so the
   * ungrouped bucket leads.
   */
  it('aggregates group progress with the ungrouped bucket first', async () => {
    const rows = await service.listGroupProgress({ quest_id: '5', class_id: String(CLASS_ID) });

    // Ordered by group NAME, not by group id: `A组` is id 2, `B组` is id 1, and SQLite
    // sorts NULL (the ungrouped bucket) ahead of both in an ascending sort.
    expect(rows).toEqual([
      { group_id: null, group_name: '未分组', contribution_score: 0, target_score: 100 },
      { group_id: 2, group_name: 'A组', contribution_score: 7, target_score: 100 },
      { group_id: 1, group_name: 'B组', contribution_score: 6, target_score: 100 },
    ]);

    await expect(service.listGroupProgress({ quest_id: 'x', class_id: '9' })).rejects.toMatchObject({
      status: 400,
      message: 'Invalid quest_id',
    });
    await expect(service.listGroupProgress({ quest_id: '5', class_id: 'x' })).rejects.toMatchObject({
      status: 400,
      message: 'Invalid class_id',
    });
    await expect(service.listGroupProgress({ quest_id: '999', class_id: '9' })).rejects.toMatchObject({
      status: 404,
      message: 'Team quest not found',
    });
  });

  it('returns the current quest with the team and both contribution totals', async () => {
    const grouped = await service.getStudentCurrentQuest({ student_id: '101' });

    expect(grouped.quest).toMatchObject({ id: 5, class_id: CLASS_ID });
    expect(grouped.team).toEqual({
      class_id: CLASS_ID,
      group_id: 1,
      members: [
        { id: 101, name: '小明' },
        { id: 102, name: '小红' },
      ],
    });
    expect(grouped.progress).toEqual({ my_contribution_score: 2, team_contribution_score: 6 });

    // An ungrouped student sees the whole class, exactly as the legacy null-group
    // branch did.
    const ungrouped = await service.getStudentCurrentQuest({ student_id: '104' });
    expect(ungrouped.team.group_id).toBeNull();
    expect(ungrouped.team.members.map((member) => member.id)).toEqual([101, 102, 103, 104]);
    expect(ungrouped.progress).toEqual({ my_contribution_score: 0, team_contribution_score: 13 });
  });

  it('answers {quest:null} when the class has no active quest', async () => {
    repository.quests.set(5, { ...repository.quests.get(5)!, status: 'completed' });

    expect(await service.getStudentCurrentQuest({ student_id: '101' })).toEqual({ quest: null });
  });

  it('validates the student id before lookup', async () => {
    await expect(service.getStudentCurrentQuest({ student_id: 'x' })).rejects.toMatchObject({
      status: 400,
      message: 'Invalid student_id',
    });
    await expect(service.getStudentCurrentQuest({ student_id: '999' })).rejects.toMatchObject({
      status: 404,
      message: 'Student not found',
    });
  });
});

describe('CollaborationService peer reviews', () => {
  let repository: FakeCollaborationRepository;
  let service: CollaborationService;

  beforeEach(() => {
    ({ repository, service } = setup());
  });

  it('filters peer reviews and rejects a bad filter', () => {
    service.createPeerReview({ reviewer_id: 101, reviewee_id: 102, assignment_id: 3, score: 5, comment: 'good' });

    expect(service.listPeerReviews({ reviewer_id: '101' })).toHaveLength(1);
    expect(service.listPeerReviews({ reviewee_id: '999' })).toEqual([]);
    expect(() => service.listPeerReviews({ reviewer_id: 'x' })).toThrow(new ApiError(400, 'Invalid reviewer_id'));
    expect(() => service.listPeerReviews({ reviewee_id: 'x' })).toThrow(new ApiError(400, 'Invalid reviewee_id'));
    expect(() => service.listPeerReviews({ assignment_id: 'x' })).toThrow(new ApiError(400, 'Invalid assignment_id'));
    expect(() => service.listPeerReviews({ team_quest_id: 'x' })).toThrow(new ApiError(400, 'Invalid team_quest_id'));
  });

  it('keeps create validation and stores the review', () => {
    expect(() => service.createPeerReview({ reviewer_id: 1, reviewee_id: 2, score: 5 })).toThrow(
      new ApiError(400, 'assignment_id or team_quest_id is required'),
    );
    expect(() => service.createPeerReview({ reviewer_id: 1, reviewee_id: 2, assignment_id: 3, score: 0 })).toThrow(
      new ApiError(400, 'Missing or invalid score'),
    );
    expect(() => service.createPeerReview({ reviewer_id: 'x', reviewee_id: 2, assignment_id: 3, score: 5 })).toThrow(
      new ApiError(400, 'Missing or invalid reviewer_id'),
    );
    expect(() => service.createPeerReview({ reviewer_id: 1, reviewee_id: 'x', assignment_id: 3, score: 5 })).toThrow(
      new ApiError(400, 'Missing or invalid reviewee_id'),
    );

    const id = service.createPeerReview({ reviewer_id: 101, reviewee_id: 102, team_quest_id: 5, score: 4, comment: '  ' });
    expect(repository.reviews.get(id)).toMatchObject({
      reviewer_id: 101,
      reviewee_id: 102,
      assignment_id: null,
      team_quest_id: 5,
      score: 4,
      comment: null,
    });
  });
});

/**
 * The repository is thin, but the ownership declaration is the security boundary, so it
 * is worth one test that the plugin's `DbApi` is what it actually reaches for - and that
 * it never touches `students`, `classes` or `records`, all of which moved behind the
 * port.
 */
describe('createCollaborationRepository', () => {
  it('touches only the tables collaboration declared', () => {
    const seen: string[] = [];
    const stub = {
      get: (sql: string) => {
        seen.push(sql);
        return undefined;
      },
      query: (sql: string) => {
        seen.push(sql);
        return [];
      },
      run: (sql: string) => {
        seen.push(sql);
        return { changes: 0, lastInsertRowid: 0 };
      },
      tx: <T>(fn: (tx: unknown) => T) => fn(stub),
      exec: () => {},
    };

    const repository = createCollaborationRepository(stub as never);
    repository.listTeacherNodes(9);
    repository.insertTeacherNode({
      class_id: 9,
      title: 'Root',
      description: '',
      points_reward: 0,
      parent_node_id: null,
      x_pos: 0,
      y_pos: 0,
    });
    repository.getTeacherNode(1);
    repository.getTeacherNodeClassId(1);
    repository.updateTeacherNode(1, { title: 't', description: 'd', points_reward: 1, x_pos: 0, y_pos: 0 });
    repository.hasChildNodes(1);
    repository.deleteTeacherNode(1);
    repository.listRootNodeIds(9);
    repository.listChildNodeIds(1);
    repository.unlockNodesForStudents([1], [1]);
    repository.completeStudentNode(1, 1);
    repository.listStudentTree(1, 9);

    repository.listTeamQuests({ classId: 9, status: 'active' });
    repository.getTeamQuest(1);
    repository.getTeamQuestTarget(1, 9);
    repository.getActiveTeamQuestForClass(9);
    repository.insertTeamQuest({
      class_id: 9,
      teacher_id: 7,
      title: 'Quest',
      description: null,
      target_score: 10,
      reward_points: 1,
      start_date: null,
      end_date: null,
    });
    repository.updateTeamQuest(1, {
      title: 't',
      description: null,
      target_score: 10,
      reward_points: 1,
      start_date: null,
      end_date: null,
      status: 'active',
    });
    repository.deleteTeamQuest(1);
    repository.listTeamQuestProgress({ questId: 1, studentId: 1 });
    repository.getStudentQuestProgress(1, 1);
    repository.listQuestProgressRows(1);
    repository.addQuestProgressScore(1, 2);
    repository.insertQuestProgress(1, 1, 2);

    repository.listGroupsForClass(9);

    repository.listPeerReviews({ reviewerId: 1, revieweeId: 2, assignmentId: 3, teamQuestId: 4 });
    repository.insertPeerReview({
      reviewer_id: 1,
      reviewee_id: 2,
      assignment_id: 3,
      team_quest_id: null,
      score: 5,
      comment: null,
    });

    const touched = new Set<string>();
    for (const sql of seen) {
      for (const match of sql.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/gi)) touched.add(match[1]);
    }

    expect([...touched].sort()).toEqual([
      'peer_reviews',
      'student_groups',
      'student_task_nodes',
      'task_nodes',
      'team_quest_progress',
      'team_quests',
    ]);
    expect([...touched]).not.toContain('students');
    expect([...touched]).not.toContain('classes');
    expect([...touched]).not.toContain('records');
  });
});
