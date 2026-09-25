/**
 * Collaboration service.
 *
 * Two storage boundaries meet here, and the difference is the point of the migration:
 *
 *   task_nodes, student_task_nodes, team_quests, team_quest_progress,
 *   peer_reviews                        owned by this plugin -> `ctx.db` (repository)
 *   student_groups                      read-only, declared in `data.reads`
 *   students, records                   owned by classroom    -> `classroom.public`
 *
 * The pre-migration service read `students` four different ways and wrote
 * `students.total_points`/`available_points` plus the shared `records` ledger
 * (`collaboration.service.ts:112-115`). All of that now goes through the port, so
 * `students` and `records` keep exactly one writer.
 *
 * ## Three things this migration changes on purpose, all reported to the Lead
 *
 * 1. **Task-tree feature gates answer 403/404, not 500.** The legacy task-tree helpers
 *    wrapped every gate failure in a `TaskTreeLegacyError`, which the controller turned
 *    into a 500 carrying the gate's message. The task brief for this migration says to
 *    map the port's refusals the way `economy.service.ts` does, so a disabled flag is
 *    403 `该功能当前已关闭` and a missing class/student is 404. The message text is
 *    unchanged; only the status moves. Team-quest and peer-review routes never had this
 *    wrapper, and their statuses are untouched.
 *
 * 2. **Feature gates are `checkClassFeature` / `checkStudentFeature`.** Resolution order
 *    (capability assignment, then the legacy `classes.enable_*` column) lives in
 *    classroom, so this plugin never imports `api/utils/classFeatures.ts`.
 *
 * 3. **The group-progress aggregate is composed in TypeScript.** The pre-migration SQL
 *    joined `students s LEFT JOIN student_groups g ON g.id = s.group_id LEFT JOIN
 *    team_quest_progress p ...` in one statement. `students` is classroom-owned, so the
 *    roster comes from `classroom.public.listClassStudents` (which now carries
 *    `groupId`) and this plugin supplies the group names and progress rows. Bucketing
 *    and ordering reproduce `GROUP BY s.group_id, g.name ORDER BY g.name ASC`.
 *
 * ## Atomicity, stated honestly
 *
 * The original `completeStudentNode` mutated `student_task_nodes`, `students` and
 * `records` inside one better-sqlite3 transaction. That is no longer possible: the port
 * writes through the classroom plugin, and a synchronous transaction cannot span an
 * `await`. The plugin-local half (mark the node completed, unlock its children) stays
 * one transaction and runs first; the reward follows. A failure before the reward
 * leaves the node completed and unpaid, and a retry pays it - the pre-migration code
 * paid on every call, so retrying is the recovery path either way. The ledger row makes
 * the paid half visible. Restoring true cross-plugin atomicity needs a kernel-level
 * unit of work, which is P6/P7 work (the same limitation economy and challenge
 * recorded).
 *
 * No route in this domain reads the request actor: the pre-migration controllers never
 * imported `Req`/`getRequestActor`, so there is nothing to translate and no
 * authorization was added.
 */

import type { ClassroomPort, ClassroomRefusal, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import { ApiError } from '@thinkclass/kernel';

import { isStaffAdmin, type RequestActor } from './collaboration.authorization.js';
import type {
  CollaborationRepository,
  PeerReviewFilter,
  PeerReviewInsert,
  PeerReviewRow,
  TeacherNodeInsert,
  TeacherNodeUpdate,
  TeamQuestFilter,
  TeamQuestInsert,
  TeamQuestProgressFilter,
  TeamQuestUpdate,
} from './collaboration.types.js';

/** The legacy flag every task-tree route resolves. */
const TASK_TREE_FEATURE = 'enable_task_tree';

/**
 * Map a refusal from the classroom port onto this domain's HTTP status.
 *
 * The port cannot throw the kernel's `ApiError` (contracts are type-only, guardrail
 * G6), so it returns a code and each caller decides. The statuses and messages are the
 * ones `api/utils/classFeatures.ts` produced before the migration:
 * `班级未找到` (404) for a missing class, `学生未找到` (404) for a missing student,
 * `该功能当前已关闭` (403) for a flag that is off.
 */
function toApiError(refusal: ClassroomRefusal): ApiError {
  switch (refusal.code) {
    case 'feature-disabled':
      return new ApiError(403, '该功能当前已关闭');
    case 'class-not-found':
      return new ApiError(404, '班级未找到');
    case 'student-not-found':
      return new ApiError(404, '学生未找到');
    default:
      return new ApiError(400, refusal.message);
  }
}

/**
 * A group bucket before the response mapper replaces the SQL NULL name with `未分组`.
 *
 * `group_name` is nullable here (and not on `GroupProgressRow`) because the
 * pre-migration `LEFT JOIN` produced NULL both for an ungrouped student and for a
 * student whose group row had been deleted.
 */
interface GroupBucket {
  group_id: number | null;
  group_name: string | null;
  contribution_score: number;
  target_score: number;
}

/**
 * Order group buckets the way `ORDER BY g.name ASC` did.
 *
 * SQLite places NULL first in an ascending sort, and `LEFT JOIN` produced NULL for both
 * "student has no group" and "group row was deleted"; the response then renders
 * `未分组`. Sorting in JavaScript compares UTF-16 code units where SQLite compares
 * UTF-8 bytes - identical for the BMP characters group names use, and worth stating
 * because it is a real (if theoretical) difference for astral-plane names.
 */
function compareGroupNames(a: GroupBucket, b: GroupBucket): number {
  if (a.group_name === b.group_name) return 0;
  if (a.group_name === null) return -1;
  if (b.group_name === null) return 1;
  return a.group_name < b.group_name ? -1 : 1;
}

/** `Number(value) || 0`, the coercion the pre-migration response mapper applied. */
function score(value: unknown): number {
  return Number(value) || 0;
}

export class CollaborationService {
  constructor(
    private readonly repository: CollaborationRepository,
    private readonly classroom: ClassroomPort,
  ) {}

  // -------------------------------------------------------------------------
  // Actor scope (route authorization)
  // -------------------------------------------------------------------------
  //
  // Every route is gated by `requireActorRole` in the controller (401/403) and then narrowed here.
  // The claim is always resolved through `classroom.public` - never from the URL, the body or
  // `actor.studentId` - because `students`/`classes` are classroom's tables and a forged body must
  // not be able to widen what an actor owns:
  //
  //   teacher  owns the classes whose `teacher_id` is their user id
  //   student  owns one student row (the one bound to their login) and that student's class
  //   parent   owns their linked children and those children's classes
  //   admin/superadmin own everything (the console)
  //
  // `null` from the two roster helpers means "unrestricted"; an empty array means "none", and the
  // two must not collapse - the first is the console, the second is an account with no claim.

  /** The classes the actor may name; `null` means every class (admin/superadmin). */
  async scopedClassIds(actor: RequestActor): Promise<number[] | null> {
    if (isStaffAdmin(actor)) return null;
    if (actor.id === null) return [];

    if (actor.role === 'teacher') return this.classroom.listClassIdsByTeacher(actor.id);

    if (actor.role === 'student') {
      const student = await this.classroom.getStudentByUserId(actor.id);
      return student ? [student.classId] : [];
    }

    if (actor.role === 'parent') {
      const children = await this.classroom.listStudentsByParent(actor.id);
      return [...new Set(children.map((child) => child.classId))];
    }

    return [];
  }

  /** The students the actor may name; `null` means every student (admin/superadmin). */
  async scopedStudentIds(actor: RequestActor): Promise<number[] | null> {
    if (isStaffAdmin(actor)) return null;
    if (actor.id === null) return [];

    if (actor.role === 'student') {
      const student = await this.classroom.getStudentByUserId(actor.id);
      return student ? [student.id] : [];
    }

    if (actor.role === 'parent') {
      return (await this.classroom.listStudentsByParent(actor.id)).map((child) => child.id);
    }

    if (actor.role === 'teacher') {
      const classIds = await this.classroom.listClassIdsByTeacher(actor.id);
      if (classIds.length === 0) return [];
      const accounts = await this.classroom.listStudentAccountsByClassIds(classIds);
      return accounts.map((account) => account.studentId);
    }

    return [];
  }

  /** The student row the actor's own login owns (student actors), or `null`. */
  async ownStudentId(actor: RequestActor): Promise<number | null> {
    if (actor.role !== 'student' || actor.id === null) return null;
    const student: StudentSnapshot | null = await this.classroom.getStudentByUserId(actor.id);
    return student ? student.id : null;
  }

  /** 403 unless the actor may name this class. Returns the normalized id. */
  async assertClassAccess(actor: RequestActor, classIdInput: unknown): Promise<number> {
    const classId = Number(classIdInput);
    const allowed = await this.scopedClassIds(actor);
    if (allowed !== null && !allowed.includes(classId)) throw new ApiError(403, '无权限执行该操作');
    return classId;
  }

  /** 403 unless the actor may name this student. Returns the normalized id. */
  async assertStudentAccess(actor: RequestActor, studentIdInput: unknown): Promise<number> {
    const studentId = Number(studentIdInput);
    const allowed = await this.scopedStudentIds(actor);
    if (allowed !== null && !allowed.includes(studentId)) throw new ApiError(403, '无权限执行该操作');
    return studentId;
  }

  /** The teacher a class belongs to, for a student-created team quest's `teacher_id`. */
  async classTeacherId(classId: number): Promise<number | null> {
    const cls = await this.classroom.getClassById(classId);
    return cls?.teacherId ?? null;
  }

  /**
   * 403 unless the actor may touch this task node's class.
   *
   * A missing node returns `null` without a refusal, so the service keeps answering its legacy
   * `Task node not found` for `PUT`/`DELETE` instead of turning it into a 403.
   */
  async assertTeacherNodeAccess(actor: RequestActor, nodeId: unknown): Promise<number | null> {
    const classId = this.repository.getTeacherNodeClassId(nodeId as never);
    if (classId === null) return null;
    await this.assertClassAccess(actor, classId);
    return classId;
  }

  /**
   * 403 unless the actor may touch this team quest's class.
   *
   * A missing quest returns `null`: the legacy `Team quest not found` 404 is the service's answer,
   * not a refusal dressed as one.
   */
  async assertTeamQuestAccess(actor: RequestActor, questIdInput: unknown): Promise<number | null> {
    const questId = Number(questIdInput);
    if (!Number.isFinite(questId)) return null;
    const quest = this.repository.getTeamQuest(questId);
    if (!quest) return null;
    await this.assertClassAccess(actor, quest.class_id);
    return quest.class_id;
  }

  /**
   * The peer reviews the actor is party to.
   *
   * `peer_reviews` has no class column, so the scope is the two student ids on the row: a student
   * sees the reviews they wrote or received (`本人相关`), a teacher the reviews of their own
   * students. A query that names somebody outside that set is refused rather than answered, and the
   * rows the query returns are filtered to it - the legacy query returned the whole table.
   */
  async listPeerReviewsFor(actor: RequestActor, queryInput: Record<string, any>): Promise<PeerReviewRow[]> {
    const scope = await this.scopedStudentIds(actor);
    const query = queryInput ?? {};

    for (const key of ['reviewer_id', 'reviewee_id']) {
      const value = query[key];
      if (value === undefined || value === null || value === '') continue;
      const id = Number(value);
      if (scope !== null && !scope.includes(id)) throw new ApiError(403, '无权限执行该操作');
    }

    const rows = this.listPeerReviews(query);
    if (scope === null) return rows;
    const allowed = new Set(scope);
    return rows.filter((row) => allowed.has(Number(row.reviewer_id)) || allowed.has(Number(row.reviewee_id)));
  }

  // -------------------------------------------------------------------------
  // Task tree (技能树)
  // -------------------------------------------------------------------------

  async listTeacherNodes(classIdInput: unknown) {
    const classId = Number(classIdInput);
    await this.assertTaskTreeClassFeature(classId);
    return this.repository.listTeacherNodes(classId);
  }

  /**
   * Create a node. A root node unlocks itself for every student in the class.
   *
   * Validation order preserved: missing body fields (400) -> class gate -> insert.
   * The roster arrives through the port, the unlock rows are this plugin's own.
   */
  async createTeacherNode(input: Record<string, any>) {
    const { class_id, title, description, points_reward, parent_node_id, x_pos, y_pos } = input ?? {};
    if (!class_id || !title) throw new ApiError(400, 'Missing required fields');

    const classId = Number(class_id);
    await this.assertTaskTreeClassFeature(classId);

    const insert: TeacherNodeInsert = {
      class_id: classId,
      title,
      // The `|| ` defaults are the pre-migration expressions, kept so a falsy value
      // lands in the column exactly as it did before.
      description: description || '',
      points_reward: points_reward || 0,
      parent_node_id: parent_node_id || null,
      x_pos: x_pos || 0,
      y_pos: y_pos || 0,
    };
    const nodeId = this.repository.insertTeacherNode(insert);

    if (!parent_node_id) {
      const students = await this.classroom.listClassStudents(classId);
      this.repository.unlockNodesForStudents(
        students.map((student) => student.id),
        [nodeId],
      );
    }

    return this.repository.getTeacherNode(nodeId);
  }

  async updateTeacherNode(nodeId: string, input: Record<string, any>) {
    const { title, description, points_reward, x_pos, y_pos } = input ?? {};
    const classId = this.repository.getTeacherNodeClassId(nodeId);
    if (classId === null) throw new ApiError(404, 'Task node not found');

    await this.assertTaskTreeClassFeature(classId);

    const update: TeacherNodeUpdate = { title, description, points_reward, x_pos, y_pos };
    this.repository.updateTeacherNode(nodeId, update);
  }

  async deleteTeacherNode(nodeId: string) {
    const classId = this.repository.getTeacherNodeClassId(nodeId);
    if (classId === null) throw new ApiError(404, 'Task node not found');

    await this.assertTaskTreeClassFeature(classId);

    if (this.repository.hasChildNodes(nodeId)) throw new ApiError(400, '请先删除子节点');

    this.repository.deleteTeacherNode(nodeId);
  }

  /** The learner-facing tree, with root nodes unlocked on first read. */
  async getStudentTree(studentIdInput: string) {
    const studentId = Number(studentIdInput);
    await this.assertTaskTreeStudentFeature(studentId);

    const student = await this.classroom.getStudentById(studentId);
    if (!student) throw new ApiError(404, 'Student not found');

    const rootNodeIds = this.repository.listRootNodeIds(student.classId);
    this.repository.unlockNodesForStudents([studentId], rootNodeIds);

    const nodes = this.repository.listStudentTree(studentId, student.classId);
    return nodes.map((node) => ({ ...node, status: node.status || 'locked' }));
  }

  /**
   * Complete a node and pay its reward.
   *
   * The plugin-local half runs first and atomically (completion row + child unlocks),
   * then the reward goes through the port: `adjustPoints` moves `total_points` and
   * `available_points` together, which is exactly the two-column update the
   * pre-migration code performed, and the ledger row keeps its `TASK_TREE_REWARD` type
   * and `Completed task node: <title>` description.
   *
   * A missing node keeps the pre-migration answer: 500 with `Task node not found`. It
   * looks wrong, and it is what the deployed client sees today - the task-tree error
   * translator turned that plain `Error` into a 500, and the old controller test pins
   * it.
   */
  async completeStudentNode(studentIdInput: string, nodeId: string) {
    const studentId = Number(studentIdInput);
    await this.assertTaskTreeStudentFeature(studentId);

    const node = this.repository.getTeacherNode(nodeId);
    if (!node) throw new ApiError(500, 'Task node not found');

    this.repository.completeStudentNode(studentId, nodeId);

    if (node.points_reward > 0) {
      await this.classroom.awardStudentPoints({
        studentId,
        amount: node.points_reward,
        type: 'TASK_TREE_REWARD',
        description: `Completed task node: ${node.title}`,
        actorId: 0,
        requestId: `task-tree:${studentId}:${nodeId}`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Team quests (团队任务)
  // -------------------------------------------------------------------------

  listTeamQuests(queryInput: Record<string, any>) {
    const { class_id, classIds, status } = queryInput ?? {};
    const filter: TeamQuestFilter = {};

    if (class_id !== undefined) {
      const classIdNum = Number(class_id);
      if (!Number.isFinite(classIdNum)) throw new ApiError(400, 'Invalid class_id');
      filter.classId = classIdNum;
    }
    // The controller's resolved roster, when the request named no class. Passed through as ids: the
    // service must not widen an empty roster into "every class".
    if (Array.isArray(classIds)) filter.classIds = classIds.map(Number);
    if (status !== undefined) {
      if (status !== 'active' && status !== 'completed') throw new ApiError(400, 'Invalid status');
      filter.status = status;
    }

    return this.repository.listTeamQuests(filter);
  }

  createTeamQuest(input: Record<string, any>) {
    const { class_id, teacher_id, title, description, target_score, reward_points, start_date, end_date } = input ?? {};
    const classIdNum = Number(class_id);
    const teacherIdNum = Number(teacher_id);
    const targetScoreNum = Number(target_score);
    const rewardPointsNum = Number(reward_points);

    if (!Number.isFinite(classIdNum)) throw new ApiError(400, 'Missing or invalid class_id');
    if (!Number.isFinite(teacherIdNum)) throw new ApiError(400, 'Missing or invalid teacher_id');
    if (!title || typeof title !== 'string') throw new ApiError(400, 'Missing title');
    if (!Number.isFinite(targetScoreNum) || targetScoreNum <= 0) {
      throw new ApiError(400, 'Missing or invalid target_score');
    }
    if (!Number.isFinite(rewardPointsNum) || rewardPointsNum <= 0) {
      throw new ApiError(400, 'Missing or invalid reward_points');
    }

    const insert: TeamQuestInsert = {
      class_id: classIdNum,
      teacher_id: teacherIdNum,
      title,
      description: typeof description === 'string' ? description : null,
      target_score: targetScoreNum,
      reward_points: rewardPointsNum,
      start_date,
      end_date,
    };
    return this.repository.insertTeamQuest(insert);
  }

  updateTeamQuest(questIdInput: string, input: Record<string, any>) {
    const idNum = Number(questIdInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const existing = this.repository.getTeamQuest(idNum);
    if (!existing) throw new ApiError(404, 'Team quest not found');

    const { title, description, target_score, reward_points, start_date, end_date, status } = input ?? {};
    const targetScoreNum = target_score !== undefined ? Number(target_score) : undefined;
    const rewardPointsNum = reward_points !== undefined ? Number(reward_points) : undefined;

    if (title !== undefined && (typeof title !== 'string' || !title.trim())) throw new ApiError(400, 'Invalid title');
    if (targetScoreNum !== undefined && (!Number.isFinite(targetScoreNum) || targetScoreNum <= 0)) {
      throw new ApiError(400, 'Invalid target_score');
    }
    if (rewardPointsNum !== undefined && (!Number.isFinite(rewardPointsNum) || rewardPointsNum <= 0)) {
      throw new ApiError(400, 'Invalid reward_points');
    }
    if (status !== undefined && status !== 'active' && status !== 'completed') {
      throw new ApiError(400, 'Invalid status');
    }

    // Re-read the stored row: the pre-migration code re-selected it and used
    // `?? row.column` for every field the body omitted.
    const stored = this.repository.getTeamQuest(idNum);
    const update: TeamQuestUpdate = {
      title: title ?? stored.title,
      description: description ?? stored.description,
      target_score: targetScoreNum ?? stored.target_score,
      reward_points: rewardPointsNum ?? stored.reward_points,
      start_date: start_date ?? stored.start_date,
      end_date: end_date ?? stored.end_date,
      status: status ?? stored.status,
    };
    this.repository.updateTeamQuest(idNum, update);
  }

  deleteTeamQuest(questIdInput: string) {
    const idNum = Number(questIdInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    if (!this.repository.getTeamQuest(idNum)) throw new ApiError(404, 'Team quest not found');

    this.repository.deleteTeamQuest(idNum);
  }

  listTeamQuestProgress(queryInput: Record<string, any>) {
    const { quest_id, student_id, studentIds } = queryInput ?? {};
    const filter: TeamQuestProgressFilter = {};

    if (quest_id !== undefined) {
      const questIdNum = Number(quest_id);
      if (!Number.isFinite(questIdNum)) throw new ApiError(400, 'Invalid quest_id');
      filter.questId = questIdNum;
    }
    if (student_id !== undefined) {
      const studentIdNum = Number(student_id);
      if (!Number.isFinite(studentIdNum)) throw new ApiError(400, 'Invalid student_id');
      filter.studentId = studentIdNum;
    }
    // The controller's resolved roster, when the request named no student.
    if (Array.isArray(studentIds)) filter.studentIds = studentIds.map(Number);

    return this.repository.listTeamQuestProgress(filter);
  }

  /**
   * Per-group contribution for one quest.
   *
   * See the file header: the roster (and each student's `groupId`) comes from the port,
   * the group names and progress rows from this plugin. Buckets are keyed by
   * `(group_id, group_name)` - the pre-migration `GROUP BY` - so a student whose group
   * row was deleted lands in its own `未分组` bucket that still carries its group id.
   */
  async listGroupProgress(queryInput: Record<string, any>) {
    const { quest_id, class_id } = queryInput ?? {};
    const questIdNum = Number(quest_id);
    const classIdNum = Number(class_id);
    if (!Number.isFinite(questIdNum)) throw new ApiError(400, 'Invalid quest_id');
    if (!Number.isFinite(classIdNum)) throw new ApiError(400, 'Invalid class_id');

    const quest = this.repository.getTeamQuestTarget(questIdNum, classIdNum);
    if (!quest) throw new ApiError(404, 'Team quest not found');

    const roster = await this.classroom.listClassStudents(classIdNum);
    const progressRows = this.repository.listQuestProgressRows(questIdNum);
    const groups = this.repository.listGroupsForClass(classIdNum);

    const groupNames = new Map(groups.map((group) => [group.id, group.name]));

    // A student can in principle have more than one progress row (the table has no
    // UNIQUE constraint), and the pre-migration SUM counted every one of them.
    const contributionByStudent = new Map<number, number>();
    for (const row of progressRows) {
      contributionByStudent.set(
        row.student_id,
        (contributionByStudent.get(row.student_id) ?? 0) + score(row.contribution_score),
      );
    }

    const buckets = new Map<string, GroupBucket>();
    for (const student of roster) {
      const groupId = student.groupId ?? null;
      const groupName = groupId === null ? null : (groupNames.get(groupId) ?? null);
      const key = `${groupId ?? 'null'}\u0000${groupName ?? 'null'}`;
      const bucket = buckets.get(key) ?? {
        group_id: groupId,
        group_name: groupName,
        contribution_score: 0,
        target_score: quest.target_score,
      };
      bucket.contribution_score += contributionByStudent.get(student.id) ?? 0;
      buckets.set(key, bucket);
    }

    return [...buckets.values()].sort(compareGroupNames).map((bucket) => ({
      group_id: bucket.group_id ?? null,
      group_name: bucket.group_name ?? '未分组',
      contribution_score: Number(bucket.contribution_score) || 0,
      target_score: bucket.target_score,
    }));
  }

  /**
   * The active quest for a student, with their team and both contribution totals.
   *
   * Member names arrive already decrypted: names are AES-encrypted at rest
   * (`api/services/studentService.ts`), and the classroom port owns the decryptor so a
   * plugin never re-implements the cipher. Ordering (`ORDER BY id ASC`) comes from the
   * port's `listClassStudents`.
   */
  async getStudentCurrentQuest(queryInput: Record<string, any>) {
    const { student_id } = queryInput ?? {};
    const studentIdNum = Number(student_id);
    if (!Number.isFinite(studentIdNum)) throw new ApiError(400, 'Invalid student_id');

    const student = await this.classroom.getStudentById(studentIdNum);
    if (!student) throw new ApiError(404, 'Student not found');

    const quest = this.repository.getActiveTeamQuestForClass(student.classId);
    if (!quest) return { quest: null };

    const groupId = student.groupId ?? null;
    const roster = await this.classroom.listClassStudents(student.classId);
    const members: StudentSnapshot[] = groupId === null ? roster : roster.filter((member) => member.groupId === groupId);

    const myProgress = this.repository.getStudentQuestProgress(quest.id, studentIdNum);

    // The pre-migration aggregate joined from `students`, so progress rows belonging to
    // students outside the class (or outside the group) never counted. Filtering the
    // roster's ids reproduces that, including the ungrouped case where every class
    // student counts.
    const memberIds = new Set(members.map((member) => member.id));
    const teamContributionScore = this.repository
      .listQuestProgressRows(quest.id)
      .filter((row) => memberIds.has(row.student_id))
      .reduce((total, row) => total + score(row.contribution_score), 0);

    return {
      quest,
      team: {
        class_id: student.classId,
        group_id: groupId,
        members: members.map((member) => ({ id: member.id, name: member.name })),
      },
      progress: {
        my_contribution_score: myProgress?.contribution_score ?? 0,
        team_contribution_score: teamContributionScore,
      },
    };
  }

  async addTeamQuestProgress(input: Record<string, any>) {
    const { quest_id, student_id, contribution_score } = input ?? {};
    const questIdNum = Number(quest_id);
    const studentIdNum = Number(student_id);
    const scoreNum = Number(contribution_score);

    if (!Number.isFinite(questIdNum)) throw new ApiError(400, 'Missing or invalid quest_id');
    if (!Number.isFinite(studentIdNum)) throw new ApiError(400, 'Missing or invalid student_id');
    if (!Number.isFinite(scoreNum) || scoreNum <= 0) {
      throw new ApiError(400, 'Missing or invalid contribution_score');
    }

    if (!this.repository.getTeamQuest(questIdNum)) throw new ApiError(404, 'Team quest not found');

    const student = await this.classroom.getStudentById(studentIdNum);
    if (!student) throw new ApiError(404, 'Student not found');

    const existing = this.repository.getStudentQuestProgress(questIdNum, studentIdNum);
    if (existing) {
      this.repository.addQuestProgressScore(existing.id, scoreNum);
      return existing.id;
    }

    return this.repository.insertQuestProgress(questIdNum, studentIdNum, scoreNum);
  }

  // -------------------------------------------------------------------------
  // Peer reviews (同伴互评)
  // -------------------------------------------------------------------------

  listPeerReviews(queryInput: Record<string, any>) {
    const { reviewer_id, reviewee_id, assignment_id, team_quest_id } = queryInput ?? {};
    const filter: PeerReviewFilter = {};

    if (reviewer_id !== undefined) {
      const reviewerIdNum = Number(reviewer_id);
      if (!Number.isFinite(reviewerIdNum)) throw new ApiError(400, 'Invalid reviewer_id');
      filter.reviewerId = reviewerIdNum;
    }
    if (reviewee_id !== undefined) {
      const revieweeIdNum = Number(reviewee_id);
      if (!Number.isFinite(revieweeIdNum)) throw new ApiError(400, 'Invalid reviewee_id');
      filter.revieweeId = revieweeIdNum;
    }
    if (assignment_id !== undefined) {
      const assignmentIdNum = Number(assignment_id);
      if (!Number.isFinite(assignmentIdNum)) throw new ApiError(400, 'Invalid assignment_id');
      filter.assignmentId = assignmentIdNum;
    }
    if (team_quest_id !== undefined) {
      const teamQuestIdNum = Number(team_quest_id);
      if (!Number.isFinite(teamQuestIdNum)) throw new ApiError(400, 'Invalid team_quest_id');
      filter.teamQuestId = teamQuestIdNum;
    }

    return this.repository.listPeerReviews(filter);
  }

  createPeerReview(input: Record<string, any>) {
    const { reviewer_id, reviewee_id, assignment_id, team_quest_id, score: scoreInput, comment } = input ?? {};
    const reviewerIdNum = Number(reviewer_id);
    const revieweeIdNum = Number(reviewee_id);
    const scoreNum = Number(scoreInput);

    if (!Number.isFinite(reviewerIdNum)) throw new ApiError(400, 'Missing or invalid reviewer_id');
    if (!Number.isFinite(revieweeIdNum)) throw new ApiError(400, 'Missing or invalid reviewee_id');
    if (!Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > 5) {
      throw new ApiError(400, 'Missing or invalid score');
    }

    const assignmentIdNum =
      assignment_id === undefined || assignment_id === null || assignment_id === '' ? null : Number(assignment_id);
    const teamQuestIdNum =
      team_quest_id === undefined || team_quest_id === null || team_quest_id === '' ? null : Number(team_quest_id);

    if (assignmentIdNum !== null && !Number.isFinite(assignmentIdNum)) throw new ApiError(400, 'Invalid assignment_id');
    if (teamQuestIdNum !== null && !Number.isFinite(teamQuestIdNum)) throw new ApiError(400, 'Invalid team_quest_id');
    if (assignmentIdNum === null && teamQuestIdNum === null) {
      throw new ApiError(400, 'assignment_id or team_quest_id is required');
    }

    const insert: PeerReviewInsert = {
      reviewer_id: reviewerIdNum,
      reviewee_id: revieweeIdNum,
      assignment_id: assignmentIdNum,
      team_quest_id: teamQuestIdNum,
      score: scoreNum,
      comment: typeof comment === 'string' && comment.trim() ? comment : null,
    };
    return this.repository.insertPeerReview(insert);
  }

  // -------------------------------------------------------------------------
  // Feature gates and the ledger
  // -------------------------------------------------------------------------

  /**
   * Class-scope gate for the teacher tree routes.
   *
   * The class id comes from the URL or from a node's `class_id`, never from a student,
   * which is why the port exposes the class-scoped check.
   */
  private async assertTaskTreeClassFeature(classId: number): Promise<void> {
    const gate = await this.classroom.checkClassFeature(classId, TASK_TREE_FEATURE);
    if (gate.refusal) throw toApiError(gate.refusal);
  }

  /** Student-scope gate: resolves the class through the port, then checks the flag. */
  private async assertTaskTreeStudentFeature(studentId: number): Promise<void> {
    const gate = await this.classroom.checkStudentFeature(studentId, TASK_TREE_FEATURE);
    if (gate.refusal) throw toApiError(gate.refusal);
  }

  /**
   * Append to the shared point ledger.
   *
   * The balance has already moved when this runs, so a ledger failure is reported by
   * the boundary rather than rolled back - a missing history row is a smaller problem
   * than a completed node reporting failure after it succeeded.
   */
  private async ledger(studentId: number, type: string, amount: number, description: string): Promise<void> {
    await this.classroom.recordStudentLedgerEntry({ studentId, type, amount, description });
  }
}
