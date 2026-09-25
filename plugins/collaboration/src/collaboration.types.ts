/**
 * Collaboration domain types.
 *
 * What is deliberately absent is as important as what is present: the pre-migration
 * service owned `students` (four different reads plus a two-column balance update) and
 * the shared `records` ledger. Both are classroom-owned, so they moved behind
 * `classroom.public` and are not reachable from this interface at all.
 *
 * The five tables adopted here are the plugin's own (`data.adopted`, legacy names).
 * `student_groups` is a declared *read* (`data.reads`): collaboration only joins it for
 * a group name, while classroom's group surface writes it - see the manifest's
 * `_reads_note`.
 */

import type { SqlParam } from '@thinkclass/plugin-sdk';

/** One `task_nodes` row. Returned straight through `SELECT *`, so columns are contract. */
export interface TaskNodeRow {
  id: number;
  class_id: number;
  title: string;
  description: string | null;
  points_reward: number;
  parent_node_id: number | null;
  x_pos: number;
  y_pos: number;
  created_at: string;
}

/**
 * A `task_nodes` row joined with the requesting student's `student_task_nodes` row.
 *
 * `status` is `null` when the student has no row yet (every node of a class they have
 * never opened); the service maps that to `'locked'`, exactly as the pre-migration
 * `.map(node => ({ ...node, status: node.status || 'locked' }))` did.
 */
export interface TaskNodeWithStatus extends TaskNodeRow {
  status: string | null;
  completed_at: string | null;
}

/** One `team_quests` row. `SELECT *` goes to the frontend, so columns are contract. */
export interface TeamQuestRow {
  id: number;
  class_id: number;
  teacher_id: number;
  title: string;
  description: string | null;
  target_score: number;
  reward_points: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_at: string;
}

/** The two columns `listGroupProgress` needs from a quest. */
export interface TeamQuestTargetRow {
  id: number;
  target_score: number;
}

/** One `team_quest_progress` row. */
export interface TeamQuestProgressRow {
  id: number;
  quest_id: number;
  student_id: number;
  contribution_score: number | null;
  created_at: string;
}

/** The `id` + `contribution_score` the progress lookup reads (upsert and totals both). */
export interface QuestProgressRow {
  id: number;
  contribution_score: number | null;
}

/** One `peer_reviews` row. */
export interface PeerReviewRow {
  id: number;
  reviewer_id: number;
  reviewee_id: number;
  assignment_id: number | null;
  team_quest_id: number | null;
  score: number | null;
  comment: string | null;
  created_at: string;
}

/** A `student_groups` row: read-only here, for the group name on a progress bucket. */
export interface GroupRow {
  id: number;
  name: string;
}

/** The per-group aggregate `GET /api/team-quests/progress/groups` answers with. */
export interface GroupProgressRow {
  group_id: number | null;
  group_name: string;
  contribution_score: number;
  target_score: number;
}

/** Validated filter for `listTeamQuests`. */
export interface TeamQuestFilter {
  classId?: number;
  /**
   * The classes the actor owns, when the request named none.
   *
   * A teacher may own several classes and the response used to be the whole table; the caller
   * resolves the roster and passes it here. An empty array means "no classes" and must answer no
   * rows, never every row.
   */
  classIds?: number[];
  status?: string;
}

/** Validated filter for `listTeamQuestProgress`. */
export interface TeamQuestProgressFilter {
  questId?: number;
  studentId?: number;
  /** The students the actor owns, when the request named none. Empty means "nobody". */
  studentIds?: number[];
}

/** Validated filter for `listPeerReviews`. */
export interface PeerReviewFilter {
  reviewerId?: number;
  revieweeId?: number;
  assignmentId?: number;
  teamQuestId?: number;
}

/** Input to `insertTeacherNode`, after the service applied the legacy `|| ` defaults. */
export interface TeacherNodeInsert {
  class_id: number;
  title: string;
  description: string;
  points_reward: number;
  parent_node_id: number | null;
  x_pos: number;
  y_pos: number;
}

/**
 * Input to `updateTeacherNode`, passed through unchanged.
 *
 * The fields are the `DbApi`'s bindable union because the values go to better-sqlite3
 * verbatim: the pre-migration code handed the raw body values straight to the driver, so
 * a body that omits a field still fails the same way it did before (this project
 * compiles with `strict: false`, so a missing field is `undefined` at runtime and the
 * driver rejects it) rather than being silently coerced to `null`.
 */
export interface TeacherNodeUpdate {
  title?: SqlParam;
  description?: SqlParam;
  points_reward?: SqlParam;
  x_pos?: SqlParam;
  y_pos?: SqlParam;
}

/** Input to `insertTeamQuest`, after validation. */
export interface TeamQuestInsert {
  class_id: number;
  teacher_id: number;
  title: string;
  description: string | null;
  target_score: number;
  reward_points: number;
  /** Raw body values, bound verbatim (`?? null` applied at the call site). */
  start_date: SqlParam;
  end_date: SqlParam;
}

/** Input to `updateTeamQuest`, after validation; `undefined` means "keep the stored value". */
export interface TeamQuestUpdate {
  title?: string;
  description?: SqlParam;
  target_score?: number;
  reward_points?: number;
  start_date?: SqlParam;
  end_date?: SqlParam;
  status?: string;
}

/** Input to `insertPeerReview`, after the service applied the legacy null-coalescing. */
export interface PeerReviewInsert {
  reviewer_id: number;
  reviewee_id: number;
  assignment_id: number | null;
  team_quest_id: number | null;
  score: number;
  comment: string | null;
}

/**
 * Storage boundary for this plugin.
 *
 * Every statement here targets one of the five adopted tables plus the declared
 * `student_groups` read. `students`, `classes` and `records` must not appear: the
 * ownership check in `ctx.db` would refuse them at runtime, which is the point of the
 * migration.
 */
export interface CollaborationRepository {
  // -- task tree -------------------------------------------------------------
  listTeacherNodes(classId: number): TaskNodeRow[];
  insertTeacherNode(input: TeacherNodeInsert): number;
  getTeacherNode(nodeId: string | number): TaskNodeRow | null;
  getTeacherNodeClassId(nodeId: string | number): number | null;
  updateTeacherNode(nodeId: string | number, input: TeacherNodeUpdate): void;
  hasChildNodes(nodeId: string | number): boolean;
  deleteTeacherNode(nodeId: string | number): void;
  listRootNodeIds(classId: number): number[];
  listChildNodeIds(nodeId: string | number): number[];
  /** `INSERT OR IGNORE ... 'unlocked'` for each student, in one transaction. */
  unlockNodesForStudents(studentIds: number[], nodeIds: number[]): void;
  /** `INSERT OR REPLACE ... 'completed'` plus the child unlocks, in one transaction. */
  completeStudentNode(studentId: number, nodeId: string | number): void;
  listStudentTree(studentId: number, classId: number): TaskNodeWithStatus[];

  // -- team quests -----------------------------------------------------------
  listTeamQuests(filter: TeamQuestFilter): TeamQuestRow[];
  getTeamQuest(questId: number): TeamQuestRow | null;
  getTeamQuestTarget(questId: number, classId: number): TeamQuestTargetRow | null;
  getActiveTeamQuestForClass(classId: number): TeamQuestRow | null;
  insertTeamQuest(input: TeamQuestInsert): number;
  updateTeamQuest(questId: number, input: TeamQuestUpdate): void;
  deleteTeamQuest(questId: number): void;
  listTeamQuestProgress(filter: TeamQuestProgressFilter): TeamQuestProgressRow[];
  getStudentQuestProgress(questId: number, studentId: number): QuestProgressRow | null;
  listQuestProgressRows(questId: number): TeamQuestProgressRow[];
  addQuestProgressScore(progressId: number, score: number): void;
  insertQuestProgress(questId: number, studentId: number, score: number): number;

  // -- groups (read-only) ----------------------------------------------------
  listGroupsForClass(classId: number): GroupRow[];

  // -- peer reviews ----------------------------------------------------------
  listPeerReviews(filter: PeerReviewFilter): PeerReviewRow[];
  insertPeerReview(input: PeerReviewInsert): number;
}
