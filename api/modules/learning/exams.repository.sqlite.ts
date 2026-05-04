import db, { decrypt } from '../../db.js';
import type { Exam, ExamGrade, ExamPayload, ExamsRepository, SaveExamGradePayload } from './exams.types.js';

export class SqliteExamsRepository implements ExamsRepository {
  transaction<T>(fn: () => T): T {
    return db.transaction(fn)();
  }

  listExams(classId?: number) {
    const params: number[] = [];
    let query = 'SELECT * FROM exams';
    if (classId !== undefined) {
      query += ' WHERE class_id = ?';
      params.push(classId);
    }
    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params) as Exam[];
  }

  createExam(input: ExamPayload) {
    const info = db
      .prepare('INSERT INTO exams (class_id, teacher_id, title, description, exam_date, total_score) VALUES (?, ?, ?, ?, ?, ?)')
      .run(input.class_id, input.teacher_id, input.title, input.description ?? null, input.exam_date ?? null, input.total_score);
    return Number(info.lastInsertRowid);
  }

  listStudentIds(classId: number) {
    return db.prepare('SELECT id FROM students WHERE class_id = ?').all(classId) as Array<{ id: number }>;
  }

  createStudentExam(examId: number, studentId: number) {
    db.prepare('INSERT INTO student_exams (exam_id, student_id, score, feedback) VALUES (?, ?, ?, ?)').run(examId, studentId, null, null);
  }

  getExam(id: number) {
    return db.prepare('SELECT * FROM exams WHERE id = ?').get(id) as Exam | null;
  }

  listGrades(examId: number) {
    return db
      .prepare(
        `
        SELECT se.id, se.exam_id, se.student_id, se.score, se.feedback, s.name as student_name
        FROM student_exams se
        JOIN students s ON s.id = se.student_id
        WHERE se.exam_id = ?
        ORDER BY s.id ASC
      `,
      )
      .all(examId)
      .map((grade: any) => ({ ...grade, student_name: decrypt(grade.student_name) })) as ExamGrade[];
  }

  getStudentExam(examId: number, studentId: number) {
    return db.prepare('SELECT id FROM student_exams WHERE exam_id = ? AND student_id = ?').get(examId, studentId) as { id: number } | null;
  }

  upsertGrade(examId: number, grade: SaveExamGradePayload) {
    if (!this.getStudentExam(examId, grade.student_id)) this.createStudentExam(examId, grade.student_id);
    db.prepare('UPDATE student_exams SET score = ?, feedback = ? WHERE exam_id = ? AND student_id = ?').run(
      grade.score,
      grade.feedback ?? null,
      examId,
      grade.student_id,
    );
  }

  updateExam(id: number, input: Partial<ExamPayload>) {
    const row = this.getExam(id)!;
    db.prepare('UPDATE exams SET title = ?, description = ?, exam_date = ?, total_score = ? WHERE id = ?').run(
      input.title ?? row.title,
      input.description ?? row.description,
      input.exam_date ?? row.exam_date,
      input.total_score ?? row.total_score,
      id,
    );
  }

  deleteExam(id: number) {
    db.prepare('DELETE FROM student_exams WHERE exam_id = ?').run(id);
    db.prepare('DELETE FROM exams WHERE id = ?').run(id);
  }

  listStudentExams(input: { studentId?: number; examId?: number }) {
    const params: number[] = [];
    let query = 'SELECT * FROM student_exams WHERE 1=1';
    if (input.studentId !== undefined) {
      query += ' AND student_id = ?';
      params.push(input.studentId);
    }
    if (input.examId !== undefined) {
      query += ' AND exam_id = ?';
      params.push(input.examId);
    }
    return db.prepare(query).all(...params);
  }

  updateStudentExam(id: number, input: { score: number | null; feedback?: string | null }) {
    db.prepare('UPDATE student_exams SET score = ?, feedback = ? WHERE id = ?').run(input.score, input.feedback ?? null, id);
  }

  getStudentExamById(id: number) {
    return db.prepare('SELECT id FROM student_exams WHERE id = ?').get(id) as { id: number } | null;
  }
}
