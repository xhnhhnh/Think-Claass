/**
 * Assignments plugin tests.
 *
 * Two layers:
 *
 *  1. the two service tests relocated from `api/modules/learning/assignments.service.test.ts`
 *     and `exams.service.test.ts` (same fakes, same assertions), so the move is provably
 *     behavior-preserving at the level the original suite covered;
 *  2. a real-SQLite layer that runs the repository against a database and a `DbApi` built
 *     from the manifest's data declaration with ownership checking ON, plus the envelope
 *     shapes the controllers produce - including the two easy-to-break "spread the result
 *     into the envelope as well as nesting it" cases.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, openDatabase, type Database } from '@thinkclass/kernel';
import { createDbApi, type DbApi } from '@thinkclass/plugin-runtime';
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

import {
  createAssignmentsRepository,
  createExamsRepository,
  type AssignmentsRepository,
  type ExamsRepository,
} from '../../plugins/assignments/src/assignments.repository.js';
import { AssignmentsService, ExamsService } from '../../plugins/assignments/src/assignments.service.js';
import { AssignmentsController, ExamsController } from '../../plugins/assignments/src/assignments.controllers.js';

class FakeAssignmentsRepository implements AssignmentsRepository {
  assignments = new Map<number, Assignment>();
  studentAssignments = new Map<number, StudentAssignment>();
  nextId = 1;

  listAssignments(classId?: number) {
    return [...this.assignments.values()].filter(
      (assignment) => classId === undefined || assignment.class_id === classId,
    );
  }
  createAssignment(input: AssignmentPayload) {
    const id = this.nextId++;
    this.assignments.set(id, { id, description: null, due_date: null, reward_points: 0, ...input });
    return id;
  }
  updateAssignment(id: number, input: Partial<AssignmentPayload>) {
    const assignment = this.assignments.get(id)!;
    this.assignments.set(id, { ...assignment, ...input });
  }
  deleteAssignment(id: number) {
    this.assignments.delete(id);
  }
  listStudentAssignments(input: { studentId?: number; assignmentId?: number }) {
    return [...this.studentAssignments.values()].filter(
      (record) =>
        (input.studentId === undefined || record.student_id === input.studentId) &&
        (input.assignmentId === undefined || record.assignment_id === input.assignmentId),
    );
  }
  updateStudentAssignment(id: number, input: StudentAssignmentUpdatePayload) {
    const record = this.studentAssignments.get(id)!;
    this.studentAssignments.set(id, { ...record, ...input });
  }
}

class FakeExamsRepository implements ExamsRepository {
  exams = new Map<number, Exam>();
  grades = new Map<string, ExamGrade>();
  nextId = 1;
  /** Set by a test to observe that the service really wrapped its writes. */
  transactions = 0;

  transaction<T>(fn: () => T): T {
    this.transactions += 1;
    return fn();
  }
  listExams(classId?: number) {
    return [...this.exams.values()].filter((exam) => classId === undefined || exam.class_id === classId);
  }
  createExam(input: ExamPayload) {
    const id = this.nextId++;
    this.exams.set(id, { id, created_at: '', description: null, exam_date: null, ...input });
    return id;
  }
  listStudentIds() {
    return [{ id: 10 }, { id: 11 }];
  }
  createStudentExam(examId: number, studentId: number) {
    this.grades.set(`${examId}:${studentId}`, {
      id: studentId,
      exam_id: examId,
      student_id: studentId,
      student_name: `S${studentId}`,
      score: null,
      feedback: null,
    });
  }
  getExam(id: number) {
    return this.exams.get(id) ?? null;
  }
  listGrades(examId: number) {
    return [...this.grades.values()].filter((grade) => grade.exam_id === examId);
  }
  getStudentExam(examId: number, studentId: number) {
    return this.grades.has(`${examId}:${studentId}`) ? { id: studentId } : null;
  }
  upsertGrade(examId: number, grade: SaveExamGradePayload) {
    if (!this.getStudentExam(examId, grade.student_id)) this.createStudentExam(examId, grade.student_id);
    const existing = this.grades.get(`${examId}:${grade.student_id}`)!;
    this.grades.set(`${examId}:${grade.student_id}`, {
      ...existing,
      score: grade.score,
      feedback: grade.feedback ?? null,
    });
  }
  updateExam(id: number, input: Partial<ExamPayload>) {
    this.exams.set(id, { ...this.exams.get(id)!, ...input });
  }
  deleteExam(id: number) {
    this.exams.delete(id);
  }
  listStudentExams() {
    return [...this.grades.values()];
  }
  updateStudentExam() {}
  getStudentExamById() {
    return { id: 1 };
  }
}

describe('AssignmentsService (relocated)', () => {
  let repository: FakeAssignmentsRepository;
  let service: AssignmentsService;

  beforeEach(() => {
    repository = new FakeAssignmentsRepository();
    service = new AssignmentsService(repository);
  });

  it('creates, filters, and deletes assignments', () => {
    const created = service.createAssignment({ class_id: 1, teacher_id: 2, title: '阅读' });
    service.createAssignment({ class_id: 2, teacher_id: 2, title: '数学' });
    expect(service.listAssignments(1)).toHaveLength(1);
    service.deleteAssignment(created.id);
    expect(service.listAssignments()).toHaveLength(1);
  });

  it('rejects empty updates for student assignments', () => {
    expect(() => service.updateStudentAssignment(1, {})).toThrow(ApiError);
  });

  it('trims the title and defaults reward_points to 0', () => {
    service.createAssignment({ class_id: 1, teacher_id: 2, title: '  阅读  ' });
    expect([...repository.assignments.values()][0]).toMatchObject({ title: '阅读', reward_points: 0 });
  });

  it('rejects a missing title and a bad class_id', () => {
    expect(() => service.createAssignment({ class_id: 1, teacher_id: 2, title: '' })).toThrow('Missing title');
    expect(() => service.createAssignment({ class_id: 0, teacher_id: 2, title: 'x' })).toThrow(
      'class_id is invalid',
    );
  });
});

describe('ExamsService (relocated)', () => {
  let repository: FakeExamsRepository;
  let service: ExamsService;

  beforeEach(() => {
    repository = new FakeExamsRepository();
    service = new ExamsService(repository);
  });

  it('creates exam and initializes student grade rows', () => {
    const created = service.createExam({ class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    expect(service.getGrades(created.id).grades).toHaveLength(2);
  });

  it('saves grades and rejects missing exams', () => {
    const created = service.createExam({ class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    service.saveGrades(created.id, [{ student_id: 10, score: 95 }]);
    expect(service.getGrades(created.id).grades.find((grade) => grade.student_id === 10)?.score).toBe(95);
    expect(() => service.getGrades(999)).toThrow(ApiError);
  });

  it('seeds the grade rows inside one transaction', () => {
    service.createExam({ class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    expect(repository.transactions).toBe(1);
  });

  it('rolls nothing back when the title is missing, because it validates first', () => {
    // The transaction is opened only after every validation passes, which is why a bad
    // request leaves no half-created exam behind.
    expect(() => service.createExam({ class_id: 1, teacher_id: 2, title: '', total_score: 100 })).toThrow(
      'Missing title',
    );
    expect(repository.transactions).toBe(0);
    expect(repository.exams.size).toBe(0);
  });

  it('rejects a non-positive total_score', () => {
    expect(() => service.createExam({ class_id: 1, teacher_id: 2, title: '期中', total_score: 0 })).toThrow(
      'total_score is invalid',
    );
  });

  it('rejects an empty grade list', () => {
    const created = service.createExam({ class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    expect(() => service.saveGrades(created.id, [])).toThrow('Missing grades');
  });

  it('rejects a negative score', () => {
    const created = service.createExam({ class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    expect(() => service.saveGrades(created.id, [{ student_id: 10, score: -1 }])).toThrow('Invalid score');
  });

  it('reports a missing student-exam record on update', () => {
    const repository = new FakeExamsRepository();
    repository.getStudentExamById = () => null;
    const service = new ExamsService(repository);
    expect(() => service.updateStudentExam(1, { score: 10 })).toThrow('Student exam record not found');
  });
});

describe('controller envelope shapes', () => {
  it('spreads the created assignment into the envelope as well as nesting it', () => {
    const service = { createAssignment: vi.fn(() => ({ id: 7 })) };
    const controller = new AssignmentsController(service as never);

    // `ok(data, data)` - the id appears at the top level too. That redundancy is part of
    // the shipped contract, so it is asserted rather than tidied away.
    expect(controller.createAssignment({} as never)).toEqual({ success: true, data: { id: 7 }, id: 7 });
  });

  it('does the same for a created exam and for the grade sheet', () => {
    const exams = { createExam: vi.fn(() => ({ id: 3 })), getGrades: vi.fn(() => ({ exam: { id: 3 }, grades: [] })) };
    const controller = new ExamsController(exams as never);

    expect(controller.createExam({} as never)).toEqual({ success: true, data: { id: 3 }, id: 3 });
    expect(controller.getGrades('3')).toEqual({
      success: true,
      data: { exam: { id: 3 }, grades: [] },
      exam: { id: 3 },
      grades: [],
    });
  });

  it('passes the raw query through so the service owns numeric validation', () => {
    const service = { listAssignments: vi.fn(() => []) };
    const controller = new AssignmentsController(service as never);

    controller.listAssignments('1');
    expect(service.listAssignments).toHaveBeenCalledWith('1');
  });
});

/**
 * Run the real SQL against a real database through the manifest's declaration, with
 * ownership checking ON. A statement naming an undeclared table throws here.
 */
describe('shipped SQL matches the manifest data declaration', () => {
  /** Mirrors `plugins/assignments/plugin.json` -> `data`. */
  const DECLARED = {
    adopted: ['assignments', 'student_assignments', 'exams', 'student_exams'],
    reads: ['students'],
  };

  let db: Database;
  let api: DbApi;

  beforeEach(() => {
    db = openDatabase(':memory:');
    db.exec(`
      CREATE TABLE students (
        id INTEGER PRIMARY KEY, user_id INTEGER, class_id INTEGER, name TEXT,
        total_points INTEGER DEFAULT 0, available_points INTEGER DEFAULT 0
      );
      CREATE TABLE assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER, teacher_id INTEGER, title TEXT,
        description TEXT, due_date TEXT, reward_points INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE student_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER, student_id INTEGER,
        status TEXT DEFAULT 'pending', content TEXT, score REAL, teacher_feedback TEXT,
        submitted_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER, teacher_id INTEGER, title TEXT,
        description TEXT, exam_date TEXT, total_score REAL DEFAULT 100,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE student_exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, student_id INTEGER,
        score REAL, feedback TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Names are AES-encrypted at rest in production; the injectable decryptor is the seam
    // that lets this be observed without the key.
    api = createDbApi({
      db,
      pluginId: 'assignments',
      ownedTables: new Set(DECLARED.adopted),
      readTables: new Set(DECLARED.reads),
      strict: true,
    });
  });

  it('every repository statement passes the ownership check', () => {
    const assignments = createAssignmentsRepository(api);
    const exams = createExamsRepository(api);

    expect(() => assignments.listAssignments(1)).not.toThrow();
    expect(() => assignments.createAssignment({ class_id: 1, teacher_id: 2, title: 't' })).not.toThrow();
    expect(() => assignments.updateAssignment(1, { title: 't' })).not.toThrow();
    expect(() => assignments.deleteAssignment(1)).not.toThrow();
    expect(() => assignments.listStudentAssignments({ studentId: 1 })).not.toThrow();
    expect(() => assignments.updateStudentAssignment(1, { status: 'submitted' })).not.toThrow();

    expect(() => exams.listExams(1)).not.toThrow();
    expect(() => exams.createExam({ class_id: 1, teacher_id: 2, title: 't', total_score: 100 })).not.toThrow();
    expect(() => exams.listStudentIds(1)).not.toThrow();
    expect(() => exams.getExam(1)).not.toThrow();
    expect(() => exams.listGrades(1)).not.toThrow();
    expect(() => exams.deleteExam(1)).not.toThrow();
    expect(() => exams.listStudentExams({ studentId: 1 })).not.toThrow();
    expect(() => exams.updateStudentExam(1, { score: 1 })).not.toThrow();
    expect(() => exams.getStudentExamById(1)).not.toThrow();
  });

  it('refuses a write to a table the plugin only declared as read', () => {
    // Non-vacuity: the harness can fail. `students` is classroom-owned; a write is refused.
    expect(() => api.run('UPDATE students SET total_points = 1 WHERE id = ?', [1])).toThrow(
      /may not write to table "students"/,
    );
  });

  it('creates one grade row per pupil, and the transaction really rolls back', () => {
    db.exec(`
      INSERT INTO students (id, class_id, name) VALUES (10, 1, 'enc:小明'), (11, 1, 'enc:小红'), (12, 2, 'enc:他班');
    `);

    const exams = createExamsRepository(api, { decryptName: (value) => value.replace(/^enc:/, '') });
    const service = new ExamsService(exams);

    const created = service.createExam({ class_id: 1, teacher_id: 2, title: ' 期中 ', total_score: 100 });

    // Only the two pupils in class 1, the title trimmed, and the names decrypted.
    const { grades } = service.getGrades(created.id);
    expect(grades.map((g) => g.student_id)).toEqual([10, 11]);
    expect(grades.map((g) => g.student_name)).toEqual(['小明', '小红']);
    expect(exams.getExam(created.id)?.title).toBe('期中');

    // A failure inside the transaction leaves nothing behind - this is the reason the
    // repository owns the boundary rather than the service looping without one.
    expect(() => {
      exams.transaction(() => {
        exams.createExam({ class_id: 1, teacher_id: 2, title: 'rollback', total_score: 100 });
        throw new Error('boom');
      });
    }).toThrow('boom');
    expect(db.prepare('SELECT COUNT(*) AS n FROM exams').get()).toEqual({ n: 1 });
  });

  it('deleteAssignment removes the child rows first', () => {
    const assignments = createAssignmentsRepository(api);
    const id = assignments.createAssignment({ class_id: 1, teacher_id: 2, title: 'x' });
    api.run('INSERT INTO student_assignments (assignment_id, student_id) VALUES (?, ?)', [id, 10]);

    assignments.deleteAssignment(id);

    expect(db.prepare('SELECT COUNT(*) AS n FROM assignments').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM student_assignments').get()).toEqual({ n: 0 });
  });

  it('updateStudentAssignment stamps submitted_at only for the two terminal statuses', () => {
    const assignments = createAssignmentsRepository(api);
    const id = assignments.createAssignment({ class_id: 1, teacher_id: 2, title: 'x' });
    api.run(
      'INSERT INTO student_assignments (assignment_id, student_id, status) VALUES (?, ?, ?)',
      [id, 10, 'pending'],
    );
    const rowId = (db.prepare('SELECT id FROM student_assignments').get() as { id: number }).id;

    assignments.updateStudentAssignment(rowId, { status: 'in_progress' });
    expect(
      (db.prepare('SELECT submitted_at FROM student_assignments WHERE id = ?').get(rowId) as {
        submitted_at: string | null;
      }).submitted_at,
    ).toBeNull();

    assignments.updateStudentAssignment(rowId, { status: 'submitted' });
    expect(
      (db.prepare('SELECT submitted_at FROM student_assignments WHERE id = ?').get(rowId) as {
        submitted_at: string | null;
      }).submitted_at,
    ).not.toBeNull();
  });

  it('updateExam keeps the stored value when a field is null', () => {
    // `input.x ?? row.x` rather than a dynamic SET list, so an explicit null is a no-op.
    const exams = createExamsRepository(api);
    const id = exams.createExam({ class_id: 1, teacher_id: 2, title: '原标题', total_score: 100 });

    exams.updateExam(id, { title: '新标题', description: null });

    expect(exams.getExam(id)).toMatchObject({ title: '新标题', total_score: 100 });
  });
});
