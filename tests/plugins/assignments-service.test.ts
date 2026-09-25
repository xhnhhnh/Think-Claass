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
 *
 * The service layer now takes the caller the controller resolved from the kernel's request
 * context, because every route of this plugin used to be anonymous (matrix `无鉴权`). So the
 * relocated assertions below pass an actor too, and a third layer asserts what that actor buys:
 * a teacher's own rows, a student's own row, and a refusal for anyone else's.
 */

import type { Request } from 'express';
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

import type { RequestActor } from '../../plugins/assignments/src/assignments.authorization.js';
import {
  createAssignmentsRepository,
  createExamsRepository,
  type AssignmentScope,
  type AssignmentsRepository,
  type ExamsRepository,
} from '../../plugins/assignments/src/assignments.repository.js';
import { AssignmentsService, ExamsService } from '../../plugins/assignments/src/assignments.service.js';
import { AssignmentsController, ExamsController } from '../../plugins/assignments/src/assignments.controllers.js';

/** A request whose kernel context carries an actor, as the middleware would leave it. */
function requestWith(actor: { userId: number; role: string; studentId?: number; classId?: number } | null): Request {
  return { context: { requestId: 'test', actor, authSource: actor ? 'session' : 'none' } } as unknown as Request;
}

const TEACHER: RequestActor = { id: 2, role: 'teacher', studentId: null, classId: null };
const OTHER_TEACHER: RequestActor = { id: 3, role: 'teacher', studentId: null, classId: null };
const ADMIN: RequestActor = { id: 1, role: 'admin', studentId: null, classId: null };
const STUDENT: RequestActor = { id: 8, role: 'student', studentId: 10, classId: 1 };
const PARENT: RequestActor = { id: 9, role: 'parent', studentId: 10, classId: 1 };

class FakeAssignmentsRepository implements AssignmentsRepository {
  assignments = new Map<number, Assignment>();
  studentAssignments = new Map<number, StudentAssignment>();
  nextId = 1;

  listAssignments(scope: AssignmentScope = {}) {
    return [...this.assignments.values()].filter(
      (assignment) =>
        (scope.classId === undefined || assignment.class_id === scope.classId) &&
        (scope.teacherId === undefined || assignment.teacher_id === scope.teacherId),
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
  getAssignment(id: number) {
    return this.assignments.get(id) ?? null;
  }
  listStudentAssignments(input: { studentId?: number; assignmentId?: number; teacherId?: number }) {
    return [...this.studentAssignments.values()].filter((record) => {
      // Mirrors the SQL: the teacher filter is a join on the parent, not a column of the row.
      if (input.teacherId !== undefined && this.assignments.get(record.assignment_id)?.teacher_id !== input.teacherId) {
        return false;
      }
      return (
        (input.studentId === undefined || record.student_id === input.studentId) &&
        (input.assignmentId === undefined || record.assignment_id === input.assignmentId)
      );
    });
  }
  getStudentAssignment(id: number) {
    return this.studentAssignments.get(id) ?? null;
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
  listExams(scope: AssignmentScope = {}) {
    return [...this.exams.values()].filter(
      (exam) =>
        (scope.classId === undefined || exam.class_id === scope.classId) &&
        (scope.teacherId === undefined || exam.teacher_id === scope.teacherId),
    );
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
  listStudentExams(input: { studentId?: number; examId?: number; teacherId?: number } = {}) {
    return [...this.grades.values()].filter((grade) => {
      if (input.teacherId !== undefined && this.exams.get(grade.exam_id)?.teacher_id !== input.teacherId) return false;
      return (
        (input.studentId === undefined || grade.student_id === input.studentId) &&
        (input.examId === undefined || grade.exam_id === input.examId)
      );
    });
  }
  updateStudentExam() {}
  getStudentExamById(id: number) {
    const grade = [...this.grades.values()].find((entry) => entry.id === id);
    return grade ? { id: grade.id, exam_id: grade.exam_id } : null;
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
    const created = service.createAssignment(TEACHER, { class_id: 1, teacher_id: 2, title: '阅读' });
    service.createAssignment(TEACHER, { class_id: 2, teacher_id: 2, title: '数学' });
    expect(service.listAssignments(TEACHER, 1)).toHaveLength(1);
    service.deleteAssignment(TEACHER, created.id);
    expect(service.listAssignments(TEACHER)).toHaveLength(1);
  });

  it('rejects empty updates for student assignments', () => {
    expect(() => service.updateStudentAssignment(TEACHER, 1, {})).toThrow(ApiError);
  });

  it('trims the title and defaults reward_points to 0', () => {
    service.createAssignment(TEACHER, { class_id: 1, teacher_id: 2, title: '  阅读  ' });
    expect([...repository.assignments.values()][0]).toMatchObject({ title: '阅读', reward_points: 0 });
  });

  it('rejects a missing title and a bad class_id', () => {
    expect(() => service.createAssignment(TEACHER, { class_id: 1, teacher_id: 2, title: '' })).toThrow('Missing title');
    expect(() => service.createAssignment(TEACHER, { class_id: 0, teacher_id: 2, title: 'x' })).toThrow(
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
    const created = service.createExam(TEACHER, { class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    expect(service.getGrades(TEACHER, created.id).grades).toHaveLength(2);
  });

  it('saves grades and rejects missing exams', () => {
    const created = service.createExam(TEACHER, { class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    service.saveGrades(TEACHER, created.id, [{ student_id: 10, score: 95 }]);
    expect(service.getGrades(TEACHER, created.id).grades.find((grade) => grade.student_id === 10)?.score).toBe(95);
    expect(() => service.getGrades(TEACHER, 999)).toThrow(ApiError);
  });

  it('seeds the grade rows inside one transaction', () => {
    service.createExam(TEACHER, { class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    expect(repository.transactions).toBe(1);
  });

  it('rolls nothing back when the title is missing, because it validates first', () => {
    // The transaction is opened only after every validation passes, which is why a bad
    // request leaves no half-created exam behind.
    expect(() =>
      service.createExam(TEACHER, { class_id: 1, teacher_id: 2, title: '', total_score: 100 }),
    ).toThrow('Missing title');
    expect(repository.transactions).toBe(0);
    expect(repository.exams.size).toBe(0);
  });

  it('rejects a non-positive total_score', () => {
    expect(() =>
      service.createExam(TEACHER, { class_id: 1, teacher_id: 2, title: '期中', total_score: 0 }),
    ).toThrow('total_score is invalid');
  });

  it('rejects an empty grade list', () => {
    const created = service.createExam(TEACHER, { class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    expect(() => service.saveGrades(TEACHER, created.id, [])).toThrow('Missing grades');
  });

  it('rejects a negative score', () => {
    const created = service.createExam(TEACHER, { class_id: 1, teacher_id: 2, title: '期中', total_score: 100 });
    expect(() => service.saveGrades(TEACHER, created.id, [{ student_id: 10, score: -1 }])).toThrow('Invalid score');
  });

  it('reports a missing student-exam record on update', () => {
    const repository = new FakeExamsRepository();
    repository.getStudentExamById = () => null;
    const service = new ExamsService(repository);
    expect(() => service.updateStudentExam(TEACHER, 1, { score: 10 })).toThrow('Student exam record not found');
  });
});

describe('controller envelope shapes', () => {
  it('spreads the created assignment into the envelope as well as nesting it', () => {
    const service = { createAssignment: vi.fn(() => ({ id: 7 })) };
    const controller = new AssignmentsController(service as never);

    // `ok(data, data)` - the id appears at the top level too. That redundancy is part of
    // the shipped contract, so it is asserted rather than tidied away.
    expect(controller.createAssignment(requestWith({ userId: 2, role: 'teacher' }), {} as never)).toEqual({
      success: true,
      data: { id: 7 },
      id: 7,
    });
  });

  it('does the same for a created exam and for the grade sheet', () => {
    const exams = { createExam: vi.fn(() => ({ id: 3 })), getGrades: vi.fn(() => ({ exam: { id: 3 }, grades: [] })) };
    const controller = new ExamsController(exams as never);
    const teacher = requestWith({ userId: 2, role: 'teacher' });

    expect(controller.createExam(teacher, {} as never)).toEqual({ success: true, data: { id: 3 }, id: 3 });
    expect(controller.getGrades(teacher, '3')).toEqual({
      success: true,
      data: { exam: { id: 3 }, grades: [] },
      exam: { id: 3 },
      grades: [],
    });
  });

  it('passes the raw query through so the service owns numeric validation', () => {
    const service = { listAssignments: vi.fn(() => []) };
    const controller = new AssignmentsController(service as never);

    controller.listAssignments(requestWith({ userId: 2, role: 'teacher' }), '1');
    expect(service.listAssignments).toHaveBeenCalledWith(TEACHER, '1');
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

    expect(() => assignments.listAssignments({ classId: 1 })).not.toThrow();
    expect(() => assignments.listAssignments({ classId: 1, teacherId: 2 })).not.toThrow();
    expect(() => assignments.createAssignment({ class_id: 1, teacher_id: 2, title: 't' })).not.toThrow();
    expect(() => assignments.updateAssignment(1, { title: 't' })).not.toThrow();
    expect(() => assignments.deleteAssignment(1)).not.toThrow();
    expect(() => assignments.getAssignment(1)).not.toThrow();
    expect(() => assignments.listStudentAssignments({ studentId: 1 })).not.toThrow();
    expect(() => assignments.listStudentAssignments({ studentId: 1, teacherId: 2 })).not.toThrow();
    expect(() => assignments.getStudentAssignment(1)).not.toThrow();
    expect(() => assignments.updateStudentAssignment(1, { status: 'submitted' })).not.toThrow();

    expect(() => exams.listExams({ classId: 1 })).not.toThrow();
    expect(() => exams.listExams({ classId: 1, teacherId: 2 })).not.toThrow();
    expect(() => exams.createExam({ class_id: 1, teacher_id: 2, title: 't', total_score: 100 })).not.toThrow();
    expect(() => exams.listStudentIds(1)).not.toThrow();
    expect(() => exams.getExam(1)).not.toThrow();
    expect(() => exams.listGrades(1)).not.toThrow();
    expect(() => exams.deleteExam(1)).not.toThrow();
    expect(() => exams.listStudentExams({ studentId: 1 })).not.toThrow();
    expect(() => exams.listStudentExams({ studentId: 1, teacherId: 2 })).not.toThrow();
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

    const created = service.createExam(TEACHER, { class_id: 1, teacher_id: 2, title: ' 期中 ', total_score: 100 });

    // Only the two pupils in class 1, the title trimmed, and the names decrypted.
    const { grades } = service.getGrades(TEACHER, created.id);
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

  it('restricts a teacher to the rows of their own assignments and exams, in SQL', () => {
    const assignments = createAssignmentsRepository(api);
    const exams = createExamsRepository(api);

    const mine = assignments.createAssignment({ class_id: 1, teacher_id: 2, title: 'mine' });
    const theirs = assignments.createAssignment({ class_id: 1, teacher_id: 3, title: 'theirs' });
    api.run('INSERT INTO student_assignments (id, assignment_id, student_id) VALUES (?, ?, ?)', [1, mine, 10]);
    api.run('INSERT INTO student_assignments (id, assignment_id, student_id) VALUES (?, ?, ?)', [2, theirs, 10]);

    api.run('INSERT INTO exams (id, class_id, teacher_id, title, total_score) VALUES (?, ?, ?, ?, ?)', [
      1,
      1,
      2,
      'mine',
      100,
    ]);
    api.run('INSERT INTO exams (id, class_id, teacher_id, title, total_score) VALUES (?, ?, ?, ?, ?)', [
      2,
      1,
      3,
      'theirs',
      100,
    ]);
    api.run('INSERT INTO student_exams (id, exam_id, student_id) VALUES (?, ?, ?)', [1, 1, 10]);
    api.run('INSERT INTO student_exams (id, exam_id, student_id) VALUES (?, ?, ?)', [2, 2, 10]);

    expect(assignments.listAssignments({ teacherId: 2 }).map((row) => row.title)).toEqual(['mine']);
    expect(assignments.listAssignments({ classId: 1 }).map((row) => row.title).sort()).toEqual(['mine', 'theirs']);

    // The join is what makes a teacher's 本班 real: student 10 has a row under both assignments,
    // and only the one belonging to the teacher's own work is visible - the `studentId` filter
    // cannot widen it either.
    expect(assignments.listStudentAssignments({ teacherId: 2 }).map((row) => row.assignment_id)).toEqual([1]);
    expect(assignments.listStudentAssignments({ studentId: 10, teacherId: 2 })).toHaveLength(1);
    expect(assignments.listStudentAssignments({ studentId: 10 }).map((row) => row.assignment_id)).toEqual([1, 2]);

    expect(exams.listExams({ teacherId: 2 }).map((row) => row.title)).toEqual(['mine']);
    expect(exams.listStudentExams({ teacherId: 2 }).map((row) => row.id)).toEqual([1]);
    expect(exams.listStudentExams({ teacherId: 3 }).map((row) => row.id)).toEqual([2]);
    expect(exams.listStudentExams({})).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------

/**
 * What the actor buys, at the layer that decides it.
 *
 * The role gates (401 anonymous / 403 wrong role) are asserted per route in
 * `assignments-controllers.test.ts`; these are the *scope* rules the matrix's notes call out -
 * "teacher_id 应由 actor 派生", "student_id 须与 actor 比对后再过滤" - and the ownership checks
 * that stop a teacher from grading another teacher's work.
 */
describe('assignments services: actor scope and ownership', () => {
  let repository: FakeAssignmentsRepository;
  let examsRepository: FakeExamsRepository;
  let assignments: AssignmentsService;
  let exams: ExamsService;

  beforeEach(() => {
    repository = new FakeAssignmentsRepository();
    examsRepository = new FakeExamsRepository();
    assignments = new AssignmentsService(repository);
    exams = new ExamsService(examsRepository);
  });

  function seedAssignment(teacherId: number, classId: number, title: string) {
    return repository.createAssignment({ class_id: classId, teacher_id: teacherId, title });
  }

  function seedStudentAssignment(id: number, assignmentId: number, studentId: number) {
    repository.studentAssignments.set(id, {
      id,
      assignment_id: assignmentId,
      student_id: studentId,
      status: 'pending',
      content: null,
      score: null,
      teacher_feedback: null,
    });
  }

  it('gives a teacher their own rows and admin every row', () => {
    seedAssignment(2, 1, 'mine');
    seedAssignment(3, 2, 'theirs');

    expect(assignments.listAssignments(TEACHER).map((row) => row.title)).toEqual(['mine']);
    expect(assignments.listAssignments(TEACHER, '2')).toEqual([]);
    expect(assignments.listAssignments(ADMIN).map((row) => row.title).sort()).toEqual(['mine', 'theirs']);
    expect(assignments.listAssignments(ADMIN, '2').map((row) => row.title)).toEqual(['theirs']);
  });

  it('pins a student to the class the kernel resolved, and refuses a different class_id', () => {
    seedAssignment(2, 1, 'mine');
    seedAssignment(3, 2, 'theirs');

    expect(assignments.listAssignments(STUDENT).map((row) => row.title)).toEqual(['mine']);
    expect(() => assignments.listAssignments(STUDENT, '2')).toThrow('无权限查看该班级作业');

    const unbound: RequestActor = { id: 8, role: 'student', studentId: null, classId: null };
    expect(() => assignments.listAssignments(unbound)).toThrow('当前账号未绑定班级');
  });

  it('pins a student or parent to their own student row and refuses another student_id', () => {
    const assignmentId = seedAssignment(2, 1, 'mine');
    seedStudentAssignment(1, assignmentId, 10);
    seedStudentAssignment(2, assignmentId, 11);

    expect(assignments.listStudentAssignments(STUDENT, { student_id: '10' })).toHaveLength(1);
    expect(() => assignments.listStudentAssignments(STUDENT, { student_id: '11' })).toThrow('无权限查看该学生的作业');
    // No query at all still means "my own row", not "everything".
    expect(assignments.listStudentAssignments(STUDENT, {}).map((row) => row.student_id)).toEqual([10]);
    expect(assignments.listStudentAssignments(PARENT, {}).map((row) => row.student_id)).toEqual([10]);
    expect(() => assignments.listStudentAssignments(PARENT, { student_id: '11' })).toThrow(ApiError);
  });

  it('restricts a teacher reading student assignments to their own assignments', () => {
    const mine = seedAssignment(2, 1, 'mine');
    const theirs = seedAssignment(3, 1, 'theirs');
    seedStudentAssignment(1, mine, 10);
    seedStudentAssignment(2, theirs, 10);

    expect(assignments.listStudentAssignments(TEACHER, {}).map((row) => row.id)).toEqual([1]);
    expect(assignments.listStudentAssignments(TEACHER, { assignment_id: String(theirs) })).toEqual([]);
    expect(assignments.listStudentAssignments(OTHER_TEACHER, {}).map((row) => row.id)).toEqual([2]);
    // A teacher may name someone else's student: the SQL still intersects with their own work.
    expect(assignments.listStudentAssignments(TEACHER, { student_id: '10' }).map((row) => row.id)).toEqual([1]);
  });

  it('derives teacher_id from the actor on create, discarding the body copy', () => {
    assignments.createAssignment(TEACHER, { class_id: 1, teacher_id: 999, title: 'x' });
    expect(repository.getAssignment(1)).toMatchObject({ teacher_id: 2 });

    exams.createExam(TEACHER, { class_id: 1, teacher_id: 999, title: '期中', total_score: 100 });
    expect(examsRepository.getExam(1)).toMatchObject({ teacher_id: 2 });
  });

  it('refuses a teacher writing an assignment they do not own, and lets the owner and admin through', () => {
    const id = seedAssignment(3, 1, 'theirs');

    expect(() => assignments.updateAssignment(TEACHER, id, { title: 'y' })).toThrow('无权限修改该作业');
    expect(() => assignments.deleteAssignment(TEACHER, id)).toThrow('无权限删除该作业');
    expect(repository.getAssignment(id)).toMatchObject({ title: 'theirs' });

    expect(assignments.updateAssignment(OTHER_TEACHER, id, { title: 'y' })).toEqual({ updated: true });
    expect(assignments.deleteAssignment(ADMIN, id)).toEqual({ deleted: true });
  });

  it('refuses a teacher rewriting another teacher\'s student assignment', () => {
    const mine = seedAssignment(2, 1, 'mine');
    const theirs = seedAssignment(3, 1, 'theirs');
    seedStudentAssignment(1, mine, 10);
    seedStudentAssignment(2, theirs, 10);

    expect(assignments.updateStudentAssignment(TEACHER, 1, { status: 'submitted' })).toEqual({ updated: true });
    expect(() => assignments.updateStudentAssignment(TEACHER, 2, { status: 'submitted' })).toThrow(
      '无权限修改该学生作业',
    );
    expect(repository.getStudentAssignment(2)?.status).toBe('pending');
  });

  it('refuses a teacher the grade sheet and grades of another teacher\'s exam', () => {
    const mine = examsRepository.createExam({ class_id: 1, teacher_id: 2, title: 'mine', total_score: 100 });
    const theirs = examsRepository.createExam({ class_id: 1, teacher_id: 3, title: 'theirs', total_score: 100 });
    examsRepository.createStudentExam(mine, 10);
    examsRepository.createStudentExam(theirs, 10);

    expect(exams.getGrades(TEACHER, mine).exam.title).toBe('mine');
    expect(() => exams.getGrades(TEACHER, theirs)).toThrow('无权限查看该考试成绩');
    expect(() => exams.saveGrades(TEACHER, theirs, [{ student_id: 10, score: 90 }])).toThrow('无权限修改该考试成绩');
    expect(() => exams.updateExam(TEACHER, theirs, { title: 'x' })).toThrow('无权限修改该考试');
    expect(() => exams.deleteExam(TEACHER, theirs)).toThrow('无权限删除该考试');

    // The owner and admin still get through, and the write really landed for the owner.
    expect(exams.saveGrades(TEACHER, mine, [{ student_id: 10, score: 90 }])).toEqual({ saved: true });
    expect(exams.getGrades(ADMIN, theirs).grades).toHaveLength(1);
  });

  it('refuses grading a student-exam row that belongs to another teacher\'s exam', () => {
    const theirs = examsRepository.createExam({ class_id: 1, teacher_id: 3, title: 'theirs', total_score: 100 });
    examsRepository.createStudentExam(theirs, 10);
    const row = examsRepository.getStudentExamById(10);
    expect(row).not.toBeNull();

    expect(() => exams.updateStudentExam(TEACHER, row!.id, { score: 90 })).toThrow('无权限修改该学生成绩');
    expect(examsRepository.getExam(theirs)?.id).toBe(theirs);
  });

  it('restricts a teacher\'s and a student\'s student-exam reads to their own scope', () => {
    const mine = examsRepository.createExam({ class_id: 1, teacher_id: 2, title: 'mine', total_score: 100 });
    const theirs = examsRepository.createExam({ class_id: 1, teacher_id: 3, title: 'theirs', total_score: 100 });
    examsRepository.createStudentExam(mine, 10);
    examsRepository.createStudentExam(mine, 11);
    examsRepository.createStudentExam(theirs, 10);

    expect(exams.listStudentExams(TEACHER, {})).toHaveLength(2);
    expect(exams.listStudentExams(OTHER_TEACHER, {})).toHaveLength(1);
    // Both of student 10's rows, whichever teacher owns the exam - the student's own scope is
    // the student id, and no filter may widen it to student 11.
    expect(exams.listStudentExams(STUDENT, {}).map((row) => (row as ExamGrade).student_id)).toEqual([10, 10]);
    expect(() => exams.listStudentExams(STUDENT, { student_id: '11' })).toThrow('无权限查看该学生的成绩');
    expect(() => exams.listStudentExams(PARENT, { student_id: '11' })).toThrow(ApiError);
    // The matrix gives admin no route into the two per-student record reads - the controller's
    // `RECORD_READERS` gate refuses it, and this layer agrees rather than inventing a wider scope.
    expect(() => exams.listStudentExams(ADMIN, {})).toThrow('无权限执行该操作');
  });
});
