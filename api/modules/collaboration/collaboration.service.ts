import { Injectable } from '@nestjs/common';

import db, { decrypt } from '../../db.js';
import { ApiError } from '../../utils/apiError.js';
import { assertClassFeatureEnabled, assertStudentFeatureEnabled } from '../../utils/classFeatures.js';
import { asTaskTreeLegacyError } from './collaboration.errors.js';

function assertTaskTreeClassFeature(classId: number) {
  try {
    assertClassFeatureEnabled(classId, 'enable_task_tree');
  } catch (error) {
    asTaskTreeLegacyError(error);
  }
}

function assertTaskTreeStudentFeature(studentId: number) {
  try {
    assertStudentFeatureEnabled(studentId, 'enable_task_tree');
  } catch (error) {
    asTaskTreeLegacyError(error);
  }
}

@Injectable()
export class CollaborationService {
  listTeacherNodes(classId: string) {
    assertTaskTreeClassFeature(Number(classId));
    return db.prepare('SELECT * FROM task_nodes WHERE class_id = ?').all(classId);
  }

  createTeacherNode(input: Record<string, any>) {
    const { class_id, title, description, points_reward, parent_node_id, x_pos, y_pos } = input ?? {};
    if (!class_id || !title) throw new ApiError(400, 'Missing required fields');

    assertTaskTreeClassFeature(Number(class_id));
    const stmt = db.prepare(`
      INSERT INTO task_nodes (class_id, title, description, points_reward, parent_node_id, x_pos, y_pos) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(class_id, title, description || '', points_reward || 0, parent_node_id || null, x_pos || 0, y_pos || 0);

    if (!parent_node_id) {
      const students = db.prepare('SELECT id FROM students WHERE class_id = ?').all(class_id);
      const insertStudentNode = db.prepare('INSERT OR IGNORE INTO student_task_nodes (student_id, task_node_id, status) VALUES (?, ?, ?)');
      const tx = db.transaction((stds: any[]) => {
        for (const student of stds) {
          insertStudentNode.run(student.id, info.lastInsertRowid, 'unlocked');
        }
      });
      tx(students);
    }

    return db.prepare('SELECT * FROM task_nodes WHERE id = ?').get(info.lastInsertRowid);
  }

  updateTeacherNode(id: string, input: Record<string, any>) {
    const { title, description, points_reward, x_pos, y_pos } = input ?? {};
    const node = db.prepare('SELECT class_id FROM task_nodes WHERE id = ?').get(id) as { class_id: number } | undefined;
    if (!node) throw new ApiError(404, 'Task node not found');

    assertTaskTreeClassFeature(node.class_id);
    db.prepare(`
      UPDATE task_nodes 
      SET title = ?, description = ?, points_reward = ?, x_pos = ?, y_pos = ? 
      WHERE id = ?
    `).run(title, description, points_reward, x_pos, y_pos, id);
  }

  deleteTeacherNode(id: string) {
    const node = db.prepare('SELECT class_id FROM task_nodes WHERE id = ?').get(id) as { class_id: number } | undefined;
    if (!node) throw new ApiError(404, 'Task node not found');

    assertTaskTreeClassFeature(node.class_id);
    const hasChildren = db.prepare('SELECT 1 FROM task_nodes WHERE parent_node_id = ?').get(id);
    if (hasChildren) throw new ApiError(400, '请先删除子节点');

    db.prepare('DELETE FROM student_task_nodes WHERE task_node_id = ?').run(id);
    db.prepare('DELETE FROM task_nodes WHERE id = ?').run(id);
  }

  getStudentTree(studentId: string) {
    assertTaskTreeStudentFeature(Number(studentId));
    const student = db.prepare('SELECT class_id FROM students WHERE id = ?').get(studentId) as any;
    if (!student) throw new ApiError(404, 'Student not found');

    const rootNodes = db.prepare('SELECT id FROM task_nodes WHERE class_id = ? AND parent_node_id IS NULL').all(student.class_id);
    const insertStudentNode = db.prepare('INSERT OR IGNORE INTO student_task_nodes (student_id, task_node_id, status) VALUES (?, ?, ?)');
    for (const root of rootNodes) {
      insertStudentNode.run(studentId, (root as any).id, 'unlocked');
    }

    const nodes = db.prepare(`
      SELECT tn.*, stn.status, stn.completed_at 
      FROM task_nodes tn
      LEFT JOIN student_task_nodes stn ON tn.id = stn.task_node_id AND stn.student_id = ?
      WHERE tn.class_id = ?
    `).all(studentId, student.class_id);

    return nodes.map((node: any) => ({ ...node, status: node.status || 'locked' }));
  }

  completeStudentNode(studentId: string, nodeId: string) {
    assertTaskTreeStudentFeature(Number(studentId));
    const tx = db.transaction(() => {
      const node = db.prepare('SELECT * FROM task_nodes WHERE id = ?').get(nodeId) as any;
      if (!node) throw new Error('Task node not found');

      const stmt = db.prepare('INSERT OR REPLACE INTO student_task_nodes (student_id, task_node_id, status, completed_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)');
      stmt.run(studentId, nodeId, 'completed');

      if (node.points_reward > 0) {
        db.prepare('UPDATE students SET total_points = total_points + ?, available_points = available_points + ? WHERE id = ?')
          .run(node.points_reward, node.points_reward, studentId);
        db.prepare('INSERT INTO records (student_id, type, amount, description) VALUES (?, ?, ?, ?)')
          .run(studentId, 'TASK_TREE_REWARD', node.points_reward, `Completed task node: ${node.title}`);
      }

      const children = db.prepare('SELECT id FROM task_nodes WHERE parent_node_id = ?').all(nodeId);
      const unlockStmt = db.prepare('INSERT OR IGNORE INTO student_task_nodes (student_id, task_node_id, status) VALUES (?, ?, ?)');
      for (const child of children) {
        unlockStmt.run(studentId, (child as any).id, 'unlocked');
      }
    });

    tx();
  }

  listTeamQuests(queryInput: Record<string, any>) {
    const { class_id, status } = queryInput ?? {};
    let query = 'SELECT * FROM team_quests WHERE 1=1';
    const params: any[] = [];

    if (class_id !== undefined) {
      const classIdNum = Number(class_id);
      if (!Number.isFinite(classIdNum)) throw new ApiError(400, 'Invalid class_id');
      query += ' AND class_id = ?';
      params.push(classIdNum);
    }
    if (status !== undefined) {
      if (status !== 'active' && status !== 'completed') throw new ApiError(400, 'Invalid status');
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';

    return db.prepare(query).all(...params);
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
    if (!Number.isFinite(targetScoreNum) || targetScoreNum <= 0) throw new ApiError(400, 'Missing or invalid target_score');
    if (!Number.isFinite(rewardPointsNum) || rewardPointsNum <= 0) throw new ApiError(400, 'Missing or invalid reward_points');

    const stmt = db.prepare(`
      INSERT INTO team_quests (class_id, teacher_id, title, description, target_score, reward_points, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      classIdNum,
      teacherIdNum,
      title,
      typeof description === 'string' ? description : null,
      targetScoreNum,
      rewardPointsNum,
      start_date || null,
      end_date || null,
    );
    return info.lastInsertRowid;
  }

  updateTeamQuest(id: string, input: Record<string, any>) {
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const existing = db.prepare('SELECT id FROM team_quests WHERE id = ?').get(idNum);
    if (!existing) throw new ApiError(404, 'Team quest not found');

    const { title, description, target_score, reward_points, start_date, end_date, status } = input ?? {};
    const targetScoreNum = target_score !== undefined ? Number(target_score) : undefined;
    const rewardPointsNum = reward_points !== undefined ? Number(reward_points) : undefined;

    if (title !== undefined && (typeof title !== 'string' || !title.trim())) throw new ApiError(400, 'Invalid title');
    if (targetScoreNum !== undefined && (!Number.isFinite(targetScoreNum) || targetScoreNum <= 0)) throw new ApiError(400, 'Invalid target_score');
    if (rewardPointsNum !== undefined && (!Number.isFinite(rewardPointsNum) || rewardPointsNum <= 0)) throw new ApiError(400, 'Invalid reward_points');
    if (status !== undefined && status !== 'active' && status !== 'completed') throw new ApiError(400, 'Invalid status');

    const row = db
      .prepare('SELECT title, description, target_score, reward_points, start_date, end_date, status FROM team_quests WHERE id = ?')
      .get(idNum) as any;

    db.prepare(`
      UPDATE team_quests
      SET title = ?, description = ?, target_score = ?, reward_points = ?, start_date = ?, end_date = ?, status = ?
      WHERE id = ?
    `).run(
      title ?? row.title,
      description ?? row.description,
      targetScoreNum ?? row.target_score,
      rewardPointsNum ?? row.reward_points,
      start_date ?? row.start_date,
      end_date ?? row.end_date,
      status ?? row.status,
      idNum,
    );
  }

  deleteTeamQuest(id: string) {
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const existing = db.prepare('SELECT id FROM team_quests WHERE id = ?').get(idNum);
    if (!existing) throw new ApiError(404, 'Team quest not found');

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM team_quest_progress WHERE quest_id = ?').run(idNum);
      db.prepare('DELETE FROM team_quests WHERE id = ?').run(idNum);
    });
    tx();
  }

  listTeamQuestProgress(queryInput: Record<string, any>) {
    const { quest_id, student_id } = queryInput ?? {};
    let query = 'SELECT * FROM team_quest_progress WHERE 1=1';
    const params: any[] = [];

    if (quest_id !== undefined) {
      const questIdNum = Number(quest_id);
      if (!Number.isFinite(questIdNum)) throw new ApiError(400, 'Invalid quest_id');
      query += ' AND quest_id = ?';
      params.push(questIdNum);
    }
    if (student_id !== undefined) {
      const studentIdNum = Number(student_id);
      if (!Number.isFinite(studentIdNum)) throw new ApiError(400, 'Invalid student_id');
      query += ' AND student_id = ?';
      params.push(studentIdNum);
    }

    return db.prepare(query).all(...params);
  }

  listGroupProgress(queryInput: Record<string, any>) {
    const { quest_id, class_id } = queryInput ?? {};
    const questIdNum = Number(quest_id);
    const classIdNum = Number(class_id);
    if (!Number.isFinite(questIdNum)) throw new ApiError(400, 'Invalid quest_id');
    if (!Number.isFinite(classIdNum)) throw new ApiError(400, 'Invalid class_id');

    const quest = db.prepare('SELECT id, target_score FROM team_quests WHERE id = ? AND class_id = ?').get(questIdNum, classIdNum) as
      | { id: number; target_score: number }
      | undefined;
    if (!quest) throw new ApiError(404, 'Team quest not found');

    const rows = db.prepare(`
        SELECT
          s.group_id as group_id,
          g.name as group_name,
          COALESCE(SUM(p.contribution_score), 0) as contribution_score
        FROM students s
        LEFT JOIN student_groups g ON g.id = s.group_id
        LEFT JOIN team_quest_progress p ON p.student_id = s.id AND p.quest_id = ?
        WHERE s.class_id = ?
        GROUP BY s.group_id, g.name
        ORDER BY g.name ASC
      `).all(questIdNum, classIdNum) as any[];

    return rows.map((row) => ({
      group_id: row.group_id ?? null,
      group_name: row.group_name ?? '未分组',
      contribution_score: Number(row.contribution_score) || 0,
      target_score: quest.target_score,
    }));
  }

  getStudentCurrentQuest(queryInput: Record<string, any>) {
    const { student_id } = queryInput ?? {};
    const studentIdNum = Number(student_id);
    if (!Number.isFinite(studentIdNum)) throw new ApiError(400, 'Invalid student_id');

    const student = db.prepare('SELECT id, class_id, group_id FROM students WHERE id = ?').get(studentIdNum) as
      | { id: number; class_id: number; group_id: number | null }
      | undefined;
    if (!student) throw new ApiError(404, 'Student not found');

    const quest = db.prepare("SELECT * FROM team_quests WHERE class_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").get(student.class_id) as any;
    if (!quest) return { quest: null };

    const members = student.group_id
      ? (db.prepare('SELECT id, name FROM students WHERE class_id = ? AND group_id = ? ORDER BY id ASC').all(student.class_id, student.group_id) as any[])
      : (db.prepare('SELECT id, name FROM students WHERE class_id = ? ORDER BY id ASC').all(student.class_id) as any[]);

    const myProgress = db
      .prepare('SELECT contribution_score FROM team_quest_progress WHERE quest_id = ? AND student_id = ?')
      .get(quest.id, studentIdNum) as { contribution_score: number } | undefined;

    const groupProgress = student.group_id
      ? (db.prepare(`
          SELECT COALESCE(SUM(p.contribution_score), 0) as contribution_score
          FROM students s
          LEFT JOIN team_quest_progress p ON p.student_id = s.id AND p.quest_id = ?
          WHERE s.class_id = ? AND s.group_id = ?
        `).get(quest.id, student.class_id, student.group_id) as { contribution_score: number })
      : (db.prepare(`
          SELECT COALESCE(SUM(p.contribution_score), 0) as contribution_score
          FROM students s
          LEFT JOIN team_quest_progress p ON p.student_id = s.id AND p.quest_id = ?
          WHERE s.class_id = ?
        `).get(quest.id, student.class_id) as { contribution_score: number });

    return {
      quest,
      team: {
        class_id: student.class_id,
        group_id: student.group_id ?? null,
        members: members.map((member) => ({ id: member.id, name: decrypt(member.name) })),
      },
      progress: {
        my_contribution_score: myProgress?.contribution_score ?? 0,
        team_contribution_score: groupProgress?.contribution_score ?? 0,
      },
    };
  }

  addTeamQuestProgress(input: Record<string, any>) {
    const { quest_id, student_id, contribution_score } = input ?? {};
    const questIdNum = Number(quest_id);
    const studentIdNum = Number(student_id);
    const scoreNum = Number(contribution_score);

    if (!Number.isFinite(questIdNum)) throw new ApiError(400, 'Missing or invalid quest_id');
    if (!Number.isFinite(studentIdNum)) throw new ApiError(400, 'Missing or invalid student_id');
    if (!Number.isFinite(scoreNum) || scoreNum <= 0) throw new ApiError(400, 'Missing or invalid contribution_score');

    const quest = db.prepare('SELECT id FROM team_quests WHERE id = ?').get(questIdNum);
    if (!quest) throw new ApiError(404, 'Team quest not found');

    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentIdNum);
    if (!student) throw new ApiError(404, 'Student not found');

    const existing = db
      .prepare('SELECT id, contribution_score FROM team_quest_progress WHERE quest_id = ? AND student_id = ?')
      .get(questIdNum, studentIdNum) as { id: number; contribution_score: number } | undefined;

    if (existing) {
      db.prepare('UPDATE team_quest_progress SET contribution_score = contribution_score + ? WHERE id = ?').run(scoreNum, existing.id);
      return existing.id;
    }

    const stmt = db.prepare(`
        INSERT INTO team_quest_progress (quest_id, student_id, contribution_score)
        VALUES (?, ?, ?)
      `);
    const info = stmt.run(questIdNum, studentIdNum, scoreNum);
    return info.lastInsertRowid;
  }

  listPeerReviews(queryInput: Record<string, any>) {
    const { reviewer_id, reviewee_id, assignment_id, team_quest_id } = queryInput ?? {};
    let query = 'SELECT * FROM peer_reviews WHERE 1=1';
    const params: any[] = [];

    if (reviewer_id !== undefined) {
      const reviewerIdNum = Number(reviewer_id);
      if (!Number.isFinite(reviewerIdNum)) throw new ApiError(400, 'Invalid reviewer_id');
      query += ' AND reviewer_id = ?';
      params.push(reviewerIdNum);
    }
    if (reviewee_id !== undefined) {
      const revieweeIdNum = Number(reviewee_id);
      if (!Number.isFinite(revieweeIdNum)) throw new ApiError(400, 'Invalid reviewee_id');
      query += ' AND reviewee_id = ?';
      params.push(revieweeIdNum);
    }
    if (assignment_id !== undefined) {
      const assignmentIdNum = Number(assignment_id);
      if (!Number.isFinite(assignmentIdNum)) throw new ApiError(400, 'Invalid assignment_id');
      query += ' AND assignment_id = ?';
      params.push(assignmentIdNum);
    }
    if (team_quest_id !== undefined) {
      const teamQuestIdNum = Number(team_quest_id);
      if (!Number.isFinite(teamQuestIdNum)) throw new ApiError(400, 'Invalid team_quest_id');
      query += ' AND team_quest_id = ?';
      params.push(teamQuestIdNum);
    }
    query += ' ORDER BY created_at DESC';

    return db.prepare(query).all(...params);
  }

  createPeerReview(input: Record<string, any>) {
    const { reviewer_id, reviewee_id, assignment_id, team_quest_id, score, comment } = input ?? {};
    const reviewerIdNum = Number(reviewer_id);
    const revieweeIdNum = Number(reviewee_id);
    const scoreNum = Number(score);

    if (!Number.isFinite(reviewerIdNum)) throw new ApiError(400, 'Missing or invalid reviewer_id');
    if (!Number.isFinite(revieweeIdNum)) throw new ApiError(400, 'Missing or invalid reviewee_id');
    if (!Number.isFinite(scoreNum) || scoreNum < 1 || scoreNum > 5) throw new ApiError(400, 'Missing or invalid score');

    const assignmentIdNum = assignment_id === undefined || assignment_id === null || assignment_id === '' ? null : Number(assignment_id);
    const teamQuestIdNum = team_quest_id === undefined || team_quest_id === null || team_quest_id === '' ? null : Number(team_quest_id);

    if (assignmentIdNum !== null && !Number.isFinite(assignmentIdNum)) throw new ApiError(400, 'Invalid assignment_id');
    if (teamQuestIdNum !== null && !Number.isFinite(teamQuestIdNum)) throw new ApiError(400, 'Invalid team_quest_id');
    if (assignmentIdNum === null && teamQuestIdNum === null) throw new ApiError(400, 'assignment_id or team_quest_id is required');

    const stmt = db.prepare(`
      INSERT INTO peer_reviews (reviewer_id, reviewee_id, assignment_id, team_quest_id, score, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      reviewerIdNum,
      revieweeIdNum,
      assignmentIdNum,
      teamQuestIdNum,
      scoreNum,
      typeof comment === 'string' && comment.trim() ? comment : null,
    );
    return info.lastInsertRowid;
  }
}
