/**
 * ai-study repository - the three tables this plugin owns, and nothing else.
 *
 * Every statement names a `p_ai_study_*` table, so the ownership check in `ctx.db` has nothing to
 * permit outside them; every learning-owned fact (the candidate pool, the wrong-question book, the
 * knowledge graph) arrives through `learning.public` instead, and every classroom-owned fact through
 * `classroom.public`. That is why `plugin.json` declares `adopted` and `reads` empty, and why a
 * direct query against `questions` here would fail loudly rather than quietly work.
 *
 * ## Timestamps
 *
 * ISO strings, written by this file. These tables are created by this plugin's own migration rather
 * than the application's Prisma-managed schema, so there is no projection to reproduce - but the
 * format matches what the rest of the API answers with anyway, because two date formats in one
 * codebase is a bug waiting to happen.
 *
 * ## Transactions
 *
 * `finishSet` writes the verdict of every item and closes the set, and it must be one transaction:
 * a half-submitted set would leave answers marked with no record of the set being done, or a closed
 * set with unjudged items. The mastery *writes* are not in it, and cannot be - they belong to the
 * learning plugin, which is the whole point of the port; a failure part-way leaves the set open and
 * the student able to submit again, with the items already written being idempotent updates.
 */

import type { DbApi, SqlParam } from '@thinkclass/plugin-sdk';

import type { StudyAnswerRow, StudyItemRow, StudySetBundle, StudySetRow } from './ai-study.types.js';

export interface NewItem {
  questionId: number;
  orderNo: number;
  reason: string;
  score: number;
  factors: Record<string, number>;
  aiRanked: boolean;
}

export interface NewSet {
  studentId: number;
  classId: number | null;
  subjectId: number | null;
  source: string;
  createdBy: number | null;
  engineVersion: number;
  aiSource: string;
  aiAvailable: boolean;
  aiMessage: string;
  items: NewItem[];
}

export interface AiStudyRepository {
  findOpenSet(studentId: number): StudySetRow | null;
  getSet(setId: number): StudySetRow | null;
  loadBundle(setId: number): StudySetBundle | null;
  createSet(input: NewSet): StudySetRow;
  getItemForSet(itemId: number, setId: number): StudyItemRow | null;
  upsertAnswer(input: {
    setId: number;
    itemId: number;
    answerJson: string | null;
    spentSec: number;
  }): StudyAnswerRow;
  recordVerdict(itemId: number, isCorrect: boolean | null, masteryScore: number | null): void;
  closeSet(setId: number): void;
  listAnswersForSet(setId: number): StudyAnswerRow[];
  listOpenSetIdsForStudents(studentIds: number[]): Map<number, number>;
  transaction<T>(fn: () => T): T;
}

/** ISO, because these tables are this plugin's own. */
function now(): string {
  return new Date().toISOString();
}

export function parseFactors(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const factors: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) factors[key] = numeric;
    }
    return factors;
  } catch {
    // A malformed breakdown must not take a set down with it: the score and the reason are the
    // student-visible part, and the factors are the explanation of them.
    return {};
  }
}

export function createAiStudyRepository(db: DbApi): AiStudyRepository {
  const readSet = (row: unknown): StudySetRow | null =>
    row ? ({ ...(row as StudySetRow) } as StudySetRow) : null;

  const readItem = (row: unknown): StudyItemRow | null =>
    row ? ({ ...(row as StudyItemRow) } as StudyItemRow) : null;

  const readAnswer = (row: unknown): StudyAnswerRow | null =>
    row ? ({ ...(row as StudyAnswerRow) } as StudyAnswerRow) : null;

  const repository: AiStudyRepository = {
    /**
     * The student's open set, if any.
     *
     * Backed by the partial unique index the migration creates, so "at most one" is a fact the
     * database enforces rather than a convention this method hopes for. `ORDER BY id DESC LIMIT 1`
     * is defence for a database migrated from a version without that index.
     */
    findOpenSet(studentId) {
      return readSet(
        db.get('SELECT * FROM p_ai_study_sets WHERE student_id = ? AND status = ? ORDER BY id DESC LIMIT 1', [
          studentId,
          'open',
        ]),
      );
    },

    getSet(setId) {
      return readSet(db.get('SELECT * FROM p_ai_study_sets WHERE id = ?', [setId]));
    },

    loadBundle(setId) {
      const set = repository.getSet(setId);
      if (!set) return null;
      return {
        set,
        items: db
          .query<StudyItemRow>('SELECT * FROM p_ai_study_items WHERE set_id = ? ORDER BY order_no ASC, id ASC', [
            setId,
          ])
          .map((row) => ({ ...row })),
        answers: repository.listAnswersForSet(setId),
      };
    },

    /**
     * Write a generated set and its items.
     *
     * One transaction, because a set with no items is a student staring at an empty practice page
     * that the next generate would refuse to replace (they have an open set already). Either the
     * whole set lands or none of it does.
     */
    createSet(input) {
      return repository.transaction(() => {
        const stamp = now();
        const info = db.run(
          `INSERT INTO p_ai_study_sets
             (student_id, class_id, subject_id, source, created_by, status, engine_version,
              ai_source, ai_available, ai_message, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
          [
            input.studentId,
            input.classId,
            input.subjectId,
            input.source,
            input.createdBy,
            input.engineVersion,
            input.aiSource,
            input.aiAvailable ? 1 : 0,
            input.aiMessage,
            stamp,
            stamp,
          ],
        );
        const setId = Number(info.lastInsertRowid);

        input.items.forEach((item, index) => {
          db.run(
            `INSERT INTO p_ai_study_items
               (set_id, question_id, order_no, reason, score, factors_json, ai_ranked, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              setId,
              item.questionId,
              item.orderNo || index + 1,
              item.reason,
              item.score,
              JSON.stringify(item.factors ?? {}),
              item.aiRanked ? 1 : 0,
              stamp,
            ],
          );
        });

        return repository.getSet(setId) as StudySetRow;
      });
    },

    getItemForSet(itemId, setId) {
      return readItem(db.get('SELECT * FROM p_ai_study_items WHERE id = ? AND set_id = ?', [itemId, setId]));
    },

    /**
     * Create or replace the answer for one item.
     *
     * `UNIQUE (item_id)` plus `ON CONFLICT` is what makes a re-save (the student edits an answer, or
     * clicks twice) an update rather than a second row - which is what stops the submit path from
     * judging the same item twice and moving mastery twice for one answer.
     */
    upsertAnswer(input) {
      const stamp = now();
      db.run(
        `INSERT INTO p_ai_study_answers (set_id, item_id, answer_json, spent_sec, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET
           answer_json = excluded.answer_json,
           spent_sec   = excluded.spent_sec,
           updated_at  = excluded.updated_at`,
        [input.setId, input.itemId, input.answerJson, input.spentSec, stamp, stamp],
      );
      return readAnswer(
        db.get('SELECT * FROM p_ai_study_answers WHERE item_id = ?', [input.itemId]),
      ) as StudyAnswerRow;
    },

    /**
     * Record what the question's owner decided about one answer.
     *
     * A separate statement from `upsertAnswer` because the two claims come from different places and
     * a re-save must not be able to clear a verdict that was already reached. `is_correct` NULL is
     * written deliberately when the owner declined to judge - it is the difference between "not
     * judged" and "judged wrong".
     */
    recordVerdict(itemId, isCorrect, masteryScore) {
      db.run(
        'UPDATE p_ai_study_answers SET is_correct = ?, mastery_score = ?, judged_at = ?, updated_at = ? WHERE item_id = ?',
        [isCorrect === null ? null : isCorrect ? 1 : 0, masteryScore, now(), now(), itemId],
      );
    },

    closeSet(setId) {
      db.run('UPDATE p_ai_study_sets SET status = ?, updated_at = ? WHERE id = ?', ['done', now(), setId]);
    },

    listAnswersForSet(setId) {
      return db
        .query<StudyAnswerRow>('SELECT * FROM p_ai_study_answers WHERE set_id = ? ORDER BY item_id ASC', [setId])
        .map((row) => ({ ...row }));
    },

    /**
     * Which of these students already have an open set, in one query.
     *
     * The class board needs this for every student it lists; asking per student is the N+1 that made
     * the board slow on exactly the classes that use it most.
     */
    listOpenSetIdsForStudents(studentIds) {
      const open = new Map<number, number>();
      if (studentIds.length === 0) return open;

      const placeholders = studentIds.map(() => '?').join(', ');
      const rows = db.query<{ id: number; student_id: number }>(
        `SELECT id, student_id FROM p_ai_study_sets
          WHERE status = 'open' AND student_id IN (${placeholders})
          ORDER BY id ASC`,
        studentIds as SqlParam[],
      );
      for (const row of rows) {
        // Ascending id, so the first wins and a database that somehow holds two answers a stable,
        // explainable one rather than the last row the engine happened to return.
        if (!open.has(row.student_id)) open.set(row.student_id, row.id);
      }
      return open;
    },

    transaction(fn) {
      return db.tx(fn);
    },
  };

  return repository;
}
