/**
 * Learning plugin service tests - the repository driven against a real SQLite database.
 *
 * Ported from `api/modules/learning/learning.service.test.ts` (the Prisma-mock suite) when the
 * papers / knowledge / wrong-question / study-plan half of that module moved into
 * `plugins/learning`. The Prisma mock is deliberately NOT carried over: this domain's entire
 * risk surface is ~40 hand-written SQL statements, and a stubbed repository would assert
 * nothing about any of them. So the layers here are:
 *
 *   - the schema is built from the real migration chain (`APP_MIGRATIONS`, the frozen boot
 *     schema) into a temporary SQLite file, so the DDL the SQL runs against - column order,
 *     `DEFAULT CURRENT_TIMESTAMP`, the nullable `importance`/`weight` defaults - is production's;
 *   - the repository runs through the real ownership-checked `DbApi` built from the manifest's
 *     `data.adopted` list with `strict: true`, so a statement naming an undeclared table fails
 *     here exactly as it would in development;
 *   - the only fake is `classroom.public`, because the plugin deliberately may not read
 *     `students` at all: `getStudentByUserId` is the one path to a student, and the fake records
 *     every lookup so a test can prove the actor resolution went through it.
 *
 * Legacy assertion -> test location:
 *   'lists and creates knowledge resources ...'          -> knowledge graph and subjects
 *   'enforces paper permissions, publish validation ...'  -> papers
 *   'starts, saves, and submits paper submissions ...'    -> paper submissions
 *   'handles wrong-question list, mastery attempts ...'   -> wrong questions
 *   'archives old active study plans ...'                 -> study plans
 *
 * Plus the two things a Prisma mock could never have covered, which is why this file exists:
 * the DateTime round trip (an epoch-millisecond row and a `CURRENT_TIMESTAMP` text row must
 * both read back as the same UTC ISO shape) and the missing-row `update`/`delete` status (500,
 * the status Prisma's P2025 produced, never 404).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ClassroomPort, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import { ApiError, openDatabase, renderError, runMigrations, type Database } from '@thinkclass/kernel';
import { createDbApi } from '@thinkclass/plugin-runtime';
import type { DbApi } from '@thinkclass/plugin-sdk';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';
import { createLearningRepository } from '../../plugins/learning/src/learning.repository.js';
import { LearningService } from '../../plugins/learning/src/learning.service.js';
import type { Actor } from '../../plugins/learning/src/learning.types.js';

/** Mirrors `plugins/learning/plugin.json` -> `data.adopted`. `data.reads` is intentionally empty. */
const ADOPTED_TABLES = [
  'knowledge_edges',
  'knowledge_nodes',
  'paper_answers',
  'paper_assets',
  'paper_items',
  'paper_sections',
  'paper_submissions',
  'papers',
  'question_knowledge',
  'questions',
  'rubric_points',
  'study_plan_items',
  'study_plans',
  'subjects',
  'wrong_question_attempts',
  'wrong_questions',
];

/** Every DateTime the wire contract exposes is a millisecond ISO string ending in `Z`. */
const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const TEACHER: Actor = { id: 7, role: 'teacher' };
/**
 * A second teacher, so "a teacher sees only their own papers" is a real filter and not a
 * tautology.
 *
 * `papers.teacher_id` is `REFERENCES users(id)`, and the suite runs against the real migration
 * chain with `foreign_keys` on, so the fixture has to be a *teacher* row. It used to write
 * `teacher_id: 8` - a user whose role is `student`. The Prisma-mock suite this was ported from
 * never evaluated a foreign key, which is why that survived until now.
 */
const OTHER_TEACHER: Actor = { id: 12, role: 'teacher' };
const ADMIN: Actor = { id: 1, role: 'admin' };
const STUDENT: Actor = { id: 8, role: 'student' };
const OTHER_STUDENT: Actor = { id: 9, role: 'student' };
const NO_CLASS_STUDENT: Actor = { id: 11, role: 'student' };
const UNKNOWN_STUDENT: Actor = { id: 999, role: 'student' };

/**
 * `classroom.public`, as the real port exposes it.
 *
 * Only `getStudentByUserId` can be reached from this domain; the rest exist to satisfy the
 * interface. `userLookups` is the assertion hook: the student behind an actor must come from
 * here and nowhere else.
 */
class FakeClassroom implements ClassroomPort {
  /** Account-deletion scope (P4.3b.14): learning never asks for it; the port requires both. */
  async listClassIdsByTeacher() {
    return [];
  }

  async listStudentAccountsByClassIds() {
    return [];
  }

  readonly students: StudentSnapshot[] = [];
  readonly userLookups: number[] = [];

  seedStudent(snapshot: StudentSnapshot) {
    this.students.push(snapshot);
  }

  async getStudentById(studentId: number) {
    return this.students.find((student) => student.id === studentId) ?? null;
  }

  async getStudentByUserId(userId: number) {
    this.userLookups.push(userId);
    return this.students.find((student) => student.userId === userId) ?? null;
  }

  async getClassById() {
    return null;
  }

  async listClassStudents(classId: number) {
    return this.students.filter((student) => student.classId === classId);
  }

  async searchClasses() {
    return [];
  }

  async assertStudentInClass() {
    /* learning never asks for membership */
  }

  async adjustPoints() {
    return { totalPoints: 0, availablePoints: 0 };
  }

  async transferStudentCredits() {
    return { value: { availablePoints: 0 } };
  }

  async recordStudentLedgerEntry() {
    /* learning never moves points */
  }

  async listStudentLedger() {
    return [];
  }

  async sumClassPointsEarnedSince() {
    return 0;
  }

  async checkStudentFeature() {
    return { value: true as const };
  }

  async checkClassFeature() {
    return { value: true as const };
  }

  async checkAnyClassFeature() {
    return { value: true as const };
  }
}

let directory: string;
let db: Database;
let api: DbApi;
let classroom: FakeClassroom;
let service: LearningService;

/** Await a call and return the `ApiError` it threw; fails the test when it does not throw. */
async function apiErrorOf(run: () => unknown): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('expected the call to throw, but it resolved');
}

/**
 * Run a call and return the non-`ApiError` it threw.
 *
 * The repository signals a missing row with a plain `Error` (the Prisma P2025 status), which is
 * exactly what these tests need to keep apart from the `ApiError` paths.
 */
function plainErrorOf(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    expect(error).not.toBeInstanceOf(ApiError);
    return error as Error;
  }
  throw new Error('expected the call to throw, but it returned');
}

/** A fixture row, written through the same ownership-checked api the repository uses. */
function addPaper(input: {
  title: string;
  class_id?: number | null;
  subject_id?: number | null;
  status?: string;
  teacher_id?: number;
  created_at?: number;
}): number {
  const info = api.run(
    `INSERT INTO papers (teacher_id, class_id, subject_id, title, source, status, total_points, created_at)
     VALUES (?, ?, ?, ?, 'manual', ?, 0, ?)`,
    [
      input.teacher_id ?? 7,
      input.class_id ?? null,
      input.subject_id ?? null,
      input.title,
      input.status ?? 'draft',
      input.created_at ?? Date.now(),
    ],
  );
  return Number(info.lastInsertRowid);
}

function addQuestion(input: {
  stem: string;
  type?: string;
  answer_json?: string | null;
  subject_id?: number | null;
  is_subjective?: number;
  default_points?: number;
  teacher_id?: number;
}): number {
  const info = api.run(
    `INSERT INTO questions (teacher_id, subject_id, stem, type, answer_json, is_subjective, default_points, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.teacher_id ?? 7,
      input.subject_id ?? null,
      input.stem,
      input.type ?? 'single',
      input.answer_json ?? null,
      input.is_subjective ?? 0,
      input.default_points ?? 0,
      Date.now(),
    ],
  );
  return Number(info.lastInsertRowid);
}

function addPaperItem(
  paperId: number,
  questionId: number,
  orderNo: number,
  extra: { points_override?: number | null; section_id?: number | null } = {},
): number {
  const info = api.run(
    `INSERT INTO paper_items (paper_id, section_id, question_id, order_no, points_override, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [paperId, extra.section_id ?? null, questionId, orderNo, extra.points_override ?? null, Date.now()],
  );
  return Number(info.lastInsertRowid);
}

function addWrongQuestion(studentId: number, questionId: number, mastery: number, stamp: number): number {
  const info = api.run(
    `INSERT INTO wrong_questions
       (student_id, question_id, first_wrong_at, last_wrong_at, wrong_count, mastery_score, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    [studentId, questionId, stamp, stamp, mastery, stamp, stamp],
  );
  return Number(info.lastInsertRowid);
}

function linkQuestionToNode(questionId: number, nodeId: number) {
  api.run('INSERT INTO question_knowledge (question_id, node_id) VALUES (?, ?)', [questionId, nodeId]);
}

function seedPeople() {
  db.exec(`
    INSERT INTO users (id, role, username, password_hash) VALUES (7, 'teacher', 'teacher7', 'x');
    INSERT INTO users (id, role, username, password_hash) VALUES (8, 'student', 'student8', 'x');
    INSERT INTO users (id, role, username, password_hash) VALUES (9, 'student', 'student9', 'x');
    INSERT INTO users (id, role, username, password_hash) VALUES (11, 'student', 'student11', 'x');
    INSERT INTO users (id, role, username, password_hash) VALUES (1, 'admin', 'admin1', 'x');
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 7, 'AAA111');
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (2, '二班', 7, 'BBB222');
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (3, '三班', 7, 'CCC333');
    INSERT INTO students (id, user_id, class_id, name) VALUES (80, 8, 1, '小明');
    INSERT INTO students (id, user_id, class_id, name) VALUES (81, 9, 2, '小红');
    INSERT INTO students (id, user_id, class_id, name) VALUES (83, 11, NULL, '无班');
  `);
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-db-'));
  db = openDatabase(path.join(directory, 'app.sqlite'), { wal: false });
  runMigrations(db, APP_MIGRATIONS);

  // The production ownership check is on: only the 16 adopted tables are reachable, and
  // `students` is not one of them, so the classroom port is the only path to a student.
  api = createDbApi({
    db,
    pluginId: 'learning',
    ownedTables: new Set(ADOPTED_TABLES),
    readTables: new Set(),
    strict: true,
  });

  classroom = new FakeClassroom();
  classroom.seedStudent({ id: 80, classId: 1, userId: 8, name: '小明', totalPoints: 0, availablePoints: 0, groupId: null });
  classroom.seedStudent({ id: 81, classId: 2, userId: 9, name: '小红', totalPoints: 0, availablePoints: 0, groupId: null });
  classroom.seedStudent({ id: 83, classId: null, userId: 11, name: '无班', totalPoints: 0, availablePoints: 0, groupId: null });

  service = new LearningService(createLearningRepository(api), classroom);
  seedPeople();
});

afterEach(() => {
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('harness: the real schema, and the ownership boundary around it', () => {
  it('builds all 16 adopted tables from the app migration chain', () => {
    const names = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>
    ).map((row) => row.name);

    for (const table of ADOPTED_TABLES) expect(names).toContain(table);
    // The DDL the SQL translation depends on is the production one, foreign keys included.
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('refuses a direct `students` read or write, so the port is the only path', () => {
    // Non-vacuity for every other test in this file: were the check off, nothing below would
    // prove the plugin stays inside its own tables.
    expect(() => api.query('SELECT * FROM students')).toThrow(
      /reads table "students" without declaring it in manifest data.reads/,
    );
    expect(() => api.run('UPDATE students SET name = ? WHERE id = ?', ['x', 80])).toThrow(
      /may not write to table "students"/,
    );
  });
});

// ---------------------------------------------------------------------------

describe('knowledge graph and subjects', () => {
  it('lists and creates subjects with the legacy coercions', () => {
    expect(service.listSubjects()).toEqual([]);

    const created = service.createSubject(TEACHER, { name: '数学' });
    expect(created).toMatchObject({ id: 1, name: '数学', stage: null, grade: null });
    expect(created.created_at).toMatch(ISO_MS);

    const raw = db.prepare('SELECT created_at FROM subjects WHERE id = ?').get(created.id) as { created_at: number };
    expect(typeof raw.created_at).toBe('number');

    // `grade: '3'` is coerced, exactly as `Number(grade)` did before the migration.
    expect(service.createSubject(TEACHER, { name: '语文', stage: '初中', grade: '3' })).toMatchObject({
      stage: '初中',
      grade: 3,
    });
    expect(service.listSubjects().map((subject) => subject.id)).toEqual([1, 2]);
  });

  it('validates knowledge nodes and writes explicit nulls over the DDL defaults', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });

    const invalidSubject = await apiErrorOf(() => service.listKnowledgeNodes(undefined));
    expect(invalidSubject.statusCode).toBe(400);
    expect(invalidSubject.message).toBe('Missing or invalid subject_id');

    const root = service.createKnowledgeNode(TEACHER, { subject_id: '1', name: '函数' });
    expect(root).toMatchObject({ subject_id: 1, name: '函数', code: null, parent_id: null, importance: null });
    expect(root.created_at).toMatch(ISO_MS);

    // Prisma wrote NULL because the service passed `null` explicitly; the DDL's `DEFAULT 1`
    // never applied to a Prisma insert, and the SQL translation must not let it start applying.
    const raw = db.prepare('SELECT importance FROM knowledge_nodes WHERE id = ?').get(root.id) as {
      importance: number | null;
    };
    expect(raw.importance).toBeNull();

    const child = service.createKnowledgeNode(TEACHER, { subject_id: subject.id, name: '导数', parent_id: root.id });
    const sibling = service.createKnowledgeNode(TEACHER, { subject_id: subject.id, name: '极限' });

    // `orderBy: [{ parent_id: 'asc' }, { id: 'asc' }]`: NULLs first, then by id.
    expect(service.listKnowledgeNodes('1').map((node) => node.id)).toEqual([root.id, sibling.id, child.id]);
  });

  it('updates, clears and deletes nodes, and keeps the empty-patch no-op read', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const node = service.createKnowledgeNode(TEACHER, { subject_id: subject.id, name: '函数' });

    const renamed = service.updateKnowledgeNode(ADMIN, String(node.id), { name: '导数', code: 'HS-01' });
    expect(renamed).toMatchObject({ id: node.id, name: '导数', code: 'HS-01', created_at: node.created_at });

    // `code: null` clears it; an empty patch is a no-op read that returns the row unchanged.
    expect(service.updateKnowledgeNode(ADMIN, String(node.id), { code: null }).code).toBeNull();
    expect(service.updateKnowledgeNode(ADMIN, String(node.id), {}).name).toBe('导数');

    service.deleteKnowledgeNode(TEACHER, String(node.id));
    expect(service.listKnowledgeNodes(subject.id)).toEqual([]);

    const invalidId = await apiErrorOf(() => service.deleteKnowledgeNode(TEACHER, 'not-a-number'));
    expect(invalidId.statusCode).toBe(400);
    expect(invalidId.message).toBe('Invalid id');
  });

  it('creates, lists and deletes edges, keeping the legacy weight handling', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const from = service.createKnowledgeNode(TEACHER, { subject_id: subject.id, name: '函数' });
    const to = service.createKnowledgeNode(TEACHER, { subject_id: subject.id, name: '导数' });

    // `weight: undefined` became an explicit NULL, overriding the DDL's `DEFAULT 1`.
    const edge = service.createKnowledgeEdge(TEACHER, {
      subject_id: subject.id,
      from_node_id: from.id,
      to_node_id: to.id,
      edge_type: 'requires',
    });
    expect(edge).toMatchObject({ subject_id: subject.id, from_node_id: from.id, to_node_id: to.id, weight: null });
    expect(edge.created_at).toMatch(ISO_MS);

    const weighted = service.createKnowledgeEdge(TEACHER, {
      subject_id: subject.id,
      from_node_id: to.id,
      to_node_id: from.id,
      edge_type: 'similar',
      weight: '2.5',
    });
    expect(weighted.weight).toBe(2.5);

    expect(service.listKnowledgeEdges(String(subject.id)).map((row) => row.id)).toEqual([edge.id, weighted.id]);

    service.deleteKnowledgeEdge(TEACHER, String(edge.id));
    expect(service.listKnowledgeEdges(subject.id).map((row) => row.id)).toEqual([weighted.id]);

    const missing = await apiErrorOf(() =>
      service.createKnowledgeEdge(TEACHER, { subject_id: subject.id, from_node_id: from.id, edge_type: 'requires' }),
    );
    expect(missing.statusCode).toBe(400);
    expect(missing.message).toBe('Missing or invalid to_node_id');

    const invalidSubject = await apiErrorOf(() => service.listKnowledgeEdges(undefined));
    expect(invalidSubject.message).toBe('Missing or invalid subject_id');
  });

  it('answers 500 - not 404 - when an update or delete targets a missing row (Prisma P2025)', async () => {
    const update = plainErrorOf(() => service.updateKnowledgeNode(TEACHER, '999', { name: 'x' }));
    expect(update.message).toBe('knowledge_nodes.update failed: no matching record');

    // The legacy translator rendered a plain driver error as a 500 envelope; the kernel renders
    // the same status for anything that is not an `ApiError`. Only the message changed - this is
    // plugin.json `_known_debt` item 3.
    expect(renderError(update)).toEqual({ status: 500, body: { success: false, message: '服务器内部错误' } });

    expect(renderError(plainErrorOf(() => service.deleteKnowledgeNode(TEACHER, '999'))).status).toBe(500);
    expect(renderError(plainErrorOf(() => service.deleteKnowledgeEdge(TEACHER, '999'))).status).toBe(500);

    // The read paths keep their 404, so the two statuses stay distinguishable.
    const readPath = await apiErrorOf(() => service.getPaper(TEACHER, '999'));
    expect(readPath.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------

describe('papers', () => {
  it('creates a paper with the legacy defaults and stores exam_date as epoch milliseconds', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const paper = service.createPaper(TEACHER, {
      title: '周测',
      class_id: '3',
      subject_id: String(subject.id),
      exam_date: '2026-01-02T03:04:05.678Z',
    });

    expect(paper).toMatchObject({
      teacher_id: 7,
      class_id: 3,
      subject_id: subject.id,
      title: '周测',
      source: 'manual',
      // The DDL default, which Prisma's `@default("draft")` also produced.
      status: 'draft',
      total_points: 0,
    });
    expect(paper.exam_date).toBe('2026-01-02T03:04:05.678Z');
    expect(paper.created_at).toMatch(ISO_MS);

    const raw = db.prepare('SELECT exam_date, created_at FROM papers WHERE id = ?').get(paper.id) as {
      exam_date: number;
      created_at: number;
    };
    expect(raw.exam_date).toBe(Date.parse('2026-01-02T03:04:05.678Z'));
    expect(typeof raw.created_at).toBe('number');

    expect(service.createPaper(ADMIN, { title: '无日期' }).exam_date).toBeNull();

    const missing = await apiErrorOf(() => service.createPaper(TEACHER, {}));
    expect(missing.statusCode).toBe(400);
    expect(missing.message).toBe('Missing title');
  });

  it('reads an epoch-millisecond row and a CURRENT_TIMESTAMP text row as the same ISO shape', async () => {
    const written = service.createPaper(TEACHER, { title: 'epoch 行' });

    // A row written outside Prisma - the DDL default form: UTC, second precision, no zone
    // marker. Anything seeded by raw SQL in production looks exactly like this.
    const textId = Number(
      api.run(
        `INSERT INTO papers (teacher_id, class_id, subject_id, title, source, status, total_points, exam_date, created_at)
         VALUES (7, NULL, NULL, 'text 行', 'manual', 'draft', 0, '2026-01-02 03:04:05', '2026-01-02 03:04:05')`,
      ).lastInsertRowid,
    );

    const epochRow = await service.getPaper(TEACHER, String(written.id));
    const textRow = await service.getPaper(TEACHER, String(textId));

    // Both storage forms come back as the same ISO-8601-with-Z string.
    expect(epochRow.created_at).toMatch(ISO_MS);
    expect(textRow.created_at).toMatch(ISO_MS);
    expect(textRow.exam_date).toMatch(ISO_MS);

    // The text form carries no zone marker and must be read as UTC. A local-time parse (what
    // `new Date('2026-01-02 03:04:05')` does) would shift this by the machine's offset.
    expect(textRow.exam_date).toBe('2026-01-02T03:04:05.000Z');
    expect(Date.parse(textRow.exam_date)).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(Date.parse(textRow.created_at)).toBe(Date.UTC(2026, 0, 2, 3, 4, 5));

    // The list projection converts identically - it is the same `mapRow` path.
    const listed = (await service.listPapers(TEACHER)).find((row) => row.id === textId);
    expect(listed!.created_at).toBe(textRow.created_at);
    expect(listed!.exam_date).toBe(textRow.exam_date);

    // `wrong_questions` is the widest DateTime row (five columns), so pin one through it too.
    const question = addQuestion({ stem: '往返', type: 'single' });
    const wrongId = addWrongQuestion(80, question, 0.5, Date.UTC(2026, 0, 2, 3, 4, 5));
    const wrongRow = (await service.listWrongQuestions(STUDENT)).find((row) => row.id === wrongId)!;
    expect(wrongRow.last_wrong_at).toBe('2026-01-02T03:04:05.000Z');
    expect(wrongRow.cleared_at).toBeNull();
  });

  it('filters papers for staff, for students and for an unknown role', async () => {
    const first = addPaper({ title: 'p1', class_id: 1, status: 'published', created_at: 1_000 });
    const second = addPaper({ title: 'p2', class_id: 2, status: 'published', created_at: 2_000 });
    const otherTeacher = addPaper({ title: 'p3', class_id: 1, status: 'published', teacher_id: 8, created_at: 3_000 });
    const draft = addPaper({ title: 'p4', class_id: 1, status: 'draft', created_at: 4_000 });

    // A teacher sees their own papers, newest first.
    expect((await service.listPapers(TEACHER)).map((paper) => paper.id)).toEqual([draft, second, first]);
    // An admin sees everything.
    expect((await service.listPapers(ADMIN)).map((paper) => paper.id)).toEqual([draft, otherTeacher, second, first]);
    // `class_id` filters when it parses, and is dropped when it does not (`Number.isFinite`).
    expect((await service.listPapers(TEACHER, '1')).map((paper) => paper.id)).toEqual([draft, first]);
    expect((await service.listPapers(TEACHER, 'abc')).map((paper) => paper.id)).toEqual([draft, second, first]);

    // A student sees published papers of their own class only. The teacher filter does not apply
    // to them, so another teacher's published paper in the same class is included.
    expect((await service.listPapers(STUDENT)).map((paper) => paper.id)).toEqual([otherTeacher, first]);
    expect((await service.listPapers(OTHER_STUDENT)).map((paper) => paper.id)).toEqual([second]);
    expect(classroom.userLookups).toEqual([8, 9]);

    const noClass = await apiErrorOf(() => service.listPapers(NO_CLASS_STUDENT));
    expect(noClass.statusCode).toBe(400);
    expect(noClass.message).toBe('Student has no class');

    const anonymous = await apiErrorOf(() => service.listPapers({ id: null, role: null }));
    expect(anonymous.statusCode).toBe(403);
    expect(anonymous.message).toBe('无权限执行该操作');
  });

  it('projects `subjects` as a present-but-null key, as Prisma include did', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const linked = service.createPaper(TEACHER, { title: '有科目', subject_id: subject.id, class_id: 1 });
    const unlinked = service.createPaper(TEACHER, { title: '无科目' });

    const papers = await service.listPapers(ADMIN);
    const withSubject = papers.find((paper) => paper.id === linked.id)!;
    const withoutSubject = papers.find((paper) => paper.id === unlinked.id)!;

    expect(withSubject.subjects).toMatchObject({ id: subject.id, name: '数学' });
    expect(withoutSubject.subjects).toBeNull();
    expect(Object.keys(withoutSubject)).toEqual([
      'id',
      'teacher_id',
      'class_id',
      'subject_id',
      'title',
      'source',
      'status',
      'total_points',
      'exam_date',
      'created_at',
      'subjects',
    ]);
  });

  it('projects paper detail with the legacy key order and ordered children', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const paper = service.createPaper(TEACHER, { title: '结构', class_id: 1, subject_id: subject.id });
    const reused = addQuestion({ stem: '旧题', type: 'single', subject_id: subject.id });

    service.savePaperStructure(TEACHER, String(paper.id), {
      sections: [{ title: '一', order_no: 1 }],
      items: [
        { order_no: 1, section_order_no: 1, question: { stem: '1+1', type: 'single', answer_json: '"2"' } },
        { order_no: 2, section_order_no: 1, question_id: reused, points_override: 5 },
      ],
      rubric_points: [
        { paper_item_order_no: 1, label: '步骤', points: 2, step_order: 2 },
        { paper_item_order_no: 1, label: '结论', points: 3, step_order: 1 },
      ],
    });

    const detail = await service.getPaper(TEACHER, String(paper.id));

    // Prisma projected scalars first, then the includes in declaration order.
    expect(Object.keys(detail)).toEqual([
      'id',
      'teacher_id',
      'class_id',
      'subject_id',
      'title',
      'source',
      'status',
      'total_points',
      'exam_date',
      'created_at',
      'subjects',
      'paper_assets',
      'paper_sections',
      'paper_items',
    ]);
    expect(detail.subjects).toMatchObject({ id: subject.id });
    expect(detail.paper_assets).toEqual([]);
    expect(detail.paper_sections.map((section) => section.order_no)).toEqual([1]);
    expect(detail.paper_items.map((item) => item.order_no)).toEqual([1, 2]);

    expect(Object.keys(detail.paper_items[0])).toEqual([
      'id',
      'paper_id',
      'section_id',
      'question_id',
      'order_no',
      'points_override',
      'difficulty_override',
      'rubric_json',
      'created_at',
      'questions',
      'rubric_points',
    ]);

    const [firstItem, secondItem] = detail.paper_items;
    expect(firstItem.section_id).toBe(detail.paper_sections[0].id);
    expect(firstItem.questions).toMatchObject({ stem: '1+1', teacher_id: 7, subject_id: subject.id });
    expect(firstItem.rubric_points.map((rubric) => rubric.label)).toEqual(['结论', '步骤']);
    expect(firstItem.rubric_points.map((rubric) => rubric.step_order)).toEqual([1, 2]);
    expect(secondItem.question_id).toBe(reused);
    expect(secondItem.points_override).toBe(5);
    expect(secondItem.rubric_points).toEqual([]);
  });

  it('enforces the legacy paper read permissions', async () => {
    const published = addPaper({ title: '已发布', class_id: 1, status: 'published' });
    const draft = addPaper({ title: '草稿', class_id: 1, status: 'draft' });
    const otherClass = addPaper({ title: '别班', class_id: 2, status: 'published' });
    const otherTeacher = addPaper({ title: '别人的', class_id: 1, status: 'published', teacher_id: 8 });

    expect((await service.getPaper(STUDENT, String(published))).id).toBe(published);

    const unpublished = await apiErrorOf(() => service.getPaper(STUDENT, String(draft)));
    expect(unpublished.statusCode).toBe(403);
    expect(unpublished.message).toBe('试卷未发布');

    const foreignClass = await apiErrorOf(() => service.getPaper(STUDENT, String(otherClass)));
    expect(foreignClass.statusCode).toBe(403);
    expect(foreignClass.message).toBe('无权限查看该试卷');

    const notOwner = await apiErrorOf(() => service.getPaper(TEACHER, String(otherTeacher)));
    expect(notOwner.statusCode).toBe(403);
    expect(notOwner.message).toBe('无权限查看该试卷');

    expect((await service.getPaper(ADMIN, String(otherTeacher))).id).toBe(otherTeacher);
    expect((await service.getPaper(TEACHER, String(published))).id).toBe(published);

    const missing = await apiErrorOf(() => service.getPaper(TEACHER, '999'));
    expect(missing.statusCode).toBe(404);
    expect(missing.message).toBe('Paper not found');

    const invalid = await apiErrorOf(() => service.getPaper(TEACHER, 'abc'));
    expect(invalid.statusCode).toBe(400);
    expect(invalid.message).toBe('Invalid id');

    const anonymous = await apiErrorOf(() => service.getPaper({ id: null, role: null }, String(published)));
    expect(anonymous.statusCode).toBe(403);
  });

  it('validates publishing, updates in place, and keeps the empty-patch no-op read', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const paper = addPaper({ title: '周测', class_id: 1, subject_id: subject.id, status: 'draft' });

    const cannotPublish = await apiErrorOf(() => service.updatePaper(TEACHER, String(paper), { status: 'published' }));
    expect(cannotPublish.statusCode).toBe(400);
    expect(cannotPublish.message).toBe('试卷没有题目，无法发布');

    addPaperItem(paper, addQuestion({ stem: '1+1', type: 'single' }), 1);

    const updated = service.updatePaper(TEACHER, String(paper), {
      status: 'published',
      total_points: '100',
      exam_date: '2026-02-03T04:05:06.000Z',
    });
    expect(updated).toMatchObject({ status: 'published', total_points: 100 });
    expect(updated.exam_date).toBe('2026-02-03T04:05:06.000Z');

    // Prisma's empty `data` is a no-op read that still returns (and still finds) the row.
    const untouched = service.updatePaper(TEACHER, String(paper), {});
    expect(untouched).toMatchObject({ status: 'published', total_points: 100, title: '周测' });

    // `subject_id: undefined` keeps the old value; `null` clears it.
    const keptSubject = service.updatePaper(TEACHER, String(paper), { subject_id: undefined, title: undefined });
    expect(keptSubject.subject_id).toBe(subject.id);
    expect(keptSubject.title).toBe('周测');
    expect(service.updatePaper(TEACHER, String(paper), { subject_id: null }).subject_id).toBeNull();

    const missing = await apiErrorOf(() => service.updatePaper(TEACHER, '999', { title: 'x' }));
    expect(missing.statusCode).toBe(404);
    expect(missing.message).toBe('Paper not found');

    const other = addPaper({ title: '别人的', teacher_id: 8 });
    const forbidden = await apiErrorOf(() => service.updatePaper(TEACHER, String(other), { title: 'x' }));
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.message).toBe('无权限编辑该试卷');
  });

  it('replaces the paper structure inside one transaction, ids and order included', () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const paper = service.createPaper(TEACHER, { title: '结构', class_id: 1, subject_id: subject.id });
    const existing = addQuestion({ stem: '旧题', type: 'single', subject_id: subject.id });

    const structure = service.savePaperStructure(TEACHER, String(paper.id), {
      sections: [{ title: '一', order_no: 1 }],
      items: [
        { order_no: 1, section_order_no: 1, question_id: existing },
        {
          order_no: 2,
          section_order_no: 1,
          question: { stem: '1+1', type: 'single', answer_json: '"2"', default_points: 4 },
        },
      ],
      rubric_points: [{ paper_item_order_no: 2, label: '步骤', points: 2, step_order: 1 }],
    });

    // The re-read projection is the one the legacy `findFirst` used: no subjects, no assets.
    expect(Object.keys(structure)).toEqual([
      'id',
      'teacher_id',
      'class_id',
      'subject_id',
      'title',
      'source',
      'status',
      'total_points',
      'exam_date',
      'created_at',
      'paper_sections',
      'paper_items',
    ]);
    expect(structure.paper_sections.map((section) => section.order_no)).toEqual([1]);
    expect(structure.paper_items.map((item) => item.order_no)).toEqual([1, 2]);

    const [firstItem, secondItem] = structure.paper_items;
    expect(firstItem).toMatchObject({ question_id: existing, section_id: structure.paper_sections[0].id });
    // The generated question inherits the paper's teacher and subject, as the legacy create did.
    expect(secondItem.questions).toMatchObject({
      stem: '1+1',
      type: 'single',
      answer_json: '"2"',
      default_points: 4,
      teacher_id: 7,
      subject_id: subject.id,
    });
    expect(secondItem.rubric_points.map((rubric) => rubric.label)).toEqual(['步骤']);

    const rawQuestion = db
      .prepare('SELECT created_at FROM questions WHERE id = ?')
      .get(secondItem.question_id) as { created_at: number };
    expect(typeof rawQuestion.created_at).toBe('number');
  });

  it('rolls the whole structure back when a later write fails, and never deletes questions', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const paper = service.createPaper(TEACHER, { title: '结构', class_id: 1, subject_id: subject.id });
    const existing = addQuestion({ stem: '旧题', type: 'single', subject_id: subject.id });

    service.savePaperStructure(TEACHER, String(paper.id), {
      sections: [{ title: '一', order_no: 1 }],
      items: [{ order_no: 1, section_order_no: 1, question_id: existing }],
      rubric_points: [],
    });
    const before = db.prepare('SELECT id FROM paper_items WHERE paper_id = ? ORDER BY id').all(paper.id);

    // The delete pass and both inserts run before the rubric pass, which is where this fails -
    // so a missing rollback would leave the replacement half-applied.
    const rolledBack = await apiErrorOf(() =>
      service.savePaperStructure(TEACHER, String(paper.id), {
        sections: [{ title: '二', order_no: 1 }],
        items: [
          { order_no: 1, question_id: existing },
          { order_no: 2, question: { stem: '新题', type: 'single' } },
        ],
        rubric_points: [{ paper_item_order_no: 99, label: 'x', points: 1, step_order: 1 }],
      }),
    );
    expect(rolledBack.statusCode).toBe(400);
    expect(rolledBack.message).toBe('Invalid rubric_points.paper_item_order_no');

    expect(db.prepare('SELECT id FROM paper_items WHERE paper_id = ? ORDER BY id').all(paper.id)).toEqual(before);
    expect(db.prepare('SELECT title FROM paper_sections WHERE paper_id = ?').all(paper.id)).toEqual([{ title: '一' }]);

    // The remaining validation branches, all inside the transaction, all rolling back.
    const badSection = await apiErrorOf(() =>
      service.savePaperStructure(TEACHER, String(paper.id), { sections: [{ order_no: 1 }] }),
    );
    expect(badSection.message).toBe('Invalid section title');

    const badItem = await apiErrorOf(() =>
      service.savePaperStructure(TEACHER, String(paper.id), { items: [{ order_no: 1 }] }),
    );
    expect(badItem.message).toBe('Missing question.stem');

    const badRubric = await apiErrorOf(() =>
      service.savePaperStructure(TEACHER, String(paper.id), {
        items: [{ order_no: 1, question: { stem: '题', type: 'single' } }],
        rubric_points: [{ paper_item_order_no: 1, points: 1, step_order: 1 }],
      }),
    );
    expect(badRubric.message).toBe('Invalid rubric_points.label');

    expect(db.prepare('SELECT title FROM paper_sections WHERE paper_id = ?').all(paper.id)).toEqual([{ title: '一' }]);
    // Generated questions are never deleted - the legacy transaction removed items, sections and
    // rubric points only.
    expect(db.prepare('SELECT COUNT(*) AS n FROM questions').get()).toEqual({ n: 1 });
  });

  it('stores an uploaded asset with the legacy path, digest and row shape', async () => {
    const paper = addPaper({ title: '上传' });
    const sourcePath = path.join(os.tmpdir(), `learning-upload-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
    fs.writeFileSync(sourcePath, 'hello');

    const asset = service.uploadPaperAsset(TEACHER, String(paper), {
      mimetype: 'text/plain',
      originalname: 'note.txt',
      path: sourcePath,
      size: 5,
    } as Express.Multer.File);

    expect(asset).toMatchObject({
      paper_id: paper,
      kind: 'file',
      mime: 'text/plain',
      size: 5,
      sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    });
    expect(asset.storage_path).toMatch(/^\/uploads\/papers\/[0-9a-f-]{36}\.txt$/);
    expect(asset.created_at).toMatch(ISO_MS);

    // The upload was moved (or copied + unlinked across volumes) and hashed in place.
    const savedPath = path.join(process.cwd(), asset.storage_path.replace(/^\//, ''));
    expect(fs.existsSync(savedPath)).toBe(true);
    expect(fs.existsSync(sourcePath)).toBe(false);
    // Remove the artifact this test wrote, exactly as the legacy suite did.
    fs.rmSync(savedPath, { force: true });

    expect(db.prepare('SELECT * FROM paper_assets WHERE id = ?').get(asset.id)).toMatchObject({
      paper_id: paper,
      storage_path: asset.storage_path,
      sha256: asset.sha256,
    });

    const missingFile = await apiErrorOf(() => service.uploadPaperAsset(TEACHER, String(paper), undefined));
    expect(missingFile.statusCode).toBe(400);
    expect(missingFile.message).toBe('Missing file');

    // Both remaining checks run before the file is touched, so the path need not exist.
    const untouchedUpload = { mimetype: 'text/plain', originalname: 'a.txt', path: sourcePath, size: 1 };

    const missingPaper = await apiErrorOf(() =>
      service.uploadPaperAsset(TEACHER, '999', untouchedUpload as Express.Multer.File),
    );
    expect(missingPaper.statusCode).toBe(404);
    expect(missingPaper.message).toBe('Paper not found');

    const otherTeacher = addPaper({ title: '别人的', teacher_id: 8 });
    const forbidden = await apiErrorOf(() =>
      service.uploadPaperAsset(TEACHER, String(otherTeacher), untouchedUpload as Express.Multer.File),
    );
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.message).toBe('无权限上传该试卷文件');
  });
});

// ---------------------------------------------------------------------------

describe('paper submissions', () => {
  function publishedPaper(): { paper: number; question: number; item: number } {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const paper = addPaper({ title: '周测', class_id: 1, subject_id: subject.id, status: 'published' });
    const question = addQuestion({
      stem: '1+1',
      type: 'single',
      answer_json: '"A"',
      default_points: 5,
      subject_id: subject.id,
    });
    const item = addPaperItem(paper, question, 1);
    return { paper, question, item };
  }

  it("starts a submission for a published paper of the student's own class", async () => {
    const { paper, question, item } = publishedPaper();

    const started = await service.startPaperSubmission(STUDENT, { paper_id: String(paper) });
    expect(started.submission).toMatchObject({ paper_id: paper, student_id: 80, submitted_at: null });
    expect(started.submission.started_at).toMatch(ISO_MS);
    expect(started.submission.total_time_sec).toBe(0);

    const raw = db
      .prepare('SELECT started_at, created_at FROM paper_submissions WHERE id = ?')
      .get(started.submission.id) as { started_at: number; created_at: number };
    expect(typeof raw.started_at).toBe('number');
    expect(typeof raw.created_at).toBe('number');

    expect(started.items.map((row) => row.id)).toEqual([item]);
    expect(started.items[0].questions).toMatchObject({ id: question });
    expect(started.items[0].rubric_points).toEqual([]);

    // The student came from the port, never from the `students` table.
    expect(classroom.userLookups).toEqual([8]);

    const missingPaper = await apiErrorOf(() => service.startPaperSubmission(STUDENT, {}));
    expect(missingPaper.statusCode).toBe(400);
    expect(missingPaper.message).toBe('Missing or invalid paper_id');

    const notFound = await apiErrorOf(() => service.startPaperSubmission(STUDENT, { paper_id: 999 }));
    expect(notFound.statusCode).toBe(404);
    expect(notFound.message).toBe('Paper not found');

    const draft = addPaper({ title: '草稿', class_id: 1, status: 'draft' });
    const unpublished = await apiErrorOf(() => service.startPaperSubmission(STUDENT, { paper_id: draft }));
    expect(unpublished.statusCode).toBe(403);
    expect(unpublished.message).toBe('试卷未发布');

    const otherClass = addPaper({ title: '别班', class_id: 2, status: 'published' });
    const foreign = await apiErrorOf(() => service.startPaperSubmission(STUDENT, { paper_id: otherClass }));
    expect(foreign.statusCode).toBe(403);
    expect(foreign.message).toBe('无权限开始该试卷');

    const noClass = await apiErrorOf(() => service.startPaperSubmission(NO_CLASS_STUDENT, { paper_id: paper }));
    expect(noClass.statusCode).toBe(400);
    expect(noClass.message).toBe('Student has no class');

    const unknown = await apiErrorOf(() => service.startPaperSubmission(UNKNOWN_STUDENT, { paper_id: paper }));
    expect(unknown.statusCode).toBe(404);
    expect(unknown.message).toBe('Student not found');

    const wrongRole = await apiErrorOf(() => service.startPaperSubmission(TEACHER, { paper_id: paper }));
    expect(wrongRole.statusCode).toBe(403);
    expect(wrongRole.message).toBe('无权限执行该操作');
  });

  it('saves answers with the legacy upsert semantics and guards', async () => {
    const { paper, item } = publishedPaper();
    const secondItem = addPaperItem(paper, addQuestion({ stem: '2+2', type: 'single' }), 2);
    const started = await service.startPaperSubmission(STUDENT, { paper_id: paper });
    const submission = started.submission.id;

    const noAnswers = await apiErrorOf(() => service.savePaperAnswers(STUDENT, String(submission), { answers: [] }));
    expect(noAnswers.statusCode).toBe(400);
    expect(noAnswers.message).toBe('Missing answers');

    const noSubmission = await apiErrorOf(() =>
      service.savePaperAnswers(STUDENT, '999', { answers: [{ paper_item_id: item, answer_json: 'A' }] }),
    );
    expect(noSubmission.statusCode).toBe(404);
    expect(noSubmission.message).toBe('Submission not found');

    const invalidItem = await apiErrorOf(() =>
      service.savePaperAnswers(STUDENT, String(submission), { answers: [{ answer_json: 'A' }] }),
    );
    expect(invalidItem.statusCode).toBe(400);
    expect(invalidItem.message).toBe('Invalid paper_item_id');

    await service.savePaperAnswers(STUDENT, String(submission), {
      answers: [{ paper_item_id: item, answer_json: 'A', time_spent_sec: '12' }],
    });
    const created = db.prepare('SELECT * FROM paper_answers WHERE submission_id = ?').get(submission) as Record<
      string,
      unknown
    >;
    expect(created).toMatchObject({
      paper_item_id: item,
      answer_json: 'A',
      time_spent_sec: 12,
      // The DDL defaults Prisma also relied on.
      score: 0,
      is_correct: 0,
      error_type: null,
    });
    expect(Object.keys(created)).toEqual([
      'id',
      'submission_id',
      'paper_item_id',
      'answer_json',
      'score',
      'is_correct',
      'time_spent_sec',
      'error_type',
      'created_at',
    ]);
    expect(typeof created.created_at).toBe('number');

    // Saving the same item again updates the row in place; an omitted `time_spent_sec` keeps the
    // stored value (`timeSpent === null ? undefined : timeSpent`).
    await service.savePaperAnswers(STUDENT, String(submission), {
      answers: [{ paper_item_id: item, answer_json: 'B' }],
    });
    const updated = db.prepare('SELECT * FROM paper_answers WHERE submission_id = ?').all(submission) as Array<
      Record<string, unknown>
    >;
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ answer_json: 'B', time_spent_sec: 12 });

    // A new item starts at 0, `null` is stored as NULL, and a non-string answer is coerced.
    await service.savePaperAnswers(STUDENT, String(submission), {
      answers: [{ paper_item_id: secondItem, answer_json: null }],
    });
    const blank = db
      .prepare('SELECT * FROM paper_answers WHERE submission_id = ? AND paper_item_id = ?')
      .get(submission, secondItem) as Record<string, unknown>;
    expect(blank.answer_json).toBeNull();
    expect(blank.time_spent_sec).toBe(0);

    await service.savePaperAnswers(STUDENT, String(submission), {
      answers: [{ paper_item_id: secondItem, answer_json: 42 }],
    });
    expect(
      (
        db
          .prepare('SELECT answer_json FROM paper_answers WHERE submission_id = ? AND paper_item_id = ?')
          .get(submission, secondItem) as { answer_json: string }
      ).answer_json,
    ).toBe('42');

    // Someone else's submission is refused after the student lookup.
    const foreignSubmission = api.run(
      'INSERT INTO paper_submissions (paper_id, student_id, started_at, created_at) VALUES (?, 81, ?, ?)',
      [paper, Date.now(), Date.now()],
    );
    const foreign = await apiErrorOf(() =>
      service.savePaperAnswers(STUDENT, String(foreignSubmission.lastInsertRowid), {
        answers: [{ paper_item_id: secondItem, answer_json: 'A' }],
      }),
    );
    expect(foreign.statusCode).toBe(403);
    expect(foreign.message).toBe('无权限保存该作答');

    // A submitted sheet is locked.
    api.run('UPDATE paper_submissions SET submitted_at = ? WHERE id = ?', [Date.now(), submission]);
    const locked = await apiErrorOf(() =>
      service.savePaperAnswers(STUDENT, String(submission), { answers: [{ paper_item_id: item, answer_json: 'C' }] }),
    );
    expect(locked.statusCode).toBe(400);
    expect(locked.message).toBe('已提交，无法修改');
  });

  it('scores, records wrong questions and seeds the study plan in one transaction', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const paper = addPaper({ title: '期末', class_id: 1, subject_id: subject.id, status: 'published' });
    const right = addQuestion({
      stem: '1+1',
      type: 'single',
      answer_json: '"A"',
      default_points: 5,
      subject_id: subject.id,
    });
    const wrong = addQuestion({
      stem: '2+2',
      type: 'single',
      answer_json: '"C"',
      default_points: 5,
      subject_id: subject.id,
    });
    const rightItem = addPaperItem(paper, right, 1);
    const wrongItem = addPaperItem(paper, wrong, 2);
    // The same question in a second position: `uniqueWrong` must collapse it.
    const wrongItemAgain = addPaperItem(paper, wrong, 3);

    const started = await service.startPaperSubmission(STUDENT, { paper_id: paper });
    const submission = started.submission.id;
    await service.savePaperAnswers(STUDENT, String(submission), {
      answers: [
        { paper_item_id: rightItem, answer_json: 'A' },
        { paper_item_id: wrongItem, answer_json: 'B' },
        // `wrongItemAgain` is left blank on purpose.
      ],
    });

    const result = await service.submitPaper(STUDENT, String(submission));
    expect(result).toEqual({
      paper_id: paper,
      submission_id: submission,
      total_score: 5,
      correct_count: 1,
      // The unanswered item is counted wrong too, exactly as the legacy scoring pass did.
      wrong_count: 2,
    });

    const answers = db
      .prepare('SELECT * FROM paper_answers WHERE submission_id = ? ORDER BY paper_item_id')
      .all(submission) as Array<Record<string, unknown>>;
    expect(answers).toHaveLength(3);
    const byItem = new Map(answers.map((answer) => [answer.paper_item_id as number, answer]));
    expect(byItem.get(rightItem)).toMatchObject({ score: 5, is_correct: 1, answer_json: 'A' });
    expect(byItem.get(wrongItem)).toMatchObject({ score: 0, is_correct: 0, answer_json: 'B' });
    expect(byItem.get(wrongItemAgain)).toMatchObject({
      answer_json: null,
      score: 0,
      is_correct: 0,
      time_spent_sec: 0,
      error_type: null,
    });

    const rawSubmission = db.prepare('SELECT submitted_at FROM paper_submissions WHERE id = ?').get(submission) as {
      submitted_at: number;
    };
    expect(typeof rawSubmission.submitted_at).toBe('number');

    // One wrong-question row per question, not per item.
    const wrongRows = db.prepare('SELECT * FROM wrong_questions WHERE student_id = ?').all(80) as Array<
      Record<string, unknown>
    >;
    expect(wrongRows).toHaveLength(1);
    expect(wrongRows[0]).toMatchObject({ question_id: wrong, wrong_count: 1, mastery_score: 0, cleared_at: null });
    expect(typeof wrongRows[0].last_wrong_at).toBe('number');

    const listed = await service.listWrongQuestions(STUDENT);
    expect(listed.map((row) => row.id)).toEqual([wrongRows[0].id]);
    expect(listed[0].questions).toMatchObject({ id: wrong });
    expect(listed[0].last_wrong_at).toMatch(ISO_MS);

    const plans = db.prepare('SELECT * FROM study_plans WHERE student_id = ?').all(80) as Array<Record<string, unknown>>;
    expect(plans).toHaveLength(1);
    expect(plans[0].status).toBe('active');
    const planItems = db
      .prepare('SELECT * FROM study_plan_items WHERE plan_id = ?')
      .all(plans[0].id as number) as Array<Record<string, unknown>>;
    expect(planItems).toHaveLength(1);
    expect(planItems[0]).toMatchObject({ kind: 'practice', question_id: wrong, estimated_min: 10, status: 'pending' });

    const already = await apiErrorOf(() => service.submitPaper(STUDENT, String(submission)));
    expect(already.statusCode).toBe(400);
    expect(already.message).toBe('已提交');
  });

  it('reuses the active plan and does not duplicate a pending practice item', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const question = addQuestion({
      stem: '2+2',
      type: 'single',
      answer_json: '"C"',
      default_points: 5,
      subject_id: subject.id,
    });

    async function submitOneWrong(paper: number, item: number) {
      const started = await service.startPaperSubmission(STUDENT, { paper_id: paper });
      await service.savePaperAnswers(STUDENT, String(started.submission.id), {
        answers: [{ paper_item_id: item, answer_json: 'B' }],
      });
      return service.submitPaper(STUDENT, String(started.submission.id));
    }

    const firstPaper = addPaper({ title: '第一次', class_id: 1, subject_id: subject.id, status: 'published' });
    const firstItem = addPaperItem(firstPaper, question, 1);
    const first = await submitOneWrong(firstPaper, firstItem);
    expect(first.wrong_count).toBe(1);

    const secondPaper = addPaper({ title: '第二次', class_id: 1, subject_id: subject.id, status: 'published' });
    const secondItem = addPaperItem(secondPaper, question, 1);
    await submitOneWrong(secondPaper, secondItem);

    const plans = db.prepare('SELECT * FROM study_plans WHERE student_id = ?').all(80) as Array<Record<string, unknown>>;
    expect(plans).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM study_plan_items').get()).toEqual({ n: 1 });

    const wrongRows = db.prepare('SELECT * FROM wrong_questions WHERE student_id = ?').all(80) as Array<
      Record<string, unknown>
    >;
    expect(wrongRows).toHaveLength(1);
    // The second failure bumps the counter instead of inserting a second row.
    expect(wrongRows[0].wrong_count).toBe(2);
  });

  it('keeps a manually graded subjective score and never counts it wrong', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const paper = addPaper({ title: '主观题', class_id: 1, subject_id: subject.id, status: 'published' });
    const question = addQuestion({
      stem: '论述',
      type: 'essay',
      answer_json: null,
      is_subjective: 1,
      default_points: 10,
      subject_id: subject.id,
    });
    const item = addPaperItem(paper, question, 1);

    const started = await service.startPaperSubmission(STUDENT, { paper_id: paper });
    const submission = started.submission.id;
    await service.savePaperAnswers(STUDENT, String(submission), {
      answers: [{ paper_item_id: item, answer_json: '我的答案' }],
    });
    // A teacher's grade, exactly the column the legacy scoring pass read back.
    api.run('UPDATE paper_answers SET score = ? WHERE submission_id = ? AND paper_item_id = ?', [7, submission, item]);

    const result = await service.submitPaper(STUDENT, String(submission));
    expect(result).toEqual({
      paper_id: paper,
      submission_id: submission,
      total_score: 7,
      correct_count: 0,
      wrong_count: 0,
    });
    expect(
      (
        db
          .prepare('SELECT score FROM paper_answers WHERE submission_id = ? AND paper_item_id = ?')
          .get(submission, item) as { score: number }
      ).score,
    ).toBe(7);
    expect(db.prepare('SELECT COUNT(*) AS n FROM wrong_questions').get()).toEqual({ n: 0 });
  });
});

// ---------------------------------------------------------------------------

describe('wrong questions', () => {
  it('lists only uncleared rows, newest first, with the question relation', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const first = addQuestion({ stem: 'q1', type: 'single', subject_id: subject.id });
    const second = addQuestion({ stem: 'q2', type: 'single', subject_id: subject.id });
    const cleared = addQuestion({ stem: 'q3', type: 'single', subject_id: subject.id });

    const older = addWrongQuestion(80, first, 0.5, 1_000);
    const newer = addWrongQuestion(80, second, 0.5, 3_000);
    const clearedRow = addWrongQuestion(80, cleared, 0.5, 5_000);
    api.run('UPDATE wrong_questions SET cleared_at = ? WHERE id = ?', [4_000, clearedRow]);
    // Another student's rows never appear.
    addWrongQuestion(81, first, 0.5, 6_000);

    const listed = await service.listWrongQuestions(STUDENT);
    expect(listed.map((row) => row.id)).toEqual([newer, older]);
    expect(listed[0].questions).toMatchObject({ id: second });
    expect(listed[0].last_wrong_at).toMatch(ISO_MS);
    expect(Object.keys(listed[0])).toEqual([
      'id',
      'student_id',
      'question_id',
      'first_wrong_at',
      'last_wrong_at',
      'wrong_count',
      'mastery_score',
      'cleared_at',
      'created_at',
      'updated_at',
      'questions',
    ]);
  });

  it('moves mastery, records the attempt and clears the question at the legacy threshold', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const question = addQuestion({ stem: 'q1', type: 'single', subject_id: subject.id });
    const second = addQuestion({ stem: 'q2', type: 'single', subject_id: subject.id });

    const nearMastery = addWrongQuestion(80, question, 0.8, 1_000);
    await service.attemptWrongQuestion(STUDENT, String(nearMastery), {
      is_correct: 1,
      spent_sec: '12',
      practice_source: 'review',
    });

    const mastered = db.prepare('SELECT * FROM wrong_questions WHERE id = ?').get(nearMastery) as Record<string, unknown>;
    expect(mastered.mastery_score).toBe(1);
    expect(typeof mastered.cleared_at).toBe('number');
    const attempt = db
      .prepare('SELECT * FROM wrong_question_attempts WHERE wrong_question_id = ?')
      .all(nearMastery) as Array<Record<string, unknown>>;
    expect(attempt).toHaveLength(1);
    expect(attempt[0]).toMatchObject({ practice_source: 'review', is_correct: 1, spent_sec: 12 });

    const failing = addWrongQuestion(80, second, 0.5, 1_000);
    await service.attemptWrongQuestion(STUDENT, String(failing), { is_correct: 0 });
    const decayed = db.prepare('SELECT * FROM wrong_questions WHERE id = ?').get(failing) as Record<string, unknown>;
    expect(decayed.mastery_score).toBeCloseTo(0.4, 10);
    expect(decayed.cleared_at).toBeNull();
    const failingAttempt = db
      .prepare('SELECT * FROM wrong_question_attempts WHERE wrong_question_id = ?')
      .all(failing) as Array<Record<string, unknown>>;
    expect(failingAttempt[0]).toMatchObject({ practice_source: 'practice', is_correct: 0, spent_sec: 0 });

    // A cleared question leaves the "my wrong questions" list.
    expect((await service.listWrongQuestions(STUDENT)).map((row) => row.id)).toEqual([failing]);
  });

  it('refuses another student and keeps the legacy 400/404/403 split', async () => {
    const question = addQuestion({ stem: 'q1', type: 'single' });
    const mine = addWrongQuestion(80, question, 0.5, 1_000);
    const theirs = addWrongQuestion(81, question, 0.5, 1_000);

    const foreign = await apiErrorOf(() => service.attemptWrongQuestion(STUDENT, String(theirs), { is_correct: 1 }));
    expect(foreign.statusCode).toBe(403);
    expect(foreign.message).toBe('无权限操作该错题');

    const missing = await apiErrorOf(() => service.attemptWrongQuestion(STUDENT, '999', { is_correct: 1 }));
    expect(missing.statusCode).toBe(404);
    expect(missing.message).toBe('Wrong question not found');

    const invalid = await apiErrorOf(() => service.attemptWrongQuestion(STUDENT, 'abc', {}));
    expect(invalid.statusCode).toBe(400);
    expect(invalid.message).toBe('Invalid id');

    const generatedForeign = await apiErrorOf(() => service.generateWrongQuestionPractice(STUDENT, String(theirs)));
    expect(generatedForeign.statusCode).toBe(404);
    expect(generatedForeign.message).toBe('Wrong question not found');

    // The caller's own row is the one that works - the 403 above was about ownership, not the row.
    await service.attemptWrongQuestion(STUDENT, String(mine), { is_correct: 1 });
    expect((await service.listWrongQuestions(STUDENT)).map((row) => row.id)).toEqual([mine]);
  });

  it('generates practice from linked nodes: excluding self, newest first, capped at five', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const nodeA = service.createKnowledgeNode(TEACHER, { subject_id: subject.id, name: 'A' });
    const nodeB = service.createKnowledgeNode(TEACHER, { subject_id: subject.id, name: 'B' });

    const target = addQuestion({ stem: '错题', type: 'single', subject_id: subject.id });
    const linked = Array.from({ length: 6 }, (_, index) =>
      addQuestion({ stem: `同节点 ${index}`, type: 'single', subject_id: subject.id }),
    );
    const otherNode = addQuestion({ stem: '别的节点', type: 'single', subject_id: subject.id });

    linkQuestionToNode(target, nodeA.id);
    for (const question of linked) linkQuestionToNode(question, nodeA.id);
    linkQuestionToNode(otherNode, nodeB.id);

    const wrongId = addWrongQuestion(80, target, 0.5, 1_000);
    const generated = await service.generateWrongQuestionPractice(STUDENT, String(wrongId));

    // `ORDER BY id DESC LIMIT 5`, self excluded, and node B never consulted.
    expect(generated.map((row) => row.id)).toEqual(linked.slice(1).reverse());
    expect(generated.map((row) => row.id)).not.toContain(target);
    expect(generated.map((row) => row.id)).not.toContain(otherNode);
    expect(generated[0].created_at).toMatch(ISO_MS);
  });

  it('falls back to subject+type, capped at five, when the question has no node links', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const otherSubject = service.createSubject(TEACHER, { name: '语文' });

    const target = addQuestion({ stem: '错题', type: 'single', subject_id: subject.id });
    const matches = Array.from({ length: 7 }, (_, index) =>
      addQuestion({ stem: `同科同型 ${index}`, type: 'single', subject_id: subject.id }),
    );
    const differentSubject = addQuestion({ stem: '别科', type: 'single', subject_id: otherSubject.id });
    const differentType = addQuestion({ stem: '别型', type: 'multiple', subject_id: subject.id });

    const wrongId = addWrongQuestion(80, target, 0.5, 1_000);
    const generated = await service.generateWrongQuestionPractice(STUDENT, String(wrongId));

    expect(generated.map((row) => row.id)).toEqual(matches.slice(2).reverse());
    expect(generated.map((row) => row.id)).not.toContain(target);
    expect(generated.map((row) => row.id)).not.toContain(differentSubject);
    expect(generated.map((row) => row.id)).not.toContain(differentType);
  });

  it('drops the subject filter entirely when the wrong question has no subject', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const target = addQuestion({ stem: '无科目错题', type: 'single', subject_id: null });
    const alsoNoSubject = addQuestion({ stem: '无科目同型', type: 'single', subject_id: null });
    const withSubject = addQuestion({ stem: '有科目同型', type: 'single', subject_id: subject.id });
    const otherType = addQuestion({ stem: '无科目别型', type: 'multiple', subject_id: null });

    const wrongId = addWrongQuestion(80, target, 0.5, 1_000);
    const generated = await service.generateWrongQuestionPractice(STUDENT, String(wrongId));

    // The legacy `subject_id: undefined` dropped the filter rather than comparing against NULL,
    // so a subject-less wrong question matches questions of ANY subject with the same type.
    expect(generated.map((row) => row.id)).toEqual([withSubject, alsoNoSubject]);
    expect(generated.map((row) => row.id)).not.toContain(otherType);
    expect(generated.map((row) => row.id)).not.toContain(target);
  });
});

// ---------------------------------------------------------------------------

describe('study plans', () => {
  it('archives the previous active plan and returns the new one', async () => {
    const first = await service.createStudyPlan(STUDENT, {
      target_score: '95',
      target_exam_date: '2026-06-07T00:00:00.000Z',
    });
    expect(first).toMatchObject({ student_id: 80, status: 'active', target_score: 95 });
    expect(first.target_exam_date).toBe('2026-06-07T00:00:00.000Z');
    expect(first.created_at).toMatch(ISO_MS);
    expect(first.updated_at).toMatch(ISO_MS);

    const second = await service.createStudyPlan(STUDENT, {});
    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({ status: 'active', target_score: null, target_exam_date: null });

    const rows = db.prepare('SELECT * FROM study_plans WHERE student_id = ? ORDER BY id').all(80) as Array<
      Record<string, unknown>
    >;
    expect(rows.map((row) => row.status)).toEqual(['archived', 'active']);
    // `archiveActiveStudyPlans` stamped the archived row.
    expect(typeof rows[0].updated_at).toBe('number');

    // The active plan is the newest one, ordered by id desc.
    expect((await service.getMyStudyPlan(STUDENT))!.id).toBe(second.id);
  });

  it('returns the active plan with ordered items and their relations', async () => {
    const subject = service.createSubject(TEACHER, { name: '数学' });
    const question = addQuestion({ stem: 'q1', type: 'single', subject_id: subject.id });
    const node = service.createKnowledgeNode(TEACHER, { subject_id: subject.id, name: '函数' });
    const plan = await service.createStudyPlan(STUDENT, {});

    const firstItem = api.run(
      `INSERT INTO study_plan_items (plan_id, kind, knowledge_node_id, question_id, estimated_min, status, created_at)
       VALUES (?, 'practice', ?, ?, 10, 'pending', ?)`,
      [plan.id, node.id, question, 1_000],
    );
    const secondItem = api.run(
      `INSERT INTO study_plan_items (plan_id, kind, estimated_min, status, created_at)
       VALUES (?, 'review', 5, 'done', ?)`,
      [plan.id, 2_000],
    );

    const active = (await service.getMyStudyPlan(STUDENT))!;
    expect(Object.keys(active)).toEqual([
      'id',
      'student_id',
      'target_exam_date',
      'target_score',
      'status',
      'created_at',
      'updated_at',
      'study_plan_items',
    ]);
    expect(active.study_plan_items.map((item) => item.id)).toEqual([
      Number(firstItem.lastInsertRowid),
      Number(secondItem.lastInsertRowid),
    ]);
    expect(active.study_plan_items[0].questions).toMatchObject({ id: question });
    expect(active.study_plan_items[0].knowledge_nodes).toMatchObject({ id: node.id });
    expect(active.study_plan_items[1].questions).toBeNull();
    expect(active.study_plan_items[1].knowledge_nodes).toBeNull();
    expect(active.study_plan_items[1]).toMatchObject({ kind: 'review', status: 'done', estimated_min: 5 });
  });

  it('returns null when the student has no active plan', async () => {
    expect(await service.getMyStudyPlan(STUDENT)).toBeNull();

    const archived = await service.createStudyPlan(STUDENT, {});
    api.run('UPDATE study_plans SET status = ? WHERE id = ?', ['archived', archived.id]);
    expect(await service.getMyStudyPlan(STUDENT)).toBeNull();
  });

  it('checks item ownership before updating the status', async () => {
    const mine = await service.createStudyPlan(STUDENT, {});
    const mineItem = api.run(
      `INSERT INTO study_plan_items (plan_id, kind, estimated_min, status, created_at)
       VALUES (?, 'practice', 10, 'pending', ?)`,
      [mine.id, Date.now()],
    );
    const itemId = Number(mineItem.lastInsertRowid);

    const updated = await service.updateStudyPlanItem(STUDENT, String(itemId), { status: 'done' });
    expect(updated).toMatchObject({ id: itemId, status: 'done' });
    expect(updated.created_at).toMatch(ISO_MS);

    const missingStatus = await apiErrorOf(() => service.updateStudyPlanItem(STUDENT, String(itemId), {}));
    expect(missingStatus.statusCode).toBe(400);
    expect(missingStatus.message).toBe('Missing status');

    const invalid = await apiErrorOf(() => service.updateStudyPlanItem(STUDENT, 'abc', { status: 'done' }));
    expect(invalid.statusCode).toBe(400);
    expect(invalid.message).toBe('Invalid id');

    const theirs = api.run(`INSERT INTO study_plans (student_id, status, created_at, updated_at) VALUES (81, 'active', ?, ?)`, [
      Date.now(),
      Date.now(),
    ]);
    const theirItem = api.run(
      `INSERT INTO study_plan_items (plan_id, kind, estimated_min, status, created_at)
       VALUES (?, 'practice', 10, 'pending', ?)`,
      [Number(theirs.lastInsertRowid), Date.now()],
    );
    const forbidden = await apiErrorOf(() =>
      service.updateStudyPlanItem(STUDENT, String(theirItem.lastInsertRowid), { status: 'done' }),
    );
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.message).toBe('无权限修改该任务');

    const missing = await apiErrorOf(() => service.updateStudyPlanItem(STUDENT, '999', { status: 'done' }));
    expect(missing.statusCode).toBe(404);
    expect(missing.message).toBe('Item not found');
  });
});
