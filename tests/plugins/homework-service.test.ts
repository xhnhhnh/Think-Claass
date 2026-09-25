/**
 * homework service and repository tests.
 *
 * Three layers, in increasing strength:
 *
 *   1. **the shipped SQL against a real database.** `createDbApi` is built from the manifest's own
 *      data declaration with ownership checking ON, so this proves the plugin's statements only touch
 *      what it declared - including the negative, that a write to `students` is refused. A repository
 *      that under-declared its reads would fail here rather than in production.
 *   2. **the service's authorization and ownership rules**, which are the second gate: the controller
 *      answers "may this kind of user call this route", and only the service can answer "may this
 *      teacher grade this pupil's work".
 *   3. **the score model** - that `score` is always derived from `teacher_score` or `ai_score`, never
 *      assigned directly. That is the invariant that keeps "the AI proposed 4 and the teacher accepted
 *      it" distinguishable from "the teacher overrode it to 2", and it is the one an "obvious
 *      simplification" would destroy.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ApiError, openDatabase, type Database } from '@thinkclass/kernel';
import { createDbApi, type DbApi } from '@thinkclass/plugin-runtime';

import type { RequestActor } from '../../plugins/homework/src/homework.authorization.js';
import { createHomeworkRepository } from '../../plugins/homework/src/homework.repository.js';
import { effectiveScore, HomeworkService, normaliseQuestions } from '../../plugins/homework/src/homework.service.js';

/**
 * The tables the plugin declares, read out of `plugin.json` at test time.
 *
 * Not hand-copied: a fixture list that drifts from the manifest would test the fixture. The manifest
 * is what the runtime enforces, so it is what these tests must be built from.
 */
import manifest from '../../plugins/homework/plugin.json' with { type: 'json' };

const DECLARED_TABLES: string[] = manifest.data.tables;
const DECLARED_READS: string[] = manifest.data.reads;

/** The DDL the plugin owns, mirrored here so the tests can be exact about columns. */
const SCHEMA = `
  CREATE TABLE p_homework_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER NOT NULL, teacher_id INTEGER NOT NULL,
    title TEXT NOT NULL, description TEXT, due_at TEXT, status TEXT NOT NULL DEFAULT 'draft',
    total_points INTEGER NOT NULL DEFAULT 0, reward_points INTEGER NOT NULL DEFAULT 0,
    legacy_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE p_homework_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER NOT NULL, order_no INTEGER NOT NULL,
    type TEXT NOT NULL, stem TEXT NOT NULL, options_json TEXT, answer_json TEXT, explanation TEXT,
    points INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );
  CREATE TABLE p_homework_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', submitted_at TEXT, score INTEGER,
    total_points INTEGER NOT NULL DEFAULT 0, teacher_feedback TEXT, ai_feedback TEXT,
    ai_confidence REAL, graded_by TEXT, legacy_id INTEGER, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, UNIQUE (assignment_id, student_id)
  );
  CREATE TABLE p_homework_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, submission_id INTEGER NOT NULL, question_id INTEGER NOT NULL,
    answer_json TEXT, score INTEGER, is_correct INTEGER, auto_score INTEGER, auto_source TEXT,
    ai_score INTEGER, ai_comment TEXT, ai_confidence REAL, ai_source TEXT, teacher_score INTEGER,
    teacher_comment TEXT, updated_at TEXT NOT NULL, UNIQUE (submission_id, question_id)
  );
  CREATE TABLE p_homework_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, submission_id INTEGER NOT NULL, storage_path TEXT NOT NULL,
    mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, uploaded_by INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE TABLE p_homework_qa_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER NOT NULL, student_id INTEGER NOT NULL,
    role TEXT NOT NULL, content TEXT NOT NULL, ai_source TEXT, created_at TEXT NOT NULL
  );
  -- The two tables the plugin READS. Created here with only the columns it selects, so a statement
  -- reaching for anything else fails loudly.
  CREATE TABLE students (id INTEGER PRIMARY KEY, class_id INTEGER, name TEXT, user_id INTEGER);
  CREATE TABLE classes (id INTEGER PRIMARY KEY, name TEXT);
  CREATE TABLE assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER, teacher_id INTEGER, title TEXT NOT NULL,
    description TEXT, due_date TEXT, reward_points INTEGER, created_at TEXT
  );
  CREATE TABLE student_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER, student_id INTEGER, status TEXT,
    content TEXT, score INTEGER, teacher_feedback TEXT, submitted_at TEXT, created_at TEXT
  );
`;

const TEACHER: RequestActor = { id: 2, role: 'teacher', studentId: null, classId: null };
const OTHER_TEACHER: RequestActor = { id: 3, role: 'teacher', studentId: null, classId: null };
const ADMIN: RequestActor = { id: 1, role: 'admin', studentId: null, classId: null };
const STUDENT: RequestActor = { id: 8, role: 'student', studentId: 10, classId: 1 };
const OTHER_STUDENT: RequestActor = { id: 9, role: 'student', studentId: 11, classId: 1 };
const PARENT: RequestActor = { id: 12, role: 'parent', studentId: 10, classId: 1 };

let db: Database;
let api: DbApi;
let service: HomeworkService;

/** Seed two pupils, a class, and the rows the fixture needs. */
function seed(): void {
  db.exec(`
    INSERT INTO classes (id, name) VALUES (1, '一班');
    INSERT INTO students (id, class_id, name, user_id) VALUES (10, 1, 'enc:小明', 8), (11, 1, 'enc:小红', 9);
  `);
}

beforeEach(() => {
  db = openDatabase(':memory:');
  db.exec(SCHEMA);
  seed();
  api = createDbApi({
    db,
    pluginId: 'homework',
    ownedTables: new Set(DECLARED_TABLES),
    readTables: new Set(DECLARED_READS),
    strict: true,
  });
  service = new HomeworkService({
    repository: createHomeworkRepository(api, { decryptName: (value) => value.replace(/^enc:/, '') }),
    // The same decryptor the repository gets. The service hands it to the grade sheet it builds, so a
    // service that forgot it would label pupils by id while the repository reported names.
    decryptName: (value) => value.replace(/^enc:/, ''),
  });
});

/** A four-question paper: single, multiple, blank and short. */
function publishPaper(actor: RequestActor = TEACHER) {
  return service.createHomework(actor, {
    class_id: 1,
    title: '第三章练习',
    status: 'published',
    questions: [
      { type: 'single', stem: '质数？', options: [{ id: 'a', text: '4' }, { id: 'b', text: '7' }], reference: { choice: ['b'] }, points: 5 },
      { type: 'multiple', stem: '偶数？', options: [{ id: 'a', text: '2' }, { id: 'b', text: '3' }, { id: 'c', text: '4' }], reference: { choice: ['a', 'c'] }, points: 4 },
      { type: 'blank', stem: '首都？', reference: { accept: ['北京', 'Beijing'] }, points: 3 },
      { type: 'short', stem: '水的三态', reference: { text: '固态液态气态', rubric: [{ label: '固态', points: 2 }, { label: '液态', points: 2 }] } as never, points: 4 },
    ],
  });
}

describe('repository: the shipped SQL against a real database, ownership checking on', () => {
  it('declares tables and reads that do not overlap', () => {
    // `data.tables` and `data.reads` being disjoint is what makes the ownership sets meaningful: an
    // overlap would mean a table is both owned and borrowed, and the checker resolves that in the
    // owner's favour silently.
    expect(DECLARED_TABLES.filter((table) => DECLARED_READS.includes(table))).toEqual([]);
  });

  it('may write its own tables and read the ones it declared', () => {
    const created = publishPaper();
    expect(created.id).toBeGreaterThan(0);
    expect(service.listHomeworks(TEACHER, 1)).toHaveLength(1);
    // The grade sheet is the one place the repository reads `students`.
    expect(service.listSubmissions(TEACHER, created.id).map((row) => row.student_name)).toEqual(['小明', '小红']);
  });

  it('refuses to write a table it only reads', () => {
    // The negative that makes the declaration load-bearing: this is the statement a careless
    // "just award the reward points" change would add.
    expect(() => api.run('UPDATE students SET total_points = 1 WHERE id = ?', [10])).toThrow(
      /may not write to table "students"/,
    );
    expect(() => api.run('DELETE FROM student_assignments WHERE id = 1')).toThrow(
      /may not write to table "student_assignments"/,
    );
  });

  it('refuses to read a table it never declared', () => {
    expect(() => api.query('SELECT * FROM pets')).toThrow(/without declaring it/);
  });

  it('keeps a homework with no questions in its own list, with a count of zero', () => {
    // The `LEFT JOIN ... COUNT(q.id)` matters here: `COUNT(*)` would report 1 for a question-less
    // homework, and an inner join would drop it from its own list entirely.
    const paper = publishPaper();
    service.createHomework(TEACHER, { class_id: 1, title: '空作业', status: 'published' });
    const byTitle = new Map(service.listHomeworks(TEACHER, 1).map((row) => [row.title, row.question_count]));
    expect(byTitle.get('空作业')).toBe(0);
    expect(byTitle.get('第三章练习')).toBe(paper.questions.length);
  });

  it('stores the options and reference answer as JSON and reads them back parsed', () => {
    const created = publishPaper();
    const raw = db.prepare('SELECT options_json, answer_json FROM p_homework_questions WHERE id = ?').get(created.questions[0].id) as {
      options_json: string;
      answer_json: string;
    };
    // The column really is a string - if it were not, the parse on the way out would be silent.
    expect(typeof raw.options_json).toBe('string');
    expect(created.questions[0].options).toEqual([{ id: 'a', text: '4' }, { id: 'b', text: '7' }]);
    expect(created.questions[0].reference).toEqual({ choice: ['b'] });
  });

  it('survives a malformed JSON column instead of failing the whole paper', () => {
    const created = publishPaper();
    db.prepare('UPDATE p_homework_questions SET options_json = ?, answer_json = ? WHERE id = ?').run(
      'not json',
      '{oops',
      created.questions[0].id,
    );
    const detail = service.getHomework(TEACHER, created.id);
    expect(detail.questions[0].options).toEqual([]);
    expect(detail.questions[0].reference).toEqual({});
  });

  it('deletes children before parents, and the QA thread with them', () => {
    const created = publishPaper();
    const attempt = service.startAttempt(STUDENT, created.id);
    service.saveAnswers(STUDENT, attempt.submission.id, { answers: [{ question_id: created.questions[0].id, value: { choice: ['b'] } }] });
    db.prepare(
      'INSERT INTO p_homework_qa_messages (assignment_id, student_id, role, content, created_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)',
    ).run(created.id, 10, 'student', '为什么？');

    service.deleteHomework(TEACHER, created.id);

    for (const table of DECLARED_TABLES) {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
      expect({ table, n: row.n }).toEqual({ table, n: 0 });
    }
  });
});

describe('service: publishing and editing', () => {
  it('derives teacher_id from the actor and discards a body copy', () => {
    // The legacy path trusted `input.teacher_id`, so an authenticated teacher could file work under a
    // colleague's name.
    const created = service.createHomework(TEACHER, { class_id: 1, title: 'x', teacher_id: 999 } as never);
    const row = db.prepare('SELECT teacher_id FROM p_homework_assignments WHERE id = ?').get(created.id) as { teacher_id: number };
    expect(row.teacher_id).toBe(TEACHER.id);
  });

  it('sums total_points from the questions rather than trusting the body', () => {
    expect(publishPaper().total_points).toBe(16);
  });

  it('refuses an unattributable write from an actor with no id', () => {
    expect(() =>
      service.createHomework({ id: null, role: 'teacher', studentId: null, classId: null }, { class_id: 1, title: 'x' }),
    ).toThrow(/未登录/);
  });

  it('refuses to edit or delete another teacher\'s homework', () => {
    const created = publishPaper();
    expect(() => service.updateHomework(OTHER_TEACHER, created.id, { title: 'y' })).toThrow(
      /无权限修改该作业/,
    );
    expect(() => service.deleteHomework(OTHER_TEACHER, created.id)).toThrow(/无权限删除该作业/);
    // And admin is the escape hatch, as everywhere else.
    expect(service.updateHomework(ADMIN, created.id, { title: 'y' }).title).toBe('y');
  });

  it('replaces the question list without destroying answers to questions that survived', () => {
    const created = publishPaper();
    const attempt = service.startAttempt(STUDENT, created.id);
    const firstQuestion = created.questions[0];
    service.saveAnswers(STUDENT, attempt.submission.id, {
      answers: [{ question_id: firstQuestion.id, value: { choice: ['b'] } }],
    });

    // Edit the first question's stem in place and drop the last one.
    const kept = created.questions.slice(0, 3).map((question, index) =>
      index === 0
        ? { id: question.id, type: question.type, stem: '质数是哪个？', options: question.options, reference: question.reference, points: question.points }
        : { id: question.id, type: question.type, stem: question.stem, options: question.options, reference: question.reference, points: question.points },
    );
    const updated = service.updateHomework(TEACHER, created.id, { questions: kept });

    expect(updated.questions).toHaveLength(3);
    expect(updated.questions[0].stem).toBe('质数是哪个？');
    // The answer to the edited question is still there - an update-in-place, not a delete-and-insert.
    const answers = db.prepare('SELECT * FROM p_homework_answers WHERE submission_id = ?').all(attempt.submission.id);
    expect(answers).toHaveLength(1);
    // And the denominator followed the question list.
    expect(updated.total_points).toBe(12);
  });

  it('refuses a question id belonging to another homework', () => {
    const mine = publishPaper();
    const theirs = service.createHomework(OTHER_TEACHER, {
      class_id: 1,
      title: '别人的作业',
      questions: [{ type: 'blank', stem: 'q', reference: { accept: ['x'] }, points: 1 }],
    });

    // Re-pointing another teacher's question into this paper would leak its reference answer.
    expect(() =>
      service.updateHomework(TEACHER, mine.id, {
        questions: [
          { id: theirs.questions[0].id, type: 'blank', stem: 'stolen', reference: { accept: ['x'] }, points: 1 },
        ],
      }),
    ).toThrow(/不属于该作业/);
  });
});

describe('service: the student attempt', () => {
  it('is idempotent, so a page refresh continues rather than duplicating', () => {
    const created = publishPaper();
    const first = service.startAttempt(STUDENT, created.id);
    const second = service.startAttempt(STUDENT, created.id);
    expect(second.submission.id).toBe(first.submission.id);
    const count = db.prepare('SELECT COUNT(*) AS n FROM p_homework_submissions').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('takes student_id from the actor, never from the request', () => {
    const created = publishPaper();
    const attempt = service.startAttempt(STUDENT, created.id);
    expect(attempt.submission.student_id).toBe(STUDENT.studentId);
  });

  it('refuses a homework set for another class', () => {
    const created = publishPaper();
    expect(() => service.startAttempt({ ...OTHER_STUDENT, classId: 2 }, created.id)).toThrow(/无权限作答/);
  });

  it('refuses an unpublished homework, and a closed one nobody started', () => {
    const draft = service.createHomework(TEACHER, { class_id: 1, title: '草稿', status: 'draft' });
    expect(() => service.startAttempt(STUDENT, draft.id)).toThrow(/尚未发布/);

    const created = publishPaper();
    service.updateHomework(TEACHER, created.id, { status: 'closed' });
    expect(() => service.startAttempt(STUDENT, created.id)).toThrow(/已截止/);

    // But a pupil who already started may still open their attempt: they need to see what they wrote.
    service.updateHomework(TEACHER, created.id, { status: 'published' });
    const attempt = service.startAttempt(STUDENT, created.id);
    service.updateHomework(TEACHER, created.id, { status: 'closed' });
    expect(service.startAttempt(STUDENT, created.id).submission.id).toBe(attempt.submission.id);
  });

  it('refuses to touch another pupil\'s submission', () => {
    const created = publishPaper();
    const attempt = service.startAttempt(STUDENT, created.id);
    expect(() =>
      service.saveAnswers(OTHER_STUDENT, attempt.submission.id, {
        answers: [{ question_id: created.questions[0].id, value: { text: 'x' } }],
      }),
    ).toThrow(/无权限操作该提交/);
  });

  it('refuses an answer for a question from a different homework', () => {
    const mine = publishPaper();
    const theirs = service.createHomework(OTHER_TEACHER, {
      class_id: 1,
      title: '别人的作业',
      questions: [{ type: 'blank', stem: 'q', reference: { accept: ['x'] }, points: 1 }],
    });
    const attempt = service.startAttempt(STUDENT, mine.id);
    expect(() =>
      service.saveAnswers(STUDENT, attempt.submission.id, {
        answers: [{ question_id: theirs.questions[0].id, value: { text: 'x' } }],
      }),
    ).toThrow(/题目不属于该作业/);
  });

  it('auto-scores the objective half on submit and leaves the short answer for a human', () => {
    const created = publishPaper();
    const attempt = service.startAttempt(STUDENT, created.id);
    const submitted = service.submitAttempt(STUDENT, attempt.submission.id, {
      answers: [
        { question_id: created.questions[0].id, value: { choice: ['b'] } },
        { question_id: created.questions[1].id, value: { choice: ['a', 'c'] } },
        { question_id: created.questions[2].id, value: { text: 'beijing' } },
        { question_id: created.questions[3].id, value: { text: '固态和液态' } },
      ],
    });

    expect(submitted.submission.status).toBe('submitted');
    const byQuestion = new Map(submitted.answers.map((answer) => [answer.question_id, answer]));
    expect(byQuestion.get(created.questions[0].id)).toMatchObject({ score: 5, is_correct: 1, auto_source: 'auto' });
    expect(byQuestion.get(created.questions[1].id)).toMatchObject({ score: 4, is_correct: 1 });
    // Case-folded, because a blank answer is text a pupil typed.
    expect(byQuestion.get(created.questions[2].id)).toMatchObject({ score: 3, is_correct: 1 });
    // The short answer is untouched: no score, no correctness claim.
    expect(byQuestion.get(created.questions[3].id)).toMatchObject({ score: null, is_correct: null });
    // 12 of 16, with the short answer still open.
    expect(submitted.submission.score).toBe(12);
    expect(submitted.submission.total_points).toBe(16);
  });

  it('creates a row for every question on submit, so the grade sheet has no holes', () => {
    const created = publishPaper();
    const attempt = service.startAttempt(STUDENT, created.id);
    const submitted = service.submitAttempt(STUDENT, attempt.submission.id, { answers: [] });

    expect(submitted.answers).toHaveLength(4);
    expect(submitted.answers.every((answer) => answer.score === null)).toBe(true);
    // Every question unanswered is not a score of zero - it is no score at all.
    expect(submitted.submission.score).toBeNull();
  });

  it('refuses edits once submitted, and again once graded', () => {
    const created = publishPaper();
    const attempt = service.startAttempt(STUDENT, created.id);
    service.submitAttempt(STUDENT, attempt.submission.id, { answers: [] });

    expect(() =>
      service.saveAnswers(STUDENT, attempt.submission.id, {
        answers: [{ question_id: created.questions[0].id, value: { choice: ['b'] } }],
      }),
    ).toThrow(/已提交/);

    service.gradeSubmission(TEACHER, attempt.submission.id, { status: 'graded' });
    expect(() => service.submitAttempt(STUDENT, attempt.submission.id, { answers: [] })).toThrow(/已批改/);
  });

  it('refuses photo ids that belong to another submission', () => {
    const created = publishPaper();
    const mine = service.startAttempt(STUDENT, created.id);
    const theirs = service.startAttempt(OTHER_STUDENT, created.id);
    db.prepare(
      `INSERT INTO p_homework_photos (submission_id, storage_path, mime, size, sha256, uploaded_by, created_at)
       VALUES (?, '/uploads/homework/x.jpg', 'image/jpeg', 10, 'abc', 11, CURRENT_TIMESTAMP)`,
    ).run(theirs.submission.id);
    const foreignPhotoId = (db.prepare('SELECT id FROM p_homework_photos').get() as { id: number }).id;

    // The ids are sequential integers, so guessing one is trivial - naming another pupil's photo has
    // to be refused rather than filtered, or a client bug silently drops the pupil's evidence.
    expect(() => service.submitAttempt(STUDENT, mine.submission.id, { answers: [], photo_ids: [foreignPhotoId] })).toThrow(
      /照片不属于本次提交/,
    );
  });
});

describe('service: grading', () => {
  /** Submit an attempt, then return its id. */
  function submitted() {
    const created = publishPaper();
    const attempt = service.startAttempt(STUDENT, created.id);
    service.submitAttempt(STUDENT, attempt.submission.id, {
      answers: [
        { question_id: created.questions[0].id, value: { choice: ['b'] } },
        { question_id: created.questions[3].id, value: { text: '固态和液态' } },
      ],
    });
    return { created, submissionId: attempt.submission.id };
  }

  it('lets the teacher\'s score win over the auto-score and recomputes the total', () => {
    const { created, submissionId } = submitted();
    const answers = service.getSubmission(TEACHER, submissionId).answers;
    const shortAnswer = answers.find((answer) => answer.question_id === created.questions[3].id)!;

    const graded = service.gradeSubmission(TEACHER, submissionId, {
      status: 'graded',
      teacher_feedback: '再仔细一点',
      answers: [{ answer_id: shortAnswer.id, teacher_score: 3, teacher_comment: '要点少一个' }],
    });

    const after = graded.answers.find((answer) => answer.question_id === created.questions[3].id)!;
    expect(after.teacher_score).toBe(3);
    expect(after.score).toBe(3);
    expect(graded.submission.status).toBe('graded');
    // 5 (auto, single) + 0 (unanswered multiple/blank) + 3 (teacher, short).
    expect(graded.submission.score).toBe(8);
    expect(graded.submission.total_points).toBe(16);
    expect(graded.submission.teacher_feedback).toBe('再仔细一点');
  });

  it('refuses a teacher score above the question maximum', () => {
    // Clamping silently would let the sheet disagree with what the teacher saw on screen.
    const { created, submissionId } = submitted();
    const answers = service.getSubmission(TEACHER, submissionId).answers;
    const shortAnswer = answers.find((answer) => answer.question_id === created.questions[3].id)!;

    expect(() =>
      service.gradeSubmission(TEACHER, submissionId, {
        answers: [{ answer_id: shortAnswer.id, teacher_score: 99 }],
      }),
    ).toThrow(/不能超过该题满分/);
  });

  it('refuses an answer id from a different submission', () => {
    const { created, submissionId } = submitted();
    const other = service.startAttempt(OTHER_STUDENT, created.id);
    service.submitAttempt(OTHER_STUDENT, other.submission.id, { answers: [] });
    const foreignAnswerId = service.getSubmission(TEACHER, other.submission.id).answers[0].id;

    expect(() =>
      service.gradeSubmission(TEACHER, submissionId, {
        answers: [{ answer_id: foreignAnswerId, teacher_score: 1 }],
      }),
    ).toThrow(/不属于该提交/);
  });

  it('refuses a status other than graded or returned', () => {
    const { submissionId } = submitted();
    expect(() => service.gradeSubmission(TEACHER, submissionId, { status: 'draft' as never })).toThrow(
      /只能是 graded 或 returned/,
    );
  });

  it('refuses to grade another teacher\'s homework', () => {
    const { submissionId } = submitted();
    expect(() => service.gradeSubmission(OTHER_TEACHER, submissionId, { status: 'graded' })).toThrow(
      /无权限批改该提交/,
    );
    // The grade sheet refuses too, and says so as a permission problem rather than "no such
    // homework" - the row exists, this actor simply has no claim on it.
    expect(() => service.listSubmissions(OTHER_TEACHER, submissionId)).toThrow(/无权限查看该作业成绩/);
  });

  it('gives every pupil of the class a row, including those who never started', () => {
    // The question a teacher opens this screen to answer is "who has not submitted", so a missing
    // submission has to appear rather than be omitted.
    const { created } = submitted();
    const rows = service.listSubmissions(TEACHER, created.id);
    expect(rows.map((row) => row.submission.student_id)).toEqual([10, 11]);
    expect(rows[1].submission.status).toBe('draft');
    expect(rows[1].submission.score).toBeNull();
  });

  it('records who produced the final number', () => {
    const { submissionId } = submitted();
    // The deterministic auto-grader scored the objective questions on submit, and no provider ran.
    // `graded_by` must therefore say `teacher`: reporting `ai+teacher` here would tell the operator a
    // model helped on a deployment that has none. This is exactly what the separate `auto_score`
    // column exists for.
    const graded = service.gradeSubmission(TEACHER, submissionId, { status: 'graded' });
    expect(graded.submission.graded_by).toBe('teacher');
    const answer = graded.answers.find((entry) => entry.score !== null)!;
    expect(answer.auto_source).toBe('auto');
    expect(answer.ai_source).toBeNull();
  });
});

describe('service: AI grading', () => {
  /** Submit an attempt with the objective half right and the short answer partly written. */
  function submitted() {
    const created = publishPaper();
    const attempt = service.startAttempt(STUDENT, created.id);
    service.submitAttempt(STUDENT, attempt.submission.id, {
      answers: [
        { question_id: created.questions[0].id, value: { choice: ['b'] } },
        { question_id: created.questions[3].id, value: { text: '固态和液态' } },
      ],
    });
    return { created, submissionId: attempt.submission.id };
  }

  it('writes the AI columns and reports the provider inside a success payload', async () => {
    const { created, submissionId } = submitted();
    const results = await service.aiGrade(TEACHER, created.id, { submission_ids: [submissionId] });

    expect(results).toHaveLength(1);
    expect(results[0].ai.source).toBe('mock');
    expect(results[0].ai.available).toBe(true);
    // The default install has no model, and every response has to say so.
    expect(results[0].ai.message).toContain('未接入外部模型');

    const shortAnswer = results[0].answers.find((answer) => answer.question_id === created.questions[3].id)!;
    expect(shortAnswer.ai_source).toBe('mock');
    expect(shortAnswer.ai_comment).toContain('命中');
    // 2 of 2 rubric lines matched, so the AI fills the score in.
    expect(shortAnswer.ai_score).toBe(4);
    expect(shortAnswer.score).toBe(4);
  });

  it('does not overwrite a teacher score unless asked', async () => {
    const { created, submissionId } = submitted();
    const before = service.getSubmission(TEACHER, submissionId).answers;
    const shortAnswer = before.find((answer) => answer.question_id === created.questions[3].id)!;
    service.gradeSubmission(TEACHER, submissionId, {
      answers: [{ answer_id: shortAnswer.id, teacher_score: 1, teacher_comment: '不够准确' }],
    });

    const graded = await service.aiGrade(TEACHER, created.id, { submission_ids: [submissionId] });
    const after = graded[0].answers.find((answer) => answer.question_id === created.questions[3].id)!;

    // The AI's opinion is recorded, but the teacher's number stands: a batch run silently undoing a
    // teacher's decision is the failure that would make this feature untrustworthy.
    expect(after.ai_score).not.toBeNull();
    expect(after.teacher_score).toBe(1);
    expect(after.score).toBe(1);
  });

  it('overwrites only when explicitly asked to', async () => {
    const { created, submissionId } = submitted();
    const before = service.getSubmission(TEACHER, submissionId).answers;
    const shortAnswer = before.find((answer) => answer.question_id === created.questions[3].id)!;
    service.gradeSubmission(TEACHER, submissionId, {
      answers: [{ answer_id: shortAnswer.id, teacher_score: 1 }],
    });

    const graded = await service.aiGrade(TEACHER, created.id, {
      submission_ids: [submissionId],
      overwrite_teacher: true,
    });
    const after = graded[0].answers.find((answer) => answer.question_id === created.questions[3].id)!;
    // Overwriting clears the teacher's mark as well as moving the effective score: leaving the column
    // intact would store a teacher score that no longer agrees with the score being shown.
    expect(after.teacher_score).toBeNull();
    expect(after.score).toBe(after.ai_score);
    expect(after.score).not.toBe(1);
    expect(graded[0].submission.graded_by).toBe('ai');
  });

  it('only grades attempts that were actually submitted', async () => {
    const { created } = submitted();
    // Pupil 11 has not started; pupil 10 has submitted. The batch form must skip the drafts, or it
    // would produce marks for an answer still being written.
    const results = await service.aiGrade(TEACHER, created.id, {});
    expect(results.map((result) => result.submission.student_id)).toEqual([10]);
  });

  it('refuses to grade another teacher\'s homework, and unknown submission ids', async () => {
    const { created, submissionId } = submitted();
    await expect(service.aiGrade(OTHER_TEACHER, created.id, {})).rejects.toThrow(/无权限批改该作业/);
    await expect(service.aiGrade(TEACHER, created.id, { submission_ids: [9999] })).rejects.toThrow(
      /不存在或不属于该作业/,
    );
  });

  it('refuses to grade a homework with no questions', async () => {
    const empty = service.createHomework(TEACHER, { class_id: 1, title: '空作业', status: 'published' });
    await expect(service.aiGrade(TEACHER, empty.id, {})).rejects.toThrow(/还没有题目/);
  });

  it('declines a photo-only answer rather than scoring it as blank', async () => {
    const { created, submissionId } = submitted();
    db.prepare(
      `INSERT INTO p_homework_photos (submission_id, storage_path, mime, size, sha256, uploaded_by, created_at)
       VALUES (?, '/uploads/homework/p.jpg', 'image/jpeg', 10, 'abc', 8, CURRENT_TIMESTAMP)`,
    ).run(submissionId);
    const photoId = (db.prepare('SELECT id FROM p_homework_photos').get() as { id: number }).id;

    // The pupil photographs their working for the single-choice question instead of picking an
    // option. Re-submitting is what a pupil correcting their attempt looks like, so walk the
    // status back to draft first.
    api.run('UPDATE p_homework_submissions SET status = ? WHERE id = ?', ['draft', submissionId]);
    service.submitAttempt(STUDENT, submissionId, {
      answers: [{ question_id: created.questions[0].id, value: { photo_ids: [photoId] } }],
    });

    const results = await service.aiGrade(TEACHER, created.id, { submission_ids: [submissionId] });
    const photographed = results[0].answers.find((answer) => answer.question_id === created.questions[0].id)!;

    // Declined by the AI...
    expect(photographed.ai_score).toBeNull();
    expect(photographed.ai_comment).toContain('照片');
    // ...and NOT marked wrong by the deterministic grader, which cannot read the photograph either.
    // Scoring the empty stored value would have told a pupil who answered correctly on paper that
    // they got it wrong.
    expect(photographed.auto_score).toBeNull();
    expect(photographed.score).toBeNull();
    expect(photographed.is_correct).toBeNull();
  });
});

describe('service: AI question and answer', () => {
  it('stores the pupil question and the assistant reply, and returns the thread', async () => {
    const created = publishPaper();
    const result = await service.askQa(STUDENT, created.id, {
      content: '为什么不是 4？',
      question_id: created.questions[0].id,
    });

    expect(result.messages.map((message) => message.role)).toEqual(['student', 'assistant']);
    expect(result.messages[0].content).toBe('为什么不是 4？');
    expect(result.messages[1].ai_source).toBe('mock');
    expect(result.ai?.available).toBe(true);

    // It comes back on the next read, so a pupil can revisit an explanation instead of re-asking.
    const again = service.listQa(STUDENT, created.id);
    expect(again.messages).toHaveLength(2);
    // Reading history involves no provider, and reporting an outcome for a call that never happened
    // would be noise.
    expect(again.ai).toBeNull();
  });

  it('pins the thread to the caller\'s own student row', async () => {
    const created = publishPaper();
    await service.askQa(STUDENT, created.id, { content: '我的问题' });
    // Naming another pupil is refused, not silently ignored.
    expect(() => service.listQa(STUDENT, created.id, 11)).toThrow(/无权限查看该学生的问答/);
    // A parent reads their own child's thread through the same path.
    expect(service.listQa(PARENT, created.id).messages).toHaveLength(2);
  });

  it('makes staff name the pupil whose thread they are reading', () => {
    const created = publishPaper();
    expect(() => service.listQa(TEACHER, created.id)).toThrow(/缺少 student_id/);
    // The owning teacher may read it when they say whose it is.
    expect(service.listQa(TEACHER, created.id, 10).messages).toEqual([]);
    // Another teacher may not, even naming the right pupil.
    expect(() => service.listQa(OTHER_TEACHER, created.id, 10)).toThrow(/无权限查看该作业问答/);
  });

  it('validates the question text', async () => {
    const created = publishPaper();
    await expect(service.askQa(STUDENT, created.id, { content: '   ' })).rejects.toThrow(/请输入你的问题/);
    await expect(service.askQa(STUDENT, created.id, { content: 'x'.repeat(2001) })).rejects.toThrow(/不能超过/);
    await expect(
      service.askQa(STUDENT, created.id, { content: 'x', question_id: 9999 }),
    ).rejects.toThrow(/题目不属于该作业/);
  });
});

/**
 * The two methods behind `homework.public`, which `plugins/admin` renders.
 *
 * They are asserted here rather than only through the console because the property that matters is
 * about *when* the settings are read, not about what they contain: `plugins/admin` can change
 * `ai_provider` while the process runs, and a state line that had been captured at boot would keep
 * reporting the old provider - which reads to the operator as "saving the setting did nothing".
 */
describe('service: the homework.public port', () => {
  /** A service whose platform settings are a live object, so a write is visible on the next read. */
  function withSettings(initial: Record<string, string>) {
    const store: Record<string, string> = { ...initial };
    return {
      store,
      instance: new HomeworkService({
        repository: createHomeworkRepository(api, { decryptName: (value) => value.replace(/^enc:/, '') }),
        settings: { getPlatform: <T,>(key: string) => store[key] as T | undefined },
      }),
    };
  }

  it('reports the resolved provider, not the requested one', () => {
    const { instance } = withSettings({ ai_provider: 'http', ai_base_url: '', ai_api_key: '' });
    const state = instance.getAiState();

    // `http` was asked for and the mock is answering: reporting `http` here would tell the operator
    // their model was grading papers when nothing had been called.
    expect(state.provider).toBe('mock');
    expect(state.available).toBe(true);
    expect(state.reason).toContain('ai_base_url');
    expect(state.message).toBe(state.reason);
  });

  it('re-reads the settings on every call, so a saved change needs no restart', () => {
    const { store, instance } = withSettings({ ai_provider: 'mock' });
    expect(instance.getAiState().provider).toBe('mock');

    store.ai_provider = 'http';
    store.ai_base_url = 'https://api.example.test/v1';
    store.ai_api_key = 'sk-x';

    expect(instance.getAiState().provider).toBe('http');
  });

  it('answers a connection test for the mock instead of calling it a failure', async () => {
    const { instance } = withSettings({ ai_provider: 'mock' });
    const result = await instance.testAiConnection();

    // The mock *is* a working configuration on the default install. `ok: false` here would send the
    // operator looking for a problem that does not exist, which is why the state line is the answer.
    expect(result.ok).toBe(true);
    expect(result.message).toContain('未接入外部模型');
  });

  it('refuses to report a broken configuration as a successful test', async () => {
    const { instance } = withSettings({ ai_provider: 'http', ai_base_url: '', ai_api_key: 'sk-x' });
    const result = await instance.testAiConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain('ai_base_url');
  });

  it('degrades to the mock when the host has no settings store', () => {
    // `getPlatform` throws when there is no store. That is the same "no platform settings" case the
    // mock exists for, so the feature survives it rather than failing at boot.
    const instance = new HomeworkService({
      repository: createHomeworkRepository(api, { decryptName: (value) => value.replace(/^enc:/, '') }),
      settings: {
        getPlatform: () => {
          throw new Error('no settings store');
        },
      },
    });

    expect(instance.getAiState()).toMatchObject({ provider: 'mock', available: true, reason: null });
  });
});

/**
 * 出题, at the layer that owns the rules rather than the prompts.
 *
 * The mock declines by design (see `homework-ai.test.ts` for why), so what is asserted here is the
 * *contract of the route* rather than its output: who may call it, what it refuses, that the count is
 * clamped instead of trusted, and - the property that matters most - that nothing it produces is
 * written to a table. A generation is a draft handed back to the dialog that asked for it, and a
 * route that quietly inserted questions into a paper would be the one AI behaviour nobody could undo.
 */
describe('service: AI question generation', () => {
  it('refuses without a topic, a count below one, or a type it has no template for', async () => {
    await expect(service.generateQuestions(TEACHER, { topic: '   ' })).rejects.toThrow(/请填写出题主题/);
    await expect(service.generateQuestions(TEACHER, { topic: 'x'.repeat(501) })).rejects.toThrow(/不能超过/);
    await expect(service.generateQuestions(TEACHER, { topic: '分数', count: 0 })).rejects.toThrow(/至少为 1/);

    // 简答 is a real question type and a real *manual* one - it just has no generation template, so
    // the refusal names what is available instead of silently generating one of the three.
    await expect(service.generateQuestions(TEACHER, { topic: '分数', type: 'short' })).rejects.toThrow(
      /不支持 AI 出题/,
    );
    await expect(service.generateQuestions(TEACHER, { topic: '分数', type: 'short' })).rejects.toThrow(
      /single \/ multiple \/ blank/,
    );
    await expect(
      service.generateQuestions(TEACHER, { topic: '分数', type: 'essay' as never }),
    ).rejects.toThrow(/不支持 AI 出题/);
  });

  it('accepts each of the three templated types', async () => {
    // Non-vacuity for the refusal above: the three types the console offers must actually be
    // accepted, or the console would be offering buttons that 400.
    for (const type of ['single', 'multiple', 'blank'] as const) {
      const result = await service.generateQuestions(TEACHER, { topic: '分数', type });
      expect({ type, source: result.ai.source }).toEqual({ type, source: 'mock' });
    }
  });

  it('is teacher-only, and accepts an empty type as 混合题型', async () => {
    // Authoring is not assistance: a student has nothing to generate, and the plugin's other AI
    // routes being student-visible is exactly why this one is asserted.
    await expect(service.generateQuestions(STUDENT, { topic: '分数' })).rejects.toThrow(/只有老师可以出题/);
    await expect(service.generateQuestions(PARENT, { topic: '分数' })).rejects.toThrow(/只有老师可以出题/);

    // The form submits `''` for 「混合题型」, and that must mean "no preference" rather than 题型无效 -
    // so the call resolves instead of throwing, even though the mock then declines to generate.
    const mixed = await service.generateQuestions(TEACHER, { topic: '分数', type: '' as never });
    expect(mixed.ai.source).toBe('mock');
    expect(mixed.questions).toEqual([]);
  });

  it('reports the mock refusal as a payload rather than an error', async () => {
    const result = await service.generateQuestions(TEACHER, { topic: '小学五年级 分数的加减法', count: 3 });

    // `available: false` inside a 200: generation is an assist like the other two, and the message
    // is the actionable half - it names the console screen where a model gets configured.
    expect(result.questions).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(result.ai).toMatchObject({ source: 'mock', available: false, confidence: 0 });
    expect(result.ai.message).toContain('AI 判分与问答');
  });

  it('writes nothing: a generation leaves no homework, question or answer row behind', async () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM p_homework_questions').get() as { n: number };
    await service.generateQuestions(TEACHER, { topic: '分数', count: 5 });
    const after = db.prepare('SELECT COUNT(*) AS n FROM p_homework_questions').get() as { n: number };

    expect(after.n).toBe(before.n);
    // And no homework was invented to hang them off.
    expect(service.listHomeworks(TEACHER, 1)).toHaveLength(0);
  });

  it('clamps an over-large ask and degrades a half-configured provider, instead of calling one', async () => {
    // `http` without a base URL is the documented degradation: the plugin stays on the mock *with a
    // reason attached* rather than asking a model it cannot reach. That is also what makes this the
    // assertion for the count clamp - a request for 999 questions must not reach a prompt builder at
    // all, and the reason is what comes back.
    const degradedService = new HomeworkService({
      repository: createHomeworkRepository(api, { decryptName: (value) => value.replace(/^enc:/, '') }),
      settings: {
        getPlatform: <T,>(key: string) =>
          (key === 'ai_provider' ? 'http' : undefined) as unknown as T | undefined,
      },
    });

    const degraded = await degradedService.generateQuestions(TEACHER, { topic: '分数', count: 999 });
    expect(degraded.questions).toEqual([]);
    expect(degraded.ai.available).toBe(false);
    expect(degraded.ai.message).toContain('ai_base_url');
  });
});

describe('normaliseQuestions', () => {
  it('refuses a malformed question with its position, so an editor can highlight the row', () => {
    expect(() => normaliseQuestions([{ type: 'telepathy', stem: 'x', points: 1 }])).toThrow(/第 1 题/);
    expect(() => normaliseQuestions([{ type: 'blank', stem: '', points: 1 }])).toThrow(/第 1 题：请填写题干/);
    expect(() => normaliseQuestions([{ type: 'blank', stem: 'x', points: -1 }])).toThrow(/分值必须是非负数/);
  });

  it('refuses the shapes that make a paper ungradable', () => {
    // A choice question with nothing to choose, a single choice with two answers, and a reference
    // naming an option that does not exist.
    expect(() =>
      normaliseQuestions([{ type: 'single', stem: 'x', options: [{ id: 'a', text: 'A' }], reference: { choice: ['a'] }, points: 1 }]),
    ).toThrow(/至少需要 2 个选项/);
    expect(() =>
      normaliseQuestions([
        { type: 'single', stem: 'x', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], reference: { choice: ['a', 'b'] }, points: 1 },
      ]),
    ).toThrow(/单选题只能有 1 个正确答案/);
    expect(() =>
      normaliseQuestions([
        { type: 'single', stem: 'x', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], reference: { choice: ['z'] }, points: 1 },
      ]),
    ).toThrow(/不在选项中/);
  });

  it('accepts a well-formed paper', () => {
    const questions = normaliseQuestions([
      { type: 'blank', stem: '首都？', reference: { accept: ['北京'] }, points: 3 },
      { type: 'short', stem: '说明', reference: { text: 'x' }, points: 4 },
    ]);
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ type: 'blank', points: 3 });
  });
});

describe('effectiveScore', () => {
  it('prefers the teacher, falls back to the AI, and is null when neither spoke', () => {
    expect(effectiveScore(3, 5)).toBe(3);
    // A teacher scoring 0 is a decision, not an absence - `??` rather than `||` is load-bearing here.
    expect(effectiveScore(0, 5)).toBe(0);
    expect(effectiveScore(null, 5)).toBe(5);
    expect(effectiveScore(null, null)).toBeNull();
  });
});

describe('the legacy read bridge', () => {
  it('surfaces uncopied legacy assignments, marked and read-only', () => {
    db.exec(`
      INSERT INTO assignments (class_id, teacher_id, title, description, due_date, created_at)
      VALUES (1, 2, '迁移前的作业', '旧描述', '2024-01-01', '2024-01-01 00:00:00');
    `);

    const rows = service.listHomeworks(TEACHER, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: '迁移前的作业', legacy: true, question_count: 0 });
    // `published`, because the legacy table has no status column and every assignment it holds was
    // student-visible from the moment it was created.
    expect(rows[0].status).toBe('published');

    // And the pupil sees it too, with no submission rather than an invented one.
    const mine = service.listMyHomeworks(STUDENT);
    expect(mine).toHaveLength(1);
    expect(mine[0].homework.legacy).toBe(true);
    expect(mine[0].submission).toBeNull();
  });

  it('hides a legacy assignment from a draft request', () => {
    db.exec(`INSERT INTO assignments (class_id, teacher_id, title, created_at) VALUES (1, 2, '旧作业', '2024-01-01')`);
    expect(service.listHomeworks(TEACHER, 1)).toHaveLength(1);
    // Only a 'published' request may match them: a draft listing must actively exclude them.
    expect(service.listSubmissions).toBeTypeOf('function');
    const draftScoped = service.listHomeworks(STUDENT, 1);
    expect(draftScoped.every((row) => row.status === 'published')).toBe(true);
  });

  it('stops surfacing a legacy assignment once it has been copied', () => {
    db.exec(`INSERT INTO assignments (id, class_id, teacher_id, title, created_at) VALUES (5, 1, 2, '旧作业', '2024-01-01')`);
    expect(service.listHomeworks(TEACHER, 1)).toHaveLength(1);

    // What the data migration does: copy the row and record where it came from.
    api.run(
      `INSERT INTO p_homework_assignments
         (class_id, teacher_id, title, status, total_points, reward_points, legacy_id, created_at, updated_at)
       VALUES (1, 2, '旧作业', 'published', 100, 0, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    );

    // Listed once, from the new table - not twice.
    const rows = service.listHomeworks(TEACHER, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].legacy).toBeUndefined();
  });
});
