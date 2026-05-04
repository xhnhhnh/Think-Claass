import db from '../../db.js';
import type { Assignment, AssignmentPayload, AssignmentsRepository, StudentAssignment, StudentAssignmentUpdatePayload } from './assignments.types.js';

export class SqliteAssignmentsRepository implements AssignmentsRepository {
  listAssignments(classId?: number) {
    const params: number[] = [];
    let query = 'SELECT * FROM assignments';
    if (classId !== undefined) {
      query += ' WHERE class_id = ?';
      params.push(classId);
    }
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params) as Assignment[];
  }

  createAssignment(input: AssignmentPayload) {
    const info = db
      .prepare('INSERT INTO assignments (class_id, teacher_id, title, description, due_date, reward_points) VALUES (?, ?, ?, ?, ?, ?)')
      .run(input.class_id, input.teacher_id, input.title, input.description ?? null, input.due_date ?? null, input.reward_points || 0);
    return Number(info.lastInsertRowid);
  }

  updateAssignment(id: number, input: Partial<AssignmentPayload>) {
    db.prepare('UPDATE assignments SET title = ?, description = ?, due_date = ?, reward_points = ? WHERE id = ?').run(
      input.title,
      input.description ?? null,
      input.due_date ?? null,
      input.reward_points ?? 0,
      id,
    );
  }

  deleteAssignment(id: number) {
    db.prepare('DELETE FROM student_assignments WHERE assignment_id = ?').run(id);
    db.prepare('DELETE FROM assignments WHERE id = ?').run(id);
  }

  listStudentAssignments(input: { studentId?: number; assignmentId?: number }) {
    const params: number[] = [];
    let query = 'SELECT * FROM student_assignments WHERE 1=1';
    if (input.studentId !== undefined) {
      query += ' AND student_id = ?';
      params.push(input.studentId);
    }
    if (input.assignmentId !== undefined) {
      query += ' AND assignment_id = ?';
      params.push(input.assignmentId);
    }
    return db.prepare(query).all(...params) as StudentAssignment[];
  }

  updateStudentAssignment(id: number, input: StudentAssignmentUpdatePayload) {
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.status !== undefined) {
      updates.push('status = ?');
      params.push(input.status);
      if (input.status === 'submitted' || input.status === 'completed') updates.push('submitted_at = CURRENT_TIMESTAMP');
    }
    if (input.content !== undefined) {
      updates.push('content = ?');
      params.push(input.content);
    }
    if (input.score !== undefined) {
      updates.push('score = ?');
      params.push(input.score);
    }
    if (input.teacher_feedback !== undefined) {
      updates.push('teacher_feedback = ?');
      params.push(input.teacher_feedback);
    }
    params.push(id);
    db.prepare(`UPDATE student_assignments SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
}
