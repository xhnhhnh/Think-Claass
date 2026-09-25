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

/**
 * The scope a caller may read through, resolved by the service from the actor - never from the
 * request. `teacherId` is the ownership anchor for a teacher; `classId` narrows an admin read, or
 * pins a student to the class their login sits in.
 */
export interface AssignmentScope {
  classId?: number;
  teacherId?: number;
}

/**
 * One `student_exams` row, joined to the exam it belongs to.
 *
 * The three `exam_*` fields are what makes the row self-describing: without them a student's
 * score is a number attached to an id, and the page that renders it has to ask a staff-only
 * route what the exam was called.
 */
export interface StudentExamRow {
  id: number;
  student_id: number;
  exam_id: number;
  score: number | null;
  feedback?: string | null;
  exam_title?: string | null;
  exam_date?: string | null;
  total_score?: number | null;
}

export interface AssignmentsRepository {
  listAssignments(scope?: AssignmentScope): Assignment[];
  createAssignment(input: AssignmentPayload): number;
  updateAssignment(id: number, input: Partial<AssignmentPayload>): void;
  deleteAssignment(id: number): void;
  getAssignment(id: number): Assignment | null;
  listStudentAssignments(input: { studentId?: number; assignmentId?: number; teacherId?: number }): StudentAssignment[];
  getStudentAssignment(id: number): StudentAssignment | null;
  updateStudentAssignment(id: number, input: StudentAssignmentUpdatePayload): void;
}

export interface ExamsRepository {
  transaction<T>(fn: () => T): T;
  listExams(scope?: AssignmentScope): Exam[];
  createExam(input: ExamPayload): number;
  listStudentIds(classId: number): Array<{ id: number }>;
  createStudentExam(examId: number, studentId: number): void;
  getExam(id: number): Exam | null;
  listGrades(examId: number): ExamGrade[];
  getStudentExam(examId: number, studentId: number): { id: number } | null;
  upsertGrade(examId: number, grade: SaveExamGradePayload): void;
  updateExam(id: number, input: Partial<ExamPayload>): void;
  deleteExam(id: number): void;
  listStudentExams(input: { studentId?: number; examId?: number; teacherId?: number }): StudentExamRow[];
  updateStudentExam(id: number, input: { score: number | null; feedback?: string | null }): void;
  getStudentExamById(id: number): { id: number; exam_id: number } | null;
}

/**
 * Assignments half of the domain.
 *
 * `deleteAssignment` deletes the child rows first: the original relied on statement order
 * rather than a `ON DELETE CASCADE`, and `student_assignments` has no cascade.
 */
export function createAssignmentsRepository(db: DbApi): AssignmentsRepository {
  return {
    listAssignments(scope = {}) {
      const params: SqlParam[] = [];
      const conditions: string[] = [];
      if (scope.classId !== undefined) {
        conditions.push('class_id = ?');
        params.push(scope.classId);
      }
      // The teacher's own rows: ownership lives on the row (`assignments.teacher_id`), so a
      // `class_id` naming someone else's class intersects to nothing instead of widening the read.
      if (scope.teacherId !== undefined) {
        conditions.push('teacher_id = ?');
        params.push(scope.teacherId);
      }
      let query = 'SELECT * FROM assignments';
      if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
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

    getAssignment(id) {
      return db.get<Assignment>('SELECT * FROM assignments WHERE id = ?', [id]) ?? null;
    },

    /**
     * `teacherId` restricts the answer to rows of the teacher's own assignments, by joining the
     * parent this plugin already owns - a teacher's "本班" is the classes their own work sits in.
     */
    listStudentAssignments(input) {
      const params: SqlParam[] = [];
      let query = 'SELECT sa.* FROM student_assignments sa';
      if (input.teacherId !== undefined) query += ' JOIN assignments a ON a.id = sa.assignment_id';
      query += ' WHERE 1=1';
      if (input.studentId !== undefined) {
        query += ' AND sa.student_id = ?';
        params.push(input.studentId);
      }
      if (input.assignmentId !== undefined) {
        query += ' AND sa.assignment_id = ?';
        params.push(input.assignmentId);
      }
      if (input.teacherId !== undefined) {
        query += ' AND a.teacher_id = ?';
        params.push(input.teacherId);
      }
      return db.query<StudentAssignment>(query, params);
    },

    getStudentAssignment(id) {
      return db.get<StudentAssignment>('SELECT * FROM student_assignments WHERE id = ?', [id]) ?? null;
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

    listExams(scope = {}) {
      const params: SqlParam[] = [];
      const conditions: string[] = [];
      if (scope.classId !== undefined) {
        conditions.push('class_id = ?');
        params.push(scope.classId);
      }
      // Same ownership anchor as `listAssignments`: `exams.teacher_id` is the teacher's class.
      if (scope.teacherId !== undefined) {
        conditions.push('teacher_id = ?');
        params.push(scope.teacherId);
      }
      let query = 'SELECT * FROM exams';
      if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
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

    /**
     * `teacherId` restricts the answer to rows of the teacher's own exams, by joining the parent
     * this plugin already owns - same reasoning as `listStudentAssignments`.
     */
    /**
     * A student's exam rows, **with the exam's own title, date and total score**.
     *
     * The join is not decoration. `student_exams` carries only `exam_id` and `score`, so a row
     * on its own cannot say what the exam was called or what it was out of - and the student's
     * own page was filling that gap by calling `GET /api/exams?class_id=…`, which is a
     * **staff-only** route (`requireActorRole(req, STAFF)`). The student therefore got a 403 on
     * every visit to 学业中心 and silently fell back to 「考试 #12」 with a total of 100.
     *
     * The teacher's path already joined `exams` to scope the read by `teacher_id`; the join is
     * now unconditional and the columns are selected explicitly. `SELECT se.*` would still work,
     * but naming the exam columns through the join is what makes the payload self-describing.
     */
    listStudentExams(input) {
      const params: SqlParam[] = [];
      let query =
        'SELECT se.*, e.title AS exam_title, e.exam_date AS exam_date, e.total_score AS total_score' +
        ' FROM student_exams se JOIN exams e ON e.id = se.exam_id WHERE 1=1';
      if (input.studentId !== undefined) {
        query += ' AND se.student_id = ?';
        params.push(input.studentId);
      }
      if (input.examId !== undefined) {
        query += ' AND se.exam_id = ?';
        params.push(input.examId);
      }
      if (input.teacherId !== undefined) {
        query += ' AND e.teacher_id = ?';
        params.push(input.teacherId);
      }
      return db.query<StudentExamRow>(query, params);
    },

    updateStudentExam(id, input) {
      db.run('UPDATE student_exams SET score = ?, feedback = ? WHERE id = ?', [
        input.score,
        input.feedback ?? null,
        id,
      ]);
    },

    getStudentExamById(id) {
      return (
        db.get<{ id: number; exam_id: number }>('SELECT id, exam_id FROM student_exams WHERE id = ?', [id]) ?? null
      );
    },
  };
}
