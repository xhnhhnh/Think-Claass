/**
 * Collaboration repository.
 *
 * Takes the plugin's ownership-checked `DbApi` instead of the raw connection
 * (`api/db.ts`), so every statement is validated against the manifest:
 *
 *   task_nodes, student_task_nodes, team_quests, team_quest_progress,
 *   peer_reviews                          adopted (owned, legacy names)
 *   student_groups                        declared read (classroom owns it)
 *   students, classes, records            classroom-owned -> NOT here at all
 *
 * The SQL is carried over verbatim from the pre-migration service so the row shapes -
 * and therefore the response bodies - do not move. Three statements have no equivalent
 * here on purpose: `SELECT id FROM students WHERE class_id = ?` (now
 * `classroom.public.listClassStudents`), `SELECT ... FROM students WHERE id = ?` (now
 * `getStudentById`) and the two-column balance update plus `records` insert (now
 * `adjustPoints` / `recordStudentLedgerEntry`).
 *
 * The team-quest aggregate that the pre-migration code expressed as one join across
 * `students`, `student_groups` and `team_quest_progress` cannot be a single statement
 * any more: `students` belongs to classroom. It is composed in the service from the
 * class roster (`listClassStudents`) plus this plugin's own rows, and the bucket
 * ordering reproduces `ORDER BY g.name ASC` including SQLite's NULLs-first placement.
 */

import type { DbApi } from '@thinkclass/plugin-sdk';

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
} from './collaboration.types.js';

export function createCollaborationRepository(db: DbApi): CollaborationRepository {
  return {
    // -- task tree -----------------------------------------------------------

    listTeacherNodes(classId) {
      return db.query<TaskNodeRow>('SELECT * FROM task_nodes WHERE class_id = ?', [classId]);
    },

    insertTeacherNode(input: TeacherNodeInsert) {
      const info = db.run(
        `
      INSERT INTO task_nodes (class_id, title, description, points_reward, parent_node_id, x_pos, y_pos) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
        [
          input.class_id,
          input.title,
          input.description,
          input.points_reward,
          input.parent_node_id,
          input.x_pos,
          input.y_pos,
        ],
      );
      return Number(info.lastInsertRowid);
    },

    getTeacherNode(nodeId) {
      return db.get<TaskNodeRow>('SELECT * FROM task_nodes WHERE id = ?', [nodeId]) ?? null;
    },

    getTeacherNodeClassId(nodeId) {
      const row = db.get<{ class_id: number }>('SELECT class_id FROM task_nodes WHERE id = ?', [nodeId]);
      return row?.class_id ?? null;
    },

    updateTeacherNode(nodeId, input: TeacherNodeUpdate) {
      db.run(
        `
      UPDATE task_nodes 
      SET title = ?, description = ?, points_reward = ?, x_pos = ?, y_pos = ? 
      WHERE id = ?
    `,
        [input.title, input.description, input.points_reward, input.x_pos, input.y_pos, nodeId],
      );
    },

    hasChildNodes(nodeId) {
      return db.get('SELECT 1 FROM task_nodes WHERE parent_node_id = ?', [nodeId]) !== undefined;
    },

    deleteTeacherNode(nodeId) {
      db.tx((tx) => {
        tx.run('DELETE FROM student_task_nodes WHERE task_node_id = ?', [nodeId]);
        tx.run('DELETE FROM task_nodes WHERE id = ?', [nodeId]);
      });
    },

    listRootNodeIds(classId) {
      const rows = db.query<{ id: number }>('SELECT id FROM task_nodes WHERE class_id = ? AND parent_node_id IS NULL', [
        classId,
      ]);
      return rows.map((row) => row.id);
    },

    listChildNodeIds(nodeId) {
      const rows = db.query<{ id: number }>('SELECT id FROM task_nodes WHERE parent_node_id = ?', [nodeId]);
      return rows.map((row) => row.id);
    },

    /**
     * Unlock a set of nodes for a set of students.
     *
     * `INSERT OR IGNORE` because the pre-migration statements were, and because
     * `student_task_nodes` carries `UNIQUE(student_id, task_node_id)`: re-opening a
     * tree must not reset a completion. One transaction for the whole cross product,
     * matching the pre-migration `createTeacherNode` loop.
     */
    unlockNodesForStudents(studentIds, nodeIds) {
      if (studentIds.length === 0 || nodeIds.length === 0) return;
      db.tx((tx) => {
        const stmt = 'INSERT OR IGNORE INTO student_task_nodes (student_id, task_node_id, status) VALUES (?, ?, ?)';
        for (const studentId of studentIds) {
          for (const nodeId of nodeIds) {
            tx.run(stmt, [studentId, nodeId, 'unlocked']);
          }
        }
      });
    },

    /**
     * Record a completion and unlock its children, atomically.
     *
     * The pre-migration `completeStudentNode` did this, the reward and the ledger row
     * inside one transaction. The reward cannot stay in this one (the port is async),
     * so the plugin-local half is kept atomic and the reward follows it - see the
     * service's atomicity note.
     */
    completeStudentNode(studentId, nodeId) {
      db.tx((tx) => {
        tx.run(
          'INSERT OR REPLACE INTO student_task_nodes (student_id, task_node_id, status, completed_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
          [studentId, nodeId, 'completed'],
        );

        const children = tx.query<{ id: number }>('SELECT id FROM task_nodes WHERE parent_node_id = ?', [nodeId]);
        for (const child of children) {
          tx.run('INSERT OR IGNORE INTO student_task_nodes (student_id, task_node_id, status) VALUES (?, ?, ?)', [
            studentId,
            child.id,
            'unlocked',
          ]);
        }
      });
    },

    listStudentTree(studentId, classId) {
      return db.query<TaskNodeWithStatus>(
        `
      SELECT tn.*, stn.status, stn.completed_at 
      FROM task_nodes tn
      LEFT JOIN student_task_nodes stn ON tn.id = stn.task_node_id AND stn.student_id = ?
      WHERE tn.class_id = ?
    `,
        [studentId, classId],
      );
    },

    // -- team quests ---------------------------------------------------------

    listTeamQuests(filter: TeamQuestFilter) {
      let query = 'SELECT * FROM team_quests WHERE 1=1';
      const params: Array<number | string> = [];

      if (filter.classId !== undefined) {
        query += ' AND class_id = ?';
        params.push(filter.classId);
      }
      if (filter.status !== undefined) {
        query += ' AND status = ?';
        params.push(filter.status);
      }
      query += ' ORDER BY created_at DESC';

      return db.query<TeamQuestRow>(query, params);
    },

    getTeamQuest(questId) {
      return db.get<TeamQuestRow>('SELECT * FROM team_quests WHERE id = ?', [questId]) ?? null;
    },

    getTeamQuestTarget(questId, classId) {
      return (
        db.get<TeamQuestTargetRow>('SELECT id, target_score FROM team_quests WHERE id = ? AND class_id = ?', [
          questId,
          classId,
        ]) ?? null
      );
    },

    getActiveTeamQuestForClass(classId) {
      return (
        db.get<TeamQuestRow>(
          "SELECT * FROM team_quests WHERE class_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
          [classId],
        ) ?? null
      );
    },

    insertTeamQuest(input: TeamQuestInsert) {
      const info = db.run(
        `
      INSERT INTO team_quests (class_id, teacher_id, title, description, target_score, reward_points, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
        [
          input.class_id,
          input.teacher_id,
          input.title,
          input.description,
          input.target_score,
          input.reward_points,
          input.start_date ?? null,
          input.end_date ?? null,
        ],
      );
      return Number(info.lastInsertRowid);
    },

    updateTeamQuest(questId, input: TeamQuestUpdate) {
      // The pre-migration statement resolved "keep the stored value" in the service
      // (`title ?? row.title`), so the values arriving here are already concrete.
      db.run(
        `
      UPDATE team_quests
      SET title = ?, description = ?, target_score = ?, reward_points = ?, start_date = ?, end_date = ?, status = ?
      WHERE id = ?
    `,
        [
          input.title,
          input.description,
          input.target_score,
          input.reward_points,
          input.start_date,
          input.end_date,
          input.status,
          questId,
        ],
      );
    },

    deleteTeamQuest(questId) {
      db.tx((tx) => {
        tx.run('DELETE FROM team_quest_progress WHERE quest_id = ?', [questId]);
        tx.run('DELETE FROM team_quests WHERE id = ?', [questId]);
      });
    },

    listTeamQuestProgress(filter: TeamQuestProgressFilter) {
      let query = 'SELECT * FROM team_quest_progress WHERE 1=1';
      const params: number[] = [];

      if (filter.questId !== undefined) {
        query += ' AND quest_id = ?';
        params.push(filter.questId);
      }
      if (filter.studentId !== undefined) {
        query += ' AND student_id = ?';
        params.push(filter.studentId);
      }

      return db.query<TeamQuestProgressRow>(query, params);
    },

    getStudentQuestProgress(questId, studentId) {
      // Selects `id` as well as the score because the upsert path needs the row id to
      // update in place - the same two columns the pre-migration statements read.
      return (
        db.get<QuestProgressRow>(
          'SELECT id, contribution_score FROM team_quest_progress WHERE quest_id = ? AND student_id = ?',
          [questId, studentId],
        ) ?? null
      );
    },

    listQuestProgressRows(questId) {
      return db.query<TeamQuestProgressRow>('SELECT * FROM team_quest_progress WHERE quest_id = ?', [questId]);
    },

    addQuestProgressScore(progressId, score) {
      db.run('UPDATE team_quest_progress SET contribution_score = contribution_score + ? WHERE id = ?', [
        score,
        progressId,
      ]);
    },

    insertQuestProgress(questId, studentId, score) {
      const info = db.run(
        `
        INSERT INTO team_quest_progress (quest_id, student_id, contribution_score)
        VALUES (?, ?, ?)
      `,
        [questId, studentId, score],
      );
      return Number(info.lastInsertRowid);
    },

    // -- groups (read-only) --------------------------------------------------

    listGroupsForClass(classId) {
      return db.query<GroupRow>('SELECT id, name FROM student_groups WHERE class_id = ?', [classId]);
    },

    // -- peer reviews --------------------------------------------------------

    listPeerReviews(filter: PeerReviewFilter) {
      let query = 'SELECT * FROM peer_reviews WHERE 1=1';
      const params: number[] = [];

      if (filter.reviewerId !== undefined) {
        query += ' AND reviewer_id = ?';
        params.push(filter.reviewerId);
      }
      if (filter.revieweeId !== undefined) {
        query += ' AND reviewee_id = ?';
        params.push(filter.revieweeId);
      }
      if (filter.assignmentId !== undefined) {
        query += ' AND assignment_id = ?';
        params.push(filter.assignmentId);
      }
      if (filter.teamQuestId !== undefined) {
        query += ' AND team_quest_id = ?';
        params.push(filter.teamQuestId);
      }
      query += ' ORDER BY created_at DESC';

      return db.query<PeerReviewRow>(query, params);
    },

    insertPeerReview(input: PeerReviewInsert) {
      const info = db.run(
        `
      INSERT INTO peer_reviews (reviewer_id, reviewee_id, assignment_id, team_quest_id, score, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
        [
          input.reviewer_id,
          input.reviewee_id,
          input.assignment_id,
          input.team_quest_id,
          input.score,
          input.comment,
        ],
      );
      return Number(info.lastInsertRowid);
    },
  };
}
