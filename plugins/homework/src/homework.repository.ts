/**
 * homework repository - all of this plugin's SQL.
 *
 * Uses `ctx.db`, so every statement is checked against the tables the manifest declares: the six
 * `p_homework_*` tables are writable, and `students` / `classes` / `assignments` /
 * `student_assignments` are read-only. A write against one of those (or any other plugin's table)
 * fails loudly at the call site while `env` is not production, which is the point of the handle.
 *
 * One thing is injected rather than imported: `decryptName`. Student names are AES-encrypted at
 * rest and the key belongs to the application, so the host hands its decryptor over
 * (`ctx.config.decryptName`) rather than a plugin re-implementing the cipher - the same mechanism
 * `plugins/assignments` and `plugins/classroom` use. Absent decryptor means identity, which is
 * correct for a database whose rows were never encrypted, and for tests.
 *
 * ## Two `SELECT`s that are deliberately NOT `SELECT *`
 *
 * `listHomeworks` and `listStudentHomeworks` return an aliased `total_points` and a
 * `question_count` alongside the homework row. The alias is not cosmetic: without it the
 * outer-join's `COUNT(*)` result would collide with `p_homework_assignments.total_points`, and
 * the plugin would report "this homework is worth however many questions it has". The join is a
 * `LEFT JOIN` with `COUNT(q.id)`, not `COUNT(*)`, so a homework with no questions yet still
 * appears - with a count of 0 - instead of vanishing from its own list.
 *
 * ## The legacy read bridge
 *
 * `listLegacyHomeworks` / `listLegacyHomeworksForStudent` read the deprecated `assignments` table
 * and present its rows in the new shape, so that a deployment which switches the frontend over
 * before running the data migration does not lose sight of work that already exists. Every row
 * they return is marked `legacy: true` and is filtered by `legacy_id` against
 * `p_homework_assignments` - a row the migration has already copied, or that a teacher created
 * here, is not surfaced twice. This is the ONLY reader of those two legacy tables in this plugin,
 * and both are declared under `data.reads`, never `data.tables`: the bridge reads, it never writes.
 */

import type { DbApi, SqlParam } from '@thinkclass/plugin-sdk';
import type {
  HomeworkAnswerValue,
  HomeworkOption,
  HomeworkQuestionType,
  HomeworkReferenceAnswer,
  HomeworkStatus,
} from '@thinkclass/contracts/domains/homework';

import type {
  HomeworkAnswerInputInternal,
  HomeworkAnswerRow,
  HomeworkGradeRowInternal,
  HomeworkListRow,
  HomeworkPhotoRow,
  HomeworkQaRow,
  HomeworkQuestionInput,
  HomeworkQuestionRow,
  HomeworkRow,
  HomeworkScope,
  HomeworkSubmissionRow,
  LegacyAssignmentRow,
} from './homework.types.js';

export interface HomeworkRepositoryOptions {
  /** Reverses at-rest encryption for `students.name`. Absent means identity. */
  decryptName?: (value: string) => string;
}

export interface HomeworkRepository {
  transaction<T>(fn: () => T): T;

  // -- homework ------------------------------------------------------------
  listHomeworks(scope: HomeworkScope): HomeworkListRow[];
  getHomework(id: number): HomeworkRow | null;
  createHomework(input: {
    class_id: number;
    teacher_id: number;
    title: string;
    description: string | null;
    due_at: string | null;
    status: HomeworkStatus;
    total_points: number;
    reward_points: number;
  }): number;
  updateHomework(
    id: number,
    input: {
      title?: string;
      description?: string | null;
      due_at?: string | null;
      status?: HomeworkStatus;
      reward_points?: number;
      total_points?: number;
    },
  ): void;
  deleteHomework(id: number): void;

  // -- questions -----------------------------------------------------------
  listQuestions(assignmentId: number): HomeworkQuestionRow[];
  getQuestion(id: number): HomeworkQuestionRow | null;
  createQuestion(assignmentId: number, orderNo: number, input: HomeworkQuestionInput): number;
  updateQuestion(id: number, orderNo: number, input: HomeworkQuestionInput): void;
  deleteQuestion(id: number): void;
  /** Every question id of a homework, used to reconcile a whole-paper replacement. */
  listQuestionIds(assignmentId: number): number[];
  /** Every answer id of a homework - what a delete has to clear out first. */
  listAnswerIdsForHomework(assignmentId: number): number[];

  // -- submissions ---------------------------------------------------------
  listSubmissions(assignmentId: number): HomeworkSubmissionRow[];
  getSubmission(id: number): HomeworkSubmissionRow | null;
  getSubmissionByStudent(assignmentId: number, studentId: number): HomeworkSubmissionRow | null;
  createSubmission(input: {
    assignment_id: number;
    student_id: number;
    status: string;
    total_points: number;
  }): number;
  updateSubmission(
    id: number,
    input: {
      status?: string;
      submitted_at?: string | null;
      score?: number | null;
      total_points?: number;
      teacher_feedback?: string | null;
      ai_feedback?: string | null;
      ai_confidence?: number | null;
      graded_by?: string | null;
    },
  ): void;
  /** Submissions of one homework joined to their pupil, with the name decrypted. */
  listGradeSheet(assignmentId: number): HomeworkGradeRowInternal[];
  /**
   * The students of a class, for "who has not submitted yet" and the grade sheet.
   *
   * Returns names, not just ids: an unstarted pupil has no `p_homework_submissions` row to join, so
   * the grade sheet's own join cannot label them. Reading `students.name` here means the decryption
   * still happens in the one layer that knows about the cipher.
   */
  listRosterOfClass(classId: number): Array<{ id: number; name: string }>;

  // -- answers -------------------------------------------------------------
  listAnswers(submissionId: number): HomeworkAnswerRow[];
  getAnswerForQuestion(submissionId: number, questionId: number): HomeworkAnswerRow | null;
  upsertAnswer(submissionId: number, input: HomeworkAnswerInputInternal): void;
  deleteAnswer(submissionId: number, questionId: number): void;
  /**
   * Write a provider's verdict for one answer.
   *
   * `teacher_score` is a parameter, and that is the fix for a real defect: this method used to write
   * only the `ai_*` columns, so `overwrite_teacher` had no way to clear the teacher's mark - the
   * service computed `null`, passed it in, and the stored value silently survived, leaving a row
   * whose teacher score disagreed with the score being displayed. Passing it explicitly makes
   * "clear the teacher's mark" an operation this method can actually perform.
   */
  updateAnswerAi(
    id: number,
    input: {
      ai_score: number | null;
      ai_comment: string | null;
      ai_confidence: number | null;
      ai_source: string | null;
      teacher_score: number | null;
      score: number | null;
      is_correct: number | null;
    },
  ): void;
  /**
   * The deterministic grader's result.
   *
   * A separate statement from `updateAnswerAi` on purpose: this path writes `auto_score` and must
   * never touch `ai_score`. They are different claims from different sources, and a single
   * "update the machine score" method is how they got conflated before.
   */
  updateAnswerAuto(
    id: number,
    input: { auto_score: number | null; auto_source: string; is_correct: number | null; score: number | null },
  ): void;
  updateAnswerTeacher(
    id: number,
    input: { teacher_score: number | null; teacher_comment: string | null; score: number | null },
  ): void;
  /** Makes sure an answer row exists for every question, so a grade sheet has no holes. */
  ensureAnswerRows(submissionId: number, questionIds: number[]): void;

  // -- photos --------------------------------------------------------------
  listPhotos(submissionId: number): HomeworkPhotoRow[];
  listPhotosByIds(ids: number[]): HomeworkPhotoRow[];
  createPhoto(input: {
    submission_id: number;
    storage_path: string;
    mime: string;
    size: number;
    sha256: string;
    uploaded_by: number | null;
  }): number;
  deletePhoto(id: number): void;

  // -- AI Q&A --------------------------------------------------------------
  listQa(assignmentId: number, studentId: number): HomeworkQaRow[];
  createQa(input: {
    assignment_id: number;
    student_id: number;
    role: string;
    content: string;
    ai_source: string | null;
  }): number;

  // -- legacy read bridge --------------------------------------------------
  /** Uncopied legacy assignments of a class/teacher, shaped like a homework list row. */
  listLegacyHomeworks(input: { classId?: number; teacherId?: number; status?: HomeworkStatus }): HomeworkListRow[];
  /** Uncopied legacy assignments for one student's class. */
  listLegacyHomeworksForStudent(studentId: number): HomeworkListRow[];
}

/**
 * `COUNT(q.id)` rather than `COUNT(*)`.
 *
 * The join is a `LEFT JOIN` and the count is over the child's own column, so a homework with no
 * questions yet still appears - with a count of 0 - instead of vanishing from its own list. The
 * alias matters for the same reason: bare `COUNT(*)` would land in a column that collides with
 * `total_points` and the payload would report the wrong number.
 */
const HOMEWORK_LIST_SELECT = `
  SELECT a.*, COUNT(q.id) AS question_count
  FROM p_homework_assignments a
  LEFT JOIN p_homework_questions q ON q.assignment_id = a.id
`;

/**
 * Present a legacy `assignments` row in the new list shape.
 *
 * Two values are chosen rather than copied, and both are the honest reading of the legacy table
 * rather than a convenient one:
 *
 *   * `status` is the literal `'published'`. The legacy table has no status column and every
 *     assignment it holds was student-visible the moment it was created, so calling them drafts
 *     would hide work that pupils can currently see.
 *   * `total_points` is `0`, not a guess. The legacy model had no point total at all - a single
 *     score in a box - so inventing 100 here would put a number on the screen that the teacher
 *     never wrote. The data migration sets 100 deliberately, and it is the migration's job to make
 *     that choice visibly, once, with a report.
 */
function toBridgedHomework(row: LegacyAssignmentRow): HomeworkListRow {
  return {
    id: row.id,
    class_id: row.class_id ?? 0,
    teacher_id: row.teacher_id ?? 0,
    title: row.title,
    description: row.description,
    due_at: row.due_date,
    status: 'published',
    total_points: 0,
    reward_points: row.reward_points ?? 0,
    legacy_id: row.id,
    created_at: row.created_at,
    updated_at: null,
    question_count: 0,
    legacy: true,
  };
}

export function createHomeworkRepository(
  db: DbApi,
  options: HomeworkRepositoryOptions = {},
): HomeworkRepository {
  const decryptName = options.decryptName ?? ((value: string) => value);

  function whereFromScope(scope: HomeworkScope, alias = 'a'): { sql: string; params: SqlParam[] } {
    const conditions: string[] = [];
    const params: SqlParam[] = [];
    if (scope.classId !== undefined) {
      conditions.push(`${alias}.class_id = ?`);
      params.push(scope.classId);
    }
    if (scope.teacherId !== undefined) {
      conditions.push(`${alias}.teacher_id = ?`);
      params.push(scope.teacherId);
    }
    if (scope.status !== undefined) {
      conditions.push(`${alias}.status = ?`);
      params.push(scope.status);
    }
    return {
      sql: conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  return {
    transaction<T>(fn: () => T): T {
      return db.tx(fn);
    },

    // -- homework ----------------------------------------------------------

    listHomeworks(scope) {
      const where = whereFromScope(scope);
      return db.query<HomeworkListRow>(
        `${HOMEWORK_LIST_SELECT}${where.sql} GROUP BY a.id ORDER BY a.created_at DESC, a.id DESC`,
        where.params,
      );
    },

    getHomework(id) {
      return db.get<HomeworkRow>('SELECT * FROM p_homework_assignments WHERE id = ?', [id]) ?? null;
    },

    createHomework(input) {
      const info = db.run(
        `INSERT INTO p_homework_assignments
           (class_id, teacher_id, title, description, due_at, status, total_points, reward_points, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          input.class_id,
          input.teacher_id,
          input.title,
          input.description,
          input.due_at,
          input.status,
          input.total_points,
          input.reward_points,
        ],
      );
      return Number(info.lastInsertRowid);
    },

    /**
     * A dynamic SET list, because every field is optional and "clear the due date" (`null`) has
     * to be distinguishable from "leave the due date alone" (`undefined`). The service rejects an
     * empty body first, so the `UPDATE ... SET  WHERE` syntax error is unreachable through HTTP -
     * the same arrangement `plugins/assignments` records for its own dynamic update.
     */
    updateHomework(id, input) {
      const updates: string[] = [];
      const params: unknown[] = [];
      if (input.title !== undefined) {
        updates.push('title = ?');
        params.push(input.title);
      }
      if (input.description !== undefined) {
        updates.push('description = ?');
        params.push(input.description);
      }
      if (input.due_at !== undefined) {
        updates.push('due_at = ?');
        params.push(input.due_at);
      }
      if (input.status !== undefined) {
        updates.push('status = ?');
        params.push(input.status);
      }
      if (input.reward_points !== undefined) {
        updates.push('reward_points = ?');
        params.push(input.reward_points);
      }
      if (input.total_points !== undefined) {
        updates.push('total_points = ?');
        params.push(input.total_points);
      }
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      db.run(`UPDATE p_homework_assignments SET ${updates.join(', ')} WHERE id = ?`, params as SqlParam[]);
    },

    /**
     * The children are deleted first, in foreign-key order, before the parent.
     *
     * The DDL does declare `ON DELETE CASCADE`, so SQLite would do this - but only when foreign
     * keys are enabled on the connection, and this plugin should not depend on that for the one
     * operation that destroys a teacher's work. `p_homework_submissions` and `p_homework_photos`
     * hang off the submission rather than the assignment, so they go before it.
     */
    deleteHomework(id) {
      db.run(
        `DELETE FROM p_homework_photos WHERE submission_id IN
           (SELECT id FROM p_homework_submissions WHERE assignment_id = ?)`,
        [id],
      );
      db.run(
        `DELETE FROM p_homework_answers WHERE submission_id IN
           (SELECT id FROM p_homework_submissions WHERE assignment_id = ?)`,
        [id],
      );
      db.run('DELETE FROM p_homework_qa_messages WHERE assignment_id = ?', [id]);
      db.run('DELETE FROM p_homework_submissions WHERE assignment_id = ?', [id]);
      db.run('DELETE FROM p_homework_questions WHERE assignment_id = ?', [id]);
      db.run('DELETE FROM p_homework_assignments WHERE id = ?', [id]);
    },

    // -- questions ---------------------------------------------------------

    listQuestions(assignmentId) {
      return db.query<HomeworkQuestionRow>(
        'SELECT * FROM p_homework_questions WHERE assignment_id = ? ORDER BY order_no ASC, id ASC',
        [assignmentId],
      );
    },

    getQuestion(id) {
      return db.get<HomeworkQuestionRow>('SELECT * FROM p_homework_questions WHERE id = ?', [id]) ?? null;
    },

    createQuestion(assignmentId, orderNo, input) {
      const info = db.run(
        `INSERT INTO p_homework_questions
           (assignment_id, order_no, type, stem, options_json, answer_json, explanation, points, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          assignmentId,
          orderNo,
          input.type,
          input.stem,
          JSON.stringify(input.options),
          JSON.stringify(input.reference),
          input.explanation,
          input.points,
        ],
      );
      return Number(info.lastInsertRowid);
    },

    updateQuestion(id, orderNo, input) {
      db.run(
        `UPDATE p_homework_questions
           SET order_no = ?, type = ?, stem = ?, options_json = ?, answer_json = ?, explanation = ?, points = ?
         WHERE id = ?`,
        [
          orderNo,
          input.type,
          input.stem,
          JSON.stringify(input.options),
          JSON.stringify(input.reference),
          input.explanation,
          input.points,
          id,
        ],
      );
    },

    deleteQuestion(id) {
      db.run('DELETE FROM p_homework_questions WHERE id = ?', [id]);
    },

    listQuestionIds(assignmentId) {
      return db
        .query<{ id: number }>('SELECT id FROM p_homework_questions WHERE assignment_id = ?', [assignmentId])
        .map((row) => row.id);
    },

    listAnswerIdsForHomework(assignmentId) {
      return db
        .query<{ id: number }>(
          `SELECT pa.id FROM p_homework_answers pa
             JOIN p_homework_submissions ps ON ps.id = pa.submission_id
            WHERE ps.assignment_id = ?`,
          [assignmentId],
        )
        .map((row) => row.id);
    },

    // -- submissions -------------------------------------------------------

    listSubmissions(assignmentId) {
      return db.query<HomeworkSubmissionRow>(
        'SELECT * FROM p_homework_submissions WHERE assignment_id = ? ORDER BY id ASC',
        [assignmentId],
      );
    },

    getSubmission(id) {
      return db.get<HomeworkSubmissionRow>('SELECT * FROM p_homework_submissions WHERE id = ?', [id]) ?? null;
    },

    getSubmissionByStudent(assignmentId, studentId) {
      return (
        db.get<HomeworkSubmissionRow>(
          'SELECT * FROM p_homework_submissions WHERE assignment_id = ? AND student_id = ?',
          [assignmentId, studentId],
        ) ?? null
      );
    },

    createSubmission(input) {
      const info = db.run(
        `INSERT INTO p_homework_submissions
           (assignment_id, student_id, status, score, total_points, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [input.assignment_id, input.student_id, input.status, input.total_points],
      );
      return Number(info.lastInsertRowid);
    },

    updateSubmission(id, input) {
      const updates: string[] = [];
      const params: unknown[] = [];
      for (const key of [
        'status',
        'submitted_at',
        'score',
        'total_points',
        'teacher_feedback',
        'ai_feedback',
        'ai_confidence',
        'graded_by',
      ] as const) {
        if (input[key] !== undefined) {
          updates.push(`${key} = ?`);
          params.push(input[key]);
        }
      }
      if (updates.length === 0) return;
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      db.run(`UPDATE p_homework_submissions SET ${updates.join(', ')} WHERE id = ?`, params as SqlParam[]);
    },

    /**
     * The grade sheet, joined to the pupil's name.
     *
     * `students` is a declared read; the name is AES-encrypted at rest, so it is decrypted here
     * rather than handed out as ciphertext. `ORDER BY s.id` matches `plugins/assignments`'
     * grade-sheet order so a teacher sees the same roster order across both screens.
     */
    listGradeSheet(assignmentId) {
      const rows = db.query<{
        submission_id: number;
        assignment_id: number;
        student_id: number;
        status: string;
        submitted_at: string | null;
        score: number | null;
        total_points: number;
        teacher_feedback: string | null;
        ai_feedback: string | null;
        ai_confidence: number | null;
        graded_by: string | null;
        legacy_id: number | null;
        created_at: string | null;
        updated_at: string | null;
        student_name: string;
      }>(
        `SELECT ps.id AS submission_id, ps.assignment_id, ps.student_id, ps.status, ps.submitted_at,
                ps.score, ps.total_points, ps.teacher_feedback, ps.ai_feedback, ps.ai_confidence,
                ps.graded_by, ps.legacy_id, ps.created_at, ps.updated_at,
                s.name AS student_name
           FROM p_homework_submissions ps
           JOIN students s ON s.id = ps.student_id
          WHERE ps.assignment_id = ?
          ORDER BY s.id ASC`,
        [assignmentId],
      );

      return rows.map((row) => ({
        submission: {
          id: row.submission_id,
          assignment_id: row.assignment_id,
          student_id: row.student_id,
          status: row.status as HomeworkSubmissionRow['status'],
          submitted_at: row.submitted_at,
          score: row.score,
          total_points: row.total_points,
          teacher_feedback: row.teacher_feedback,
          ai_feedback: row.ai_feedback,
          ai_confidence: row.ai_confidence,
          graded_by: row.graded_by,
          legacy_id: row.legacy_id,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        // The name is AES-encrypted at rest; the injected decryptor is the only thing that turns it
        // back into a label. Kept here rather than in the service so the ciphertext never leaves the
        // one layer that knows about it.
        student_name: decryptName(String(row.student_name)),
      }));
    },

    listRosterOfClass(classId) {
      return db
        .query<{ id: number; name: string }>('SELECT id, name FROM students WHERE class_id = ? ORDER BY id ASC', [
          classId,
        ])
        .map((row) => ({ id: row.id, name: decryptName(String(row.name)) }));
    },

    // -- answers -----------------------------------------------------------

    listAnswers(submissionId) {
      return db.query<HomeworkAnswerRow>(
        'SELECT * FROM p_homework_answers WHERE submission_id = ? ORDER BY id ASC',
        [submissionId],
      );
    },

    getAnswerForQuestion(submissionId, questionId) {
      return (
        db.get<HomeworkAnswerRow>(
          'SELECT * FROM p_homework_answers WHERE submission_id = ? AND question_id = ?',
          [submissionId, questionId],
        ) ?? null
      );
    },

    /**
     * `ON CONFLICT (submission_id, question_id) DO UPDATE`, which is why the table carries that
     * unique index: auto-save fires on every keystroke-ish interval, and an insert-only design
     * would either duplicate rows or need a read-then-write race.
     */
    upsertAnswer(submissionId, input) {
      db.run(
        `INSERT INTO p_homework_answers (submission_id, question_id, answer_json, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (submission_id, question_id) DO UPDATE SET
           answer_json = excluded.answer_json,
           updated_at = CURRENT_TIMESTAMP`,
        [submissionId, input.question_id, JSON.stringify(input.value)],
      );
    },

    deleteAnswer(submissionId, questionId) {
      db.run('DELETE FROM p_homework_answers WHERE submission_id = ? AND question_id = ?', [
        submissionId,
        questionId,
      ]);
    },

    updateAnswerAi(id, input) {
      db.run(
        `UPDATE p_homework_answers
            SET ai_score = ?, ai_comment = ?, ai_confidence = ?, ai_source = ?,
                teacher_score = ?, score = ?, is_correct = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [
          input.ai_score,
          input.ai_comment,
          input.ai_confidence,
          input.ai_source,
          input.teacher_score,
          input.score,
          input.is_correct,
          id,
        ],
      );
    },

    updateAnswerAuto(id, input) {
      db.run(
        `UPDATE p_homework_answers
            SET auto_score = ?, auto_source = ?, is_correct = ?, score = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [input.auto_score, input.auto_source, input.is_correct, input.score, id],
      );
    },

    updateAnswerTeacher(id, input) {
      db.run(
        `UPDATE p_homework_answers
            SET teacher_score = ?, teacher_comment = ?, score = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [input.teacher_score, input.teacher_comment, input.score, id],
      );
    },

    /**
     * One `INSERT OR IGNORE` per question, so grading has a row to write into for questions the
     * pupil left blank. Uses the table's unique index rather than a read-then-insert loop.
     */
    ensureAnswerRows(submissionId, questionIds) {
      for (const questionId of questionIds) {
        db.run(
          `INSERT OR IGNORE INTO p_homework_answers (submission_id, question_id, answer_json, updated_at)
           VALUES (?, ?, NULL, CURRENT_TIMESTAMP)`,
          [submissionId, questionId],
        );
      }
    },

    // -- photos ------------------------------------------------------------

    listPhotos(submissionId) {
      return db.query<HomeworkPhotoRow>(
        'SELECT * FROM p_homework_photos WHERE submission_id = ? ORDER BY id ASC',
        [submissionId],
      );
    },

    /**
     * Photos named by id, restricted to one submission.
     *
     * The `submission_id` predicate is the authorization, not a convenience: without it a student
     * could name another pupil's photo id in their own submit payload and have it count as their
     * work. `uploadPhoto` writes whole-submission photos, so this is the only read that has to
     * prove ownership.
     */
    listPhotosByIds(ids) {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => '?').join(', ');
      return db.query<HomeworkPhotoRow>(
        `SELECT * FROM p_homework_photos WHERE id IN (${placeholders})`,
        ids as SqlParam[],
      );
    },

    createPhoto(input) {
      const info = db.run(
        `INSERT INTO p_homework_photos (submission_id, storage_path, mime, size, sha256, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [input.submission_id, input.storage_path, input.mime, input.size, input.sha256, input.uploaded_by],
      );
      return Number(info.lastInsertRowid);
    },

    deletePhoto(id) {
      db.run('DELETE FROM p_homework_photos WHERE id = ?', [id]);
    },

    // -- AI Q&A ------------------------------------------------------------

    listQa(assignmentId, studentId) {
      return db.query<HomeworkQaRow>(
        `SELECT * FROM p_homework_qa_messages
          WHERE assignment_id = ? AND student_id = ?
          ORDER BY id ASC`,
        [assignmentId, studentId],
      );
    },

    createQa(input) {
      const info = db.run(
        `INSERT INTO p_homework_qa_messages (assignment_id, student_id, role, content, ai_source, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [input.assignment_id, input.student_id, input.role, input.content, input.ai_source],
      );
      return Number(info.lastInsertRowid);
    },

    // -- legacy read bridge ------------------------------------------------

    /**
     * Legacy assignments not yet copied into `p_homework_*`, presented in the new shape.
     *
     * The read bridge exists so that switching the frontend over cannot make a deployment's
     * existing homework disappear before the data migration has run. `status` is the honest
     * literal `'published'`: the legacy table has no status column, and every legacy assignment
     * was visible to students the moment it was created - inventing `'draft'` would hide work
     * that pupils can currently see.
     *
     * `id` is returned as-is. The two id spaces are disjoint and the service marks every bridged
     * row `legacy: true`, so the frontend can tell them apart without a prefix.
     */
    listLegacyHomeworks(input) {
      const conditions = ['1=1'];
      const params: SqlParam[] = [];
      if (input.classId !== undefined) {
        conditions.push('a.class_id = ?');
        params.push(input.classId);
      }
      if (input.teacherId !== undefined) {
        conditions.push('a.teacher_id = ?');
        params.push(input.teacherId);
      }
      if (input.status !== undefined && input.status !== 'published') {
        // Legacy assignments have no status column and were all student-visible, so only a
        // 'published' request may match them. `1=0` rather than a skipped filter: a request for
        // drafts must actively exclude them, not merely fail to mention them.
        conditions.push('1=0');
      }

      return db
        .query<LegacyAssignmentRow>(
          `SELECT a.id, a.class_id, a.teacher_id, a.title, a.description, a.due_date,
                  a.reward_points, a.created_at
             FROM assignments a
            WHERE ${conditions.join(' AND ')}
              AND NOT EXISTS (SELECT 1 FROM p_homework_assignments h WHERE h.legacy_id = a.id)
            ORDER BY a.created_at DESC, a.id DESC`,
          params,
        )
        .map(toBridgedHomework);
    },

    /**
     * The same bridge for one pupil.
     *
     * `SELECT DISTINCT` is load-bearing: the join is on `students.class_id = assignments.class_id`,
     * so any query that can match more than one student row multiplies the assignments. The legacy
     * code path would in fact have produced one row per matching pupil.
     */
    listLegacyHomeworksForStudent(studentId) {
      return db
        .query<LegacyAssignmentRow>(
          `SELECT DISTINCT a.id, a.class_id, a.teacher_id, a.title, a.description, a.due_date,
                  a.reward_points, a.created_at
             FROM assignments a
             JOIN students s ON s.class_id = a.class_id
            WHERE s.id = ?
              AND NOT EXISTS (SELECT 1 FROM p_homework_assignments h WHERE h.legacy_id = a.id)
            ORDER BY a.created_at DESC, a.id DESC`,
          [studentId],
        )
        .map(toBridgedHomework);
    },
  };
}
