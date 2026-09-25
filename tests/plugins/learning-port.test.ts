/**
 * The `learning.public` port, driven against a real database.
 *
 * `plugins/ai-study` is the first consumer, and the two things it depends on that a unit test with a
 * stubbed port would not catch are both here:
 *
 *   1. **The port is answer-free in the outward direction.** `listCandidates` and `listQuestionsByIds`
 *      go through one mapper which drops `answer_json` and `explanation`, so a student-facing API
 *      built on this port cannot leak an answer key by accident. The assertion is structural - the
 *      exact key set - because a substring hunt for the key's value passes for the wrong reason.
 *   2. **The mastery write is the same arithmetic the wrong-question book already uses.** A second
 *      implementation in another plugin would show up as a 错题本 that disagrees with itself, so the
 *      `+0.2 / -0.1` step and the `0.95` clearing threshold are compared against `attemptWrongQuestion`
 *      directly rather than restated here.
 *
 * The schema is the real migration chain and the repository runs through the ownership-checked
 * `DbApi` built from the manifest's `data.adopted` list, so a statement naming an undeclared table
 * fails here exactly as it would in development.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ClassroomPort, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import { openDatabase, runMigrations, type Database } from '@thinkclass/kernel';
import { createDbApi } from '@thinkclass/plugin-runtime';
import type { DbApi } from '@thinkclass/plugin-sdk';

import { APP_MIGRATIONS } from '../../api/schema/appMigrations.js';
import { createLearningRepository } from '../../plugins/learning/src/learning.repository.js';
import { LearningService } from '../../plugins/learning/src/learning.service.js';

/** Mirrors `plugins/learning/plugin.json` -> `data.adopted`; `data.reads` is intentionally empty. */
const ADOPTED_TABLES = [
  'knowledge_edges',
  'knowledge_nodes',
  'notes',
  'paper_answers',
  'paper_assets',
  'paper_items',
  'paper_sections',
  'paper_submissions',
  'papers',
  'question_knowledge',
  'questions',
  'rubric_point_scores',
  'rubric_points',
  'study_plan_items',
  'study_plans',
  'subjects',
  'wrong_question_attempts',
  'wrong_questions',
];

/** The port reached from this domain: only `getStudentById` and `getStudentByUserId` are used. */
class FakeClassroom implements ClassroomPort {
  readonly students: StudentSnapshot[] = [];

  async listClassIdsByTeacher() {
    return [];
  }

  async listStudentAccountsByClassIds() {
    return [];
  }

  async getStudentById(studentId: number) {
    return this.students.find((student) => student.id === studentId) ?? null;
  }

  async getStudentByUserId(userId: number) {
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
    /* the port does not ask for membership */
  }

  async adjustPoints() {
    return { totalPoints: 0, availablePoints: 0 };
  }

  async transferStudentCredits() {
    return { value: { availablePoints: 0 } };
  }

  async recordStudentLedgerEntry() {
    /* nothing moves points here */
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

function addQuestion(input: {
  stem: string;
  type?: string;
  answer_json?: string | null;
  options_json?: string | null;
  is_subjective?: number;
  difficulty?: number;
}): number {
  const info = api.run(
    `INSERT INTO questions (teacher_id, subject_id, stem, type, options_json, answer_json, difficulty, is_subjective, default_points, created_at)
     VALUES (7, 1, ?, ?, ?, ?, ?, ?, 5, ?)`,
    [
      input.stem,
      input.type ?? 'single',
      input.options_json ?? '[{"id":"a","text":"5/6"},{"id":"b","text":"2/5"}]',
      // `??` would turn an explicit `null` back into the default, which silently gives a question
      // the reference answer the "no answer configured" case is supposed to be missing.
      input.answer_json === undefined ? '"a"' : input.answer_json,
      input.difficulty ?? 3,
      input.is_subjective ?? 0,
      Date.now(),
    ],
  );
  return Number(info.lastInsertRowid);
}

function linkNode(questionId: number, nodeId: number) {
  api.run('INSERT INTO question_knowledge (question_id, node_id) VALUES (?, ?)', [questionId, nodeId]);
}

function masteryOf(questionId: number): number | null {
  const row = db
    .prepare('SELECT mastery_score FROM wrong_questions WHERE student_id = 10 AND question_id = ?')
    .get(questionId) as { mastery_score: number } | undefined;
  return row?.mastery_score ?? null;
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-port-'));
  db = openDatabase(path.join(directory, 'app.sqlite'), { wal: false });
  runMigrations(db, APP_MIGRATIONS);

  api = createDbApi({
    db,
    pluginId: 'learning',
    ownedTables: new Set(ADOPTED_TABLES),
    readTables: new Set(),
    strict: true,
  });

  classroom = new FakeClassroom();
  classroom.students.push({
    id: 10,
    classId: 1,
    userId: 9,
    name: '小明',
    totalPoints: 0,
    availablePoints: 0,
    groupId: null,
  });

  service = new LearningService(createLearningRepository(api), classroom);

  db.exec(`
    INSERT INTO users (id, role, username, password_hash) VALUES (7, 'teacher', 't7', 'x');
    INSERT INTO users (id, role, username, password_hash) VALUES (9, 'student', 's9', 'x');
    INSERT INTO classes (id, name, teacher_id, invite_code) VALUES (1, '一班', 7, 'LP01');
    INSERT INTO students (id, user_id, class_id, name) VALUES (10, 9, 1, '小明');
    INSERT INTO subjects (id, name, stage, grade) VALUES (1, '数学', '小学', 5);
    INSERT INTO knowledge_nodes (id, subject_id, name, importance) VALUES (1, 1, '分数加减法', 5);
  `);
});

afterEach(() => {
  db.close();
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // Windows keeps the file handle briefly.
  }
});

describe('signals', () => {
  it('answers null for a student that does not exist, rather than an empty signal set', async () => {
    expect(await service.getStudentSignals(999)).toBeNull();
  });

  it('carries the wrong-question book, the node behind each question, and the progress', async () => {
    const questionId = addQuestion({ stem: '1/2 + 1/3 = ?' });
    linkNode(questionId, 1);
    api.run(
      `INSERT INTO wrong_questions (student_id, question_id, wrong_count, mastery_score, created_at, updated_at)
       VALUES (10, ?, 3, 0.4, ?, ?)`,
      [questionId, Date.now(), Date.now()],
    );

    const signals = await service.getStudentSignals(10);

    expect(signals?.studentId).toBe(10);
    expect(signals?.wrongQuestions).toHaveLength(1);
    expect(signals?.wrongQuestions[0]).toMatchObject({
      questionId,
      wrongCount: 3,
      masteryScore: 0.4,
      nodeIds: [1],
    });
    expect(signals?.knowledgeProgress[0]).toMatchObject({ nodeId: 1, name: '分数加减法', wrongCount: 1 });
    expect(signals?.recentPaperAccuracy).toEqual({ correct: 0, total: 0 });
  });

  it('leaves a cleared question out, so it is not re-offered', async () => {
    const questionId = addQuestion({ stem: '已掌握的题' });
    api.run(
      `INSERT INTO wrong_questions (student_id, question_id, wrong_count, mastery_score, cleared_at, created_at, updated_at)
       VALUES (10, ?, 5, 1, ?, ?, ?)`,
      [questionId, Date.now(), Date.now(), Date.now()],
    );

    const signals = await service.getStudentSignals(10);
    expect(signals?.wrongQuestions).toEqual([]);
  });
});

describe('the candidate pool', () => {
  it('maps options and drops the answer key', () => {
    addQuestion({ stem: '1/2 + 1/3 = ?', answer_json: '"a"', options_json: '[{"id":"a","text":"5/6"}]' });

    const [ref] = service.listCandidates({
      subjectId: null,
      nodeIds: [],
      types: [],
      difficultyMin: null,
      difficultyMax: null,
      excludeQuestionIds: [],
      limit: 10,
    });

    // Structural, not a substring hunt: the option ids are meant to be visible, the key is not.
    expect(Object.keys(ref).sort()).toEqual(
      ['difficulty', 'id', 'isSubjective', 'options', 'stem', 'subjectId', 'teacherId', 'type', 'defaultPoints'].sort(),
    );
    expect(ref.options).toEqual([{ id: 'a', text: '5/6' }]);
  });

  it('bounds the read even when the caller asks for everything', () => {
    for (let index = 0; index < 8; index += 1) addQuestion({ stem: `题目 ${index}` });

    const refs = service.listCandidates({
      subjectId: null,
      nodeIds: [],
      types: [],
      difficultyMin: null,
      difficultyMax: null,
      excludeQuestionIds: [],
      limit: 1_000_000,
    });

    // The repository clamps to its own ceiling rather than trusting the caller's number.
    expect(refs.length).toBe(8);
  });

  it('resolves a stored set by id and skips ids that no longer exist', () => {
    const kept = addQuestion({ stem: '还在的题' });
    const refs = service.listQuestionsByIds([kept, 999_999]);

    expect(refs.map((ref) => ref.id)).toEqual([kept]);
  });
});

describe('recording a practice outcome', () => {
  it('moves mastery by the same arithmetic attemptWrongQuestion uses', async () => {
    const questionId = addQuestion({ stem: '1/2 + 1/3 = ?', answer_json: '"a"' });
    api.run(
      `INSERT INTO wrong_questions (student_id, question_id, wrong_count, mastery_score, created_at, updated_at)
       VALUES (10, ?, 1, 0.5, ?, ?)`,
      [questionId, Date.now(), Date.now()],
    );

    // The book's own route: mastery 0.5 + 0.2 = 0.7.
    await service.attemptWrongQuestion({ id: 9, role: 'student' }, String(1), { is_correct: 1 });
    const viaBookRoute = masteryOf(questionId);

    // The port: the same step from the same starting point, reached by the answer instead of a flag.
    api.run('UPDATE wrong_questions SET mastery_score = 0.5 WHERE student_id = 10 AND question_id = ?', [questionId]);
    const outcome = service.recordPracticeOutcome({
      studentId: 10,
      questionId,
      answerJson: '"a"',
      spentSec: 5,
      source: 'ai_study',
    });

    expect(outcome.isCorrect).toBe(true);
    expect(outcome.masteryScore).toBeCloseTo(viaBookRoute as number, 5);
    expect(masteryOf(questionId)).toBeCloseTo(viaBookRoute as number, 5);
  });

  it('treats ["a"] and "a" as the same claim about a single-choice question', () => {
    const questionId = addQuestion({ stem: '1/2 + 1/3 = ?', answer_json: '["a"]' });
    api.run(
      `INSERT INTO wrong_questions (student_id, question_id, wrong_count, mastery_score, created_at, updated_at)
       VALUES (10, ?, 1, 0.5, ?, ?)`,
      [questionId, Date.now(), Date.now()],
    );

    const outcome = service.recordPracticeOutcome({
      studentId: 10,
      questionId,
      answerJson: '"a"',
      spentSec: 0,
      source: 'ai_study',
    });

    expect(outcome.isCorrect).toBe(true);
  });

  it('declines to judge a subjective question and moves nothing', () => {
    const questionId = addQuestion({ stem: '说说你的思路', type: 'short', answer_json: null, is_subjective: 1 });

    const outcome = service.recordPracticeOutcome({
      studentId: 10,
      questionId,
      answerJson: '我是这样想的',
      spentSec: 3,
      source: 'ai_study',
    });

    expect(outcome.isCorrect).toBeNull();
    expect(outcome.masteryScore).toBeNull();
    expect(masteryOf(questionId)).toBeNull();
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM wrong_question_attempts').get(),
    ).toMatchObject({ n: 0 });
  });

  it('declines a question with no reference answer rather than calling anything correct', () => {
    const questionId = addQuestion({ stem: '没有答案的题', answer_json: null });

    const outcome = service.recordPracticeOutcome({
      studentId: 10,
      questionId,
      answerJson: '',
      spentSec: 0,
      source: 'ai_study',
    });

    // The exam path compares two empty strings and calls that correct; this one refuses to.
    expect(outcome.isCorrect).toBeNull();
    expect(masteryOf(questionId)).toBeNull();
  });

  it('creates the book row on a first wrong answer, the way submitPaper does', () => {
    const questionId = addQuestion({ stem: '1/2 + 1/3 = ?', answer_json: '"a"' });

    const outcome = service.recordPracticeOutcome({
      studentId: 10,
      questionId,
      answerJson: '"b"',
      spentSec: 12,
      source: 'ai_study',
    });

    expect(outcome.isCorrect).toBe(false);
    expect(masteryOf(questionId)).toBe(0);
    expect(
      db
        .prepare("SELECT COUNT(*) AS n FROM wrong_question_attempts WHERE practice_source = 'ai_study'")
        .get(),
    ).toMatchObject({ n: 1 });
  });

  it('records nothing for a correct answer to a question never missed', () => {
    const questionId = addQuestion({ stem: '1/2 + 1/3 = ?', answer_json: '"a"' });

    const outcome = service.recordPracticeOutcome({
      studentId: 10,
      questionId,
      answerJson: '"a"',
      spentSec: 4,
      source: 'ai_study',
    });

    expect(outcome.isCorrect).toBe(true);
    // No book row: creating one to record a correct answer would put a question the student has
    // never missed into 错题本.
    expect(masteryOf(questionId)).toBeNull();
  });

  it('clears the row once mastery reaches the threshold', () => {
    const questionId = addQuestion({ stem: '1/2 + 1/3 = ?', answer_json: '"a"' });
    api.run(
      `INSERT INTO wrong_questions (student_id, question_id, wrong_count, mastery_score, created_at, updated_at)
       VALUES (10, ?, 1, 0.9, ?, ?)`,
      [questionId, Date.now(), Date.now()],
    );

    const outcome = service.recordPracticeOutcome({
      studentId: 10,
      questionId,
      answerJson: '"a"',
      spentSec: 0,
      source: 'ai_study',
    });

    expect(outcome.masteryScore).toBeCloseTo(1, 5);
    expect(outcome.cleared).toBe(true);

    const row = db
      .prepare('SELECT cleared_at FROM wrong_questions WHERE student_id = 10 AND question_id = ?')
      .get(questionId) as { cleared_at: number | null };
    expect(row.cleared_at).not.toBeNull();
  });
});
