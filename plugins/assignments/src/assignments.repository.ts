/**
 * Assignments repository.
 *
 * The SQL is relocated from `api/modules/learning/assignments.repository.sqlite.ts` and
 * `exams.repository.sqlite.ts` unchanged; only the connection changes - `ctx.db` instead
 * of the raw `api/db.ts` handle, so every statement is checked against the tables the
 * manifest declares.
 *
 * Two things are injected rather than imported, because a plugin may not reach into
 * `api/**`:
 *
 *  - the transaction wrapper: `api/db.ts` exposed better-sqlite3's own `db.transaction`,
 *    while `DbApi` publishes `tx(fn)`. `ExamsService.createExam` needs the whole
 *    "insert the exam, then one `student_exams` row per classmate" to be atomic, so the
 *    repository still owns the boundary and the service still just calls `transaction()`.
 *  - the name decryptor: `student_name` is AES-encrypted at rest and the key belongs to
 *    the application, so the host injects `config.decryptName` (same mechanism the
 *    classroom plugin uses for `StudentSnapshot.name`).
 */

import type { DbApi, SqlParam } from '@thinkclass/plugin-sdk';
import type {
  Assignment,
  AssignmentPayload,
  Exam,
  ExamGrade,
  ExamPayload,
  SaveExamGradePayload,
  StudentAssignment,
  StudentAssignmentUpdatePayload,
} from '@thinkclass/contracts/domains/learning';

export interface AssignmentsRepository {
  listAssignments(classId?: number): Assignment[];
  createAssignment(input: AssignmentPayload): number;
  updateAssignment(id: number, input: Partial<AssignmentPayload>): void;
  deleteAssignment(id: number): void;
  listStudentAssignments(input: { studentId?: number; assignmentId?: number }): StudentAssignment[];
  updateStudentAssignment(id: number, input: StudentAssignmentUpdatePayload): void;
}

export interface ExamsRepository {
  transaction<T>(fn: () => T): T;
  listExams(classId?: number): Exam[];
  createExam(input: ExamPayload): number;
  listStudentIds(classId: number): Array<{ id: number }>;
  createStudentExam(examId: number, studentId: number): void;
  getExam(id: number): Exam | null;
  listGrades(examId: number): ExamGrade[];
  getStudentExam(examId: number, studentId: number): { id: number } | null;
  upsertGrade(examId: number, grade: SaveExamGradePayload): void;
  updateExam(id: number, input: Partial<ExamPayload>): void;
  deleteExam(id: number): void;
  listStudentExams(input: { studentId?: number; examId?: number }): unknown[];
  updateStudentExam(id: number, input: { score: number | null; feedback?: string | null }): void;
  getStudentExamById(id: number): { id: number } | null;
}

/**
 * Assignments half of the domain.
 *
 * `deleteAssignment` deletes the child rows first: the original relied on statement order
 * rather than a `ON DELETE CASCADE`, and `student_assignments` has no cascade.
 */
export function createAssignmentsRepository(db: DbApi): AssignmentsRepository {
  return {
    listAssignments(classId) {
      const params: SqlParam[] = [];
      let query = 'SELECT * FROM assignments';
      if (classId !== undefined) {
        query += ' WHERE class_id = ?';
        params.push(classId);
      }
      query += ' ORDER BY created_at DESC';
      return db.query<Assignment>(query, params);
    },

    createAssignment(input) {
      const info = db.run(
        'INSERT INTO assignments (class_id, teacher_id, title, description, due_date, reward_points) VALUES (?, ?, ?, ?, ?, ?)',
        [
          input.class_id,
          input.teacher_id,
          input.title,
          input.description ?? null,
          input.due_date ?? null,
          input.reward_points || 0,
        ],
      );
      return Number(info.lastInsertRowid);
    },

    updateAssignment(id, input) {
      db.run('UPDATE assignments SET title = ?, description = ?, due_date = ?, reward_points = ? WHERE id = ?', [
        input.title ?? null,
        input.description ?? null,
        input.due_date ?? null,
        input.reward_points ?? 0,
        id,
      ]);
    },

    deleteAssignment(id) {
      db.run('DELETE FROM student_assignments WHERE assignment_id = ?', [id]);
      db.run('DELETE FROM assignments WHERE id = ?', [id]);
    },

    listStudentAssignments(input) {
      const params: SqlParam[] = [];
      let query = 'SELECT * FROM student_assignments WHERE 1=1';
      if (input.studentId !== undefined) {
        query += ' AND student_id = ?';
        params.push(input.studentId);
      }
      if (input.assignmentId !== undefined) {
        query += ' AND assignment_id = ?';
        params.push(input.assignmentId);
      }
      return db.query<StudentAssignment>(query, params);
    },

    /**
     * Dynamic SET list, exactly as before.
     *
     * An empty `input` produces the statement `UPDATE student_assignments SET  WHERE ...`,
     * which is a syntax error - but `AssignmentsService.updateStudentAssignment` rejects
     * an empty body with 400 before reaching here, so the path is unreachable through
     * HTTP and the behavior is preserved rather than "fixed".
     */
    updateStudentAssignment(id, input) {
      const updates: string[] = [];
      const params: unknown[] = [];
      if (input.status !== undefined) {
        updates.push('status = ?');
        params.push(input.status);
        if (input.status === 'submitted' || input.status === 'completed') {
          updates.push('submitted_at = CURRENT_TIMESTAMP');
        }
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
      db.run(`UPDATE student_assignments SET ${updates.join(', ')} WHERE id = ?`, params as SqlParam[]);
    },
  };
}

/** Exams half of the domain. */
export function createExamsRepository(
  db: DbApi,
  options: { decryptName?: (value: string) => string } = {},
): ExamsRepository {
  const decryptName = options.decryptName ?? ((value: string) => value);

  return {
    transaction<T>(fn: () => T): T {
      return db.tx(fn);
    },

    listExams(classId) {
      const params: SqlParam[] = [];
      let query = 'SELECT * FROM exams';
      if (classId !== undefined) {
        query += ' WHERE class_id = ?';
        params.push(classId);
      }
      query += ' ORDER BY created_at DESC';
      return db.query<Exam>(query, params);
    },

    createExam(input) {
      const info = db.run(
        'INSERT INTO exams (class_id, teacher_id, title, description, exam_date, total_score) VALUES (?, ?, ?, ?, ?, ?)',
        [
          input.class_id,
          input.teacher_id,
          input.title,
          input.description ?? null,
          input.exam_date ?? null,
          input.total_score,
        ],
      );
      return Number(info.lastInsertRowid);
    },

    listStudentIds(classId) {
      return db.query<{ id: number }>('SELECT id FROM students WHERE class_id = ?', [classId]);
    },

    createStudentExam(examId, studentId) {
      db.run('INSERT INTO student_exams (exam_id, student_id, score, feedback) VALUES (?, ?, ?, ?)', [
        examId,
        studentId,
        null,
        null,
      ]);
    },

    getExam(id) {
      return db.get<Exam>('SELECT * FROM exams WHERE id = ?', [id]) ?? null;
    },

    listGrades(examId) {
      return db
        .query<ExamGrade>(
          `SELECT se.id, se.exam_id, se.student_id, se.score, se.feedback, s.name as student_name
           FROM student_exams se
           JOIN students s ON s.id = se.student_id
           WHERE se.exam_id = ?
           ORDER BY s.id ASC`,
          [examId],
        )
        .map((grade) => ({ ...grade, student_name: decryptName(String(grade.student_name)) }));
    },

    getStudentExam(examId, studentId) {
      return (
        db.get<{ id: number }>('SELECT id FROM student_exams WHERE exam_id = ? AND student_id = ?', [
          examId,
          studentId,
        ]) ?? null
      );
    },

    upsertGrade(examId, grade) {
      if (!this.getStudentExam(examId, grade.student_id)) this.createStudentExam(examId, grade.student_id);
      db.run('UPDATE student_exams SET score = ?, feedback = ? WHERE exam_id = ? AND student_id = ?', [
        grade.score,
        grade.feedback ?? null,
        examId,
        grade.student_id,
      ]);
    },

    /**
     * `input.x ?? row.x` fallbacks, not a dynamic SET list: an explicit `null` therefore
     * keeps the stored value, which is the original behavior and is what the service's
     * `updateExam` validation is written against.
     */
    updateExam(id, input) {
      const row = this.getExam(id)!;
      db.run('UPDATE exams SET title = ?, description = ?, exam_date = ?, total_score = ? WHERE id = ?', [
        input.title ?? row.title,
        input.description ?? row.description,
        input.exam_date ?? row.exam_date,
        input.total_score ?? row.total_score,
        id,
      ]);
    },

    deleteExam(id) {
      db.run('DELETE FROM student_exams WHERE exam_id = ?', [id]);
      db.run('DELETE FROM exams WHERE id = ?', [id]);
    },

    listStudentExams(input) {
      const params: SqlParam[] = [];
      let query = 'SELECT * FROM student_exams WHERE 1=1';
      if (input.studentId !== undefined) {
        query += ' AND student_id = ?';
        params.push(input.studentId);
      }
      if (input.examId !== undefined) {
        query += ' AND exam_id = ?';
        params.push(input.examId);
      }
      return db.query(query, params);
    },

    updateStudentExam(id, input) {
      db.run('UPDATE student_exams SET score = ?, feedback = ? WHERE id = ?', [
        input.score,
        input.feedback ?? null,
        id,
      ]);
    },

    getStudentExamById(id) {
      return db.get<{ id: number }>('SELECT id FROM student_exams WHERE id = ?', [id]) ?? null;
    },
  };
}
