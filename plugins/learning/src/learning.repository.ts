/**
 * Learning repository - the paper / knowledge / wrong-question / study-plan engine.
 *
 * The SQL is a faithful translation of the 40 Prisma calls in
 * `api/modules/learning/learning.service.ts` (deleted in this round's integration commit):
 * same WHERE clauses, same ORDER BY, same LIMIT, same transaction boundary via `db.tx`.
 * Prisma is not available to a plugin, and `ctx.db` is ownership-checked, so every
 * statement here names a table the manifest adopts.
 *
 * ## Two conversions that are easy to get wrong
 *
 * **DateTime.** Prisma's SQLite connector stores `DateTime` as an INTEGER of epoch
 * milliseconds (client-generated `now()`, not the DDL's `CURRENT_TIMESTAMP`) and projects
 * it as a JS `Date`, which `JSON.stringify` renders as an ISO string. Measured on a
 * throwaway copy of `database.sqlite` with the real Prisma client:
 *
 *     prisma create  -> raw row {"exam_date":1767323045678}
 *                    -> JSON    {"exam_date":"2026-01-02T03:04:05.678Z"}
 *     raw text row   -> JSON    {"created_at":"2026-09-19T10:25:57.000Z"}   (parsed as UTC)
 *
 * So reads convert both the integer and the `CURRENT_TIMESTAMP` text form to the same ISO
 * string Prisma produced, and writes store epoch milliseconds. Skipping either half would
 * silently change the JSON the frontend already parses (`src/features/learning/api/*`).
 *
 * **Missing rows.** Prisma's `update` / `delete` throw when the row is absent (P2025),
 * which the pre-migration `throwLearningError` turned into a 500 - not a 404. The
 * repository keeps that status by throwing a plain `Error`; the message differs (it is no
 * longer the driver's), which is recorded in `plugin.json` `_known_debt`.
 */

import type { DbApi, SqlParam } from '@thinkclass/plugin-sdk';

import type {
  AnswerWithItemQuestion,
  KnowledgeEdgeRow,
  KnowledgeNodeRow,
  PaperAnswerRow,
  PaperAssetRow,
  PaperDetailRow,
  PaperItemRow,
  PaperItemWithRelations,
  PaperRow,
  PaperSectionRow,
  PaperStructureRow,
  PaperSubmissionRow,
  PaperWithSubject,
  QuestionRow,
  RubricPointRow,
  StudyPlanItemRow,
  StudyPlanItemWithRelations,
  StudyPlanRow,
  StudyPlanWithItems,
  SubjectRow,
  SubmissionWithAnswerSheet,
  WrongQuestionRow,
  WrongQuestionWithQuestion,
} from './learning.types.js';

/**
 * DateTime columns per table.
 *
 * Explicit rather than inferred: a heuristic ("this string looks like a date") would
 * rewrite free-text columns such as `questions.explanation` the first time someone stored
 * a date in one.
 */
const DATE_COLUMNS: Record<string, readonly string[]> = {
  subjects: ['created_at'],
  knowledge_nodes: ['created_at'],
  knowledge_edges: ['created_at'],
  questions: ['created_at'],
  papers: ['exam_date', 'created_at'],
  paper_assets: ['created_at'],
  paper_sections: ['created_at'],
  paper_items: ['created_at'],
  paper_submissions: ['started_at', 'submitted_at', 'created_at'],
  paper_answers: ['created_at'],
  rubric_points: ['created_at'],
  wrong_questions: ['first_wrong_at', 'last_wrong_at', 'cleared_at', 'created_at', 'updated_at'],
  wrong_question_attempts: ['created_at'],
  study_plans: ['target_exam_date', 'created_at', 'updated_at'],
  study_plan_items: ['due_date', 'created_at'],
};

/**
 * Prisma reads a stored DateTime into an ISO string; reproduce that exactly.
 *
 * `CURRENT_TIMESTAMP` (the DDL default, used by rows written outside Prisma) is UTC but
 * carries no zone marker, so `Z` is appended before parsing - without it every such
 * timestamp would shift by the local offset.
 */
function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'bigint') return new Date(Number(value)).toISOString();
  if (value instanceof Date) return value.toISOString();

  const text = String(value).trim();
  if (text === '') return null;
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`unrecognised datetime value in the learning database: ${JSON.stringify(value)}`);
  }
  return parsed.toISOString();
}

/** Prisma writes `DateTime` as epoch milliseconds; a `null` stays SQL NULL. */
function toEpoch(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

/** `now`, the way Prisma's client-side `@default(now())` produced it. */
function now(): number {
  return Date.now();
}

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

/**
 * Prisma's `update` / `delete` on an absent row throws P2025, which the pre-migration
 * error translator rendered as HTTP 500. Preserve the status; the message is ours.
 */
function missingRow(operation: string): Error {
  return new Error(`${operation} failed: no matching record`);
}

export interface PaperListFilter {
  teacherId?: number;
  classId?: number;
  status?: string;
}

export interface PaperCreateInput {
  teacher_id: number;
  class_id: number | null;
  subject_id: number | null;
  title: string;
  source: string;
  total_points: number;
  exam_date: Date | null;
}

export interface PaperPatch {
  title?: string;
  status?: string;
  class_id?: number | null;
  subject_id?: number | null;
  total_points?: number;
  exam_date?: Date | null;
}

export interface QuestionCreateInput {
  teacher_id: number | null;
  subject_id: number | null;
  stem: string;
  type: string;
  options_json: string | null;
  answer_json: string | null;
  explanation: string | null;
  difficulty: number | null;
  is_subjective: number | null;
  default_points: number | null;
}

export interface LearningRepository {
  transaction<T>(fn: () => T): T;

  // -- subjects / knowledge graph ------------------------------------------
  listSubjects(): SubjectRow[];
  createSubject(input: { name: string; stage: string | null; grade: number | null }): SubjectRow;
  listKnowledgeNodes(subjectId: number): KnowledgeNodeRow[];
  createKnowledgeNode(input: {
    subject_id: number;
    name: string;
    code: string | null;
    parent_id: number | null;
    importance: number | null;
  }): KnowledgeNodeRow;
  updateKnowledgeNode(
    id: number,
    patch: { name?: string; code?: string | null; parent_id?: number | null; importance?: number | null },
  ): KnowledgeNodeRow;
  deleteKnowledgeNode(id: number): void;
  listKnowledgeEdges(subjectId: number): KnowledgeEdgeRow[];
  createKnowledgeEdge(input: {
    subject_id: number;
    from_node_id: number;
    to_node_id: number;
    edge_type: string;
    weight: number | null;
  }): KnowledgeEdgeRow;
  deleteKnowledgeEdge(id: number): void;

  // -- papers ---------------------------------------------------------------
  listPapers(filter: PaperListFilter): PaperWithSubject[];
  createPaper(input: PaperCreateInput): PaperRow;
  getPaper(id: number): PaperRow | null;
  getPaperDetail(id: number): PaperDetailRow | null;
  updatePaper(id: number, patch: PaperPatch): PaperRow;
  countPaperItems(paperId: number): number;
  deletePaperStructure(paperId: number): void;
  createPaperSection(paperId: number, title: string, orderNo: number): PaperSectionRow;
  createQuestion(input: QuestionCreateInput): number;
  createPaperItem(input: {
    paper_id: number;
    section_id: number | null;
    question_id: number;
    order_no: number;
    points_override: number | null;
    difficulty_override: number | null;
    rubric_json: string | null;
  }): { id: number; order_no: number };
  createRubricPoint(input: {
    paper_item_id: number;
    label: string;
    points: number;
    keywords_json: string | null;
    step_order: number;
  }): void;
  getPaperStructure(id: number): PaperStructureRow | null;
  createPaperAsset(input: {
    paper_id: number;
    kind: string;
    storage_path: string;
    mime: string;
    size: number;
    sha256: string;
  }): PaperAssetRow;

  // -- submissions ----------------------------------------------------------
  createSubmission(paperId: number, studentId: number): PaperSubmissionRow;
  getSubmission(id: number): PaperSubmissionRow | null;
  getSubmissionWithAnswerSheet(id: number): SubmissionWithAnswerSheet | null;
  listPaperItemsWithRelations(paperId: number): PaperItemWithRelations[];
  listPaperItemIds(paperId: number): number[];
  getAnswerForItem(submissionId: number, paperItemId: number): { id: number } | null;
  updateAnswerInput(
    id: number,
    patch: { answer_json?: string | null; time_spent_sec?: number },
  ): void;
  createAnswer(input: {
    submission_id: number;
    paper_item_id: number;
    answer_json: string | null;
    time_spent_sec: number;
  }): void;
  markSubmissionSubmitted(id: number, submittedAt: Date): void;
  createAnswerSheetRows(rows: Array<{ submission_id: number; paper_item_id: number }>): void;
  listAnswersWithRelations(submissionId: number): AnswerWithItemQuestion[];
  updateAnswerScore(id: number, patch: { is_correct: number; score: number }): void;

  // -- wrong questions ------------------------------------------------------
  listWrongQuestions(studentId: number): WrongQuestionWithQuestion[];
  getWrongQuestion(id: number): WrongQuestionRow | null;
  getWrongQuestionForStudent(id: number, studentId: number): WrongQuestionWithQuestion | null;
  getWrongQuestionByQuestion(studentId: number, questionId: number): WrongQuestionRow | null;
  createWrongQuestion(input: { studentId: number; questionId: number }): void;
  bumpWrongQuestion(id: number, patch: { wrongCount: number; masteryScore: number }): void;
  recordWrongQuestionAttempt(
    id: number,
    patch: { masteryScore: number; clearedAt: Date | null },
  ): void;
  createWrongQuestionAttempt(input: {
    wrongQuestionId: number;
    practiceSource: string;
    isCorrect: number;
    spentSec: number;
  }): void;
  listQuestionKnowledgeNodeIds(questionId: number): number[];
  listQuestionsByNodeIds(excludeQuestionId: number, nodeIds: number[]): QuestionRow[];
  listQuestionsBySubjectType(excludeQuestionId: number, subjectId: number | null, type: string): QuestionRow[];

  // -- study plans ----------------------------------------------------------
  getActiveStudyPlan(studentId: number): StudyPlanWithItems | null;
  getActiveStudyPlanRow(studentId: number): StudyPlanRow | null;
  createStudyPlan(input: {
    student_id: number;
    target_exam_date: Date | null;
    target_score: number | null;
  }): StudyPlanRow;
  archiveActiveStudyPlans(studentId: number, archivedAt: Date): void;
  getStudyPlanItemWithPlan(id: number): { item: StudyPlanItemRow; plan: StudyPlanRow } | null;
  updateStudyPlanItem(id: number, status: string): StudyPlanItemRow;
  listPendingPracticeItems(planId: number): Array<{ id: number; question_id: number | null }>;
  createStudyPlanItem(input: {
    plan_id: number;
    kind: string;
    question_id: number;
    estimated_min: number;
    status: string;
  }): void;
}

export function createLearningRepository(db: DbApi): LearningRepository {
  /** Row -> wire shape, converting the table's DateTime columns. */
  function mapRow<T>(table: keyof typeof DATE_COLUMNS, value: Record<string, unknown> | undefined): T | null {
    if (!value) return null;
    const out: Record<string, unknown> = { ...value };
    for (const column of DATE_COLUMNS[table] ?? []) {
      if (column in out) out[column] = toIsoDate(out[column]);
    }
    return out as T;
  }

  function mapRows<T>(table: keyof typeof DATE_COLUMNS, values: Array<Record<string, unknown>>): T[] {
    return values.map((value) => mapRow<T>(table, value) as T);
  }

  function subjectMap(ids: number[]): Map<number, SubjectRow> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = mapRows<SubjectRow>(
      'subjects',
      db.query(`SELECT * FROM subjects WHERE id IN (${placeholders(unique.length)})`, unique),
    );
    return new Map(rows.map((row) => [row.id, row]));
  }

  function questionMap(ids: number[]): Map<number, QuestionRow> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = mapRows<QuestionRow>(
      'questions',
      db.query(`SELECT * FROM questions WHERE id IN (${placeholders(unique.length)})`, unique),
    );
    return new Map(rows.map((row) => [row.id, row]));
  }

  function knowledgeNodeMap(ids: number[]): Map<number, KnowledgeNodeRow> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = mapRows<KnowledgeNodeRow>(
      'knowledge_nodes',
      db.query(`SELECT * FROM knowledge_nodes WHERE id IN (${placeholders(unique.length)})`, unique),
    );
    return new Map(rows.map((row) => [row.id, row]));
  }

  /** Prisma's `include: { subjects: true }` - the key is present, `null` when unset. */
  function withSubject(paper: PaperRow, subjects: Map<number, SubjectRow>): PaperWithSubject {
    return { ...paper, subjects: paper.subject_id === null ? null : subjects.get(paper.subject_id) ?? null };
  }

  /** `paper_items` + `questions` + `rubric_points`, in the order Prisma projected them. */
  function paperItemsWithRelations(paperId: number): PaperItemWithRelations[] {
    const items = mapRows<PaperItemRow>(
      'paper_items',
      db.query('SELECT * FROM paper_items WHERE paper_id = ? ORDER BY order_no ASC', [paperId]),
    );
    if (items.length === 0) return [];

    const questions = questionMap(items.map((item) => item.question_id));
    const rubricsByItem = new Map<number, RubricPointRow[]>();
    const rubricRows = mapRows<RubricPointRow>(
      'rubric_points',
      db.query(
        `SELECT * FROM rubric_points WHERE paper_item_id IN (${placeholders(items.length)})
          ORDER BY step_order ASC`,
        items.map((item) => item.id),
      ),
    );
    for (const rubric of rubricRows) {
      const list = rubricsByItem.get(rubric.paper_item_id) ?? [];
      list.push(rubric);
      rubricsByItem.set(rubric.paper_item_id, list);
    }

    return items.map((item) => ({
      ...item,
      questions: questions.get(item.question_id) ?? null,
      rubric_points: rubricsByItem.get(item.id) ?? [],
    }));
  }

  /** `paper_answers` + `paper_items` + `questions`, for both the pre-read and the scoring pass. */
  function answersWithRelations(submissionId: number): AnswerWithItemQuestion[] {
    const answers = mapRows<PaperAnswerRow>(
      'paper_answers',
      db.query('SELECT * FROM paper_answers WHERE submission_id = ?', [submissionId]),
    );
    if (answers.length === 0) return [];

    const items = mapRows<PaperItemRow>(
      'paper_items',
      db.query(
        `SELECT * FROM paper_items WHERE id IN (${placeholders(answers.length)})`,
        answers.map((answer) => answer.paper_item_id),
      ),
    );
    const itemById = new Map(items.map((item) => [item.id, item]));
    const questions = questionMap(items.map((item) => item.question_id));

    return answers.map((answer) => {
      const item = itemById.get(answer.paper_item_id) as PaperItemRow;
      return {
        ...answer,
        paper_items: { ...item, questions: questions.get(item.question_id) ?? null },
      };
    });
  }

  function wrongQuestionsWithQuestion(where: string, params: SqlParam[]): WrongQuestionWithQuestion[] {
    const rows = mapRows<WrongQuestionRow>(
      'wrong_questions',
      db.query(`SELECT * FROM wrong_questions WHERE ${where}`, params),
    );
    if (rows.length === 0) return [];
    const questions = questionMap(rows.map((row) => row.question_id));
    return rows.map((row) => ({ ...row, questions: questions.get(row.question_id) ?? null }));
  }

  function studyPlanWithItems(plan: StudyPlanRow | null): StudyPlanWithItems | null {
    if (!plan) return null;
    const items = mapRows<StudyPlanItemRow>(
      'study_plan_items',
      db.query('SELECT * FROM study_plan_items WHERE plan_id = ? ORDER BY id ASC', [plan.id]),
    );
    const questions = questionMap(items.map((item) => item.question_id).filter((id) => id !== null) as number[]);
    const nodes = knowledgeNodeMap(
      items.map((item) => item.knowledge_node_id).filter((id) => id !== null) as number[],
    );

    const withRelations: StudyPlanItemWithRelations[] = items.map((item) => ({
      ...item,
      questions: item.question_id === null ? null : questions.get(item.question_id) ?? null,
      knowledge_nodes: item.knowledge_node_id === null ? null : nodes.get(item.knowledge_node_id) ?? null,
    }));

    return { ...plan, study_plan_items: withRelations };
  }

  function getPaperRow(id: number): PaperRow | null {
    return mapRow<PaperRow>('papers', db.get('SELECT * FROM papers WHERE id = ?', [id]));
  }

  function getSubject(id: number): SubjectRow | null {
    return mapRow<SubjectRow>('subjects', db.get('SELECT * FROM subjects WHERE id = ?', [id]));
  }

  function getKnowledgeNode(id: number): KnowledgeNodeRow | null {
    return mapRow<KnowledgeNodeRow>(
      'knowledge_nodes',
      db.get('SELECT * FROM knowledge_nodes WHERE id = ?', [id]),
    );
  }

  function getKnowledgeEdge(id: number): KnowledgeEdgeRow | null {
    return mapRow<KnowledgeEdgeRow>(
      'knowledge_edges',
      db.get('SELECT * FROM knowledge_edges WHERE id = ?', [id]),
    );
  }

  function getPaperItem(id: number): PaperItemRow | null {
    return mapRow<PaperItemRow>('paper_items', db.get('SELECT * FROM paper_items WHERE id = ?', [id]));
  }

  const repository: LearningRepository = {
    transaction<T>(fn: () => T): T {
      return db.tx(fn);
    },

    // -- subjects / knowledge graph ----------------------------------------

    listSubjects() {
      return mapRows<SubjectRow>('subjects', db.query('SELECT * FROM subjects ORDER BY id ASC'));
    },

    createSubject(input) {
      const info = db.run('INSERT INTO subjects (name, stage, grade, created_at) VALUES (?, ?, ?, ?)', [
        input.name,
        input.stage,
        input.grade,
        now(),
      ]);
      return getSubject(Number(info.lastInsertRowid)) as SubjectRow;
    },

    listKnowledgeNodes(subjectId) {
      return mapRows<KnowledgeNodeRow>(
        'knowledge_nodes',
        db.query('SELECT * FROM knowledge_nodes WHERE subject_id = ? ORDER BY parent_id ASC, id ASC', [
          subjectId,
        ]),
      );
    },

    createKnowledgeNode(input) {
      const info = db.run(
        'INSERT INTO knowledge_nodes (subject_id, name, code, parent_id, importance, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [input.subject_id, input.name, input.code, input.parent_id, input.importance, now()],
      );
      return getKnowledgeNode(Number(info.lastInsertRowid)) as KnowledgeNodeRow;
    },

    updateKnowledgeNode(id, patch) {
      const sets: string[] = [];
      const params: SqlParam[] = [];
      if (patch.name !== undefined) {
        sets.push('name = ?');
        params.push(patch.name);
      }
      if (patch.code !== undefined) {
        sets.push('code = ?');
        params.push(patch.code);
      }
      if (patch.parent_id !== undefined) {
        sets.push('parent_id = ?');
        params.push(patch.parent_id);
      }
      if (patch.importance !== undefined) {
        sets.push('importance = ?');
        params.push(patch.importance);
      }

      if (sets.length === 0) {
        // Prisma's empty `data` is a no-op read; `UPDATE ... SET` with nothing after SET
        // is a syntax error, so skip the statement rather than emit it.
        const current = getKnowledgeNode(id);
        if (!current) throw missingRow('knowledge_nodes.update');
        return current;
      }

      params.push(id);
      const info = db.run(`UPDATE knowledge_nodes SET ${sets.join(', ')} WHERE id = ?`, params);
      if (info.changes === 0) throw missingRow('knowledge_nodes.update');
      return getKnowledgeNode(id) as KnowledgeNodeRow;
    },

    deleteKnowledgeNode(id) {
      const info = db.run('DELETE FROM knowledge_nodes WHERE id = ?', [id]);
      if (info.changes === 0) throw missingRow('knowledge_nodes.delete');
    },

    listKnowledgeEdges(subjectId) {
      return mapRows<KnowledgeEdgeRow>(
        'knowledge_edges',
        db.query('SELECT * FROM knowledge_edges WHERE subject_id = ? ORDER BY id ASC', [subjectId]),
      );
    },

    createKnowledgeEdge(input) {
      const info = db.run(
        'INSERT INTO knowledge_edges (subject_id, from_node_id, to_node_id, edge_type, weight, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [input.subject_id, input.from_node_id, input.to_node_id, input.edge_type, input.weight, now()],
      );
      return getKnowledgeEdge(Number(info.lastInsertRowid)) as KnowledgeEdgeRow;
    },

    deleteKnowledgeEdge(id) {
      const info = db.run('DELETE FROM knowledge_edges WHERE id = ?', [id]);
      if (info.changes === 0) throw missingRow('knowledge_edges.delete');
    },

    // -- papers -------------------------------------------------------------

    listPapers(filter) {
      const parts: string[] = [];
      const params: SqlParam[] = [];
      if (filter.teacherId !== undefined) {
        parts.push('teacher_id = ?');
        params.push(filter.teacherId);
      }
      if (filter.classId !== undefined) {
        parts.push('class_id = ?');
        params.push(filter.classId);
      }
      if (filter.status !== undefined) {
        parts.push('status = ?');
        params.push(filter.status);
      }

      const where = parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '';
      const papers = mapRows<PaperRow>(
        'papers',
        db.query(`SELECT * FROM papers${where} ORDER BY created_at DESC`, params),
      );
      const subjects = subjectMap(papers.map((paper) => paper.subject_id).filter((id) => id !== null) as number[]);
      return papers.map((paper) => withSubject(paper, subjects));
    },

    createPaper(input) {
      const info = db.run(
        `INSERT INTO papers (teacher_id, class_id, subject_id, title, source, total_points, exam_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.teacher_id,
          input.class_id,
          input.subject_id,
          input.title,
          input.source,
          input.total_points,
          toEpoch(input.exam_date),
          now(),
        ],
      );
      // `status` is not in the column list: Prisma omitted it too, so the DDL default
      // ('draft') - which is also the Prisma schema default - applies.
      return getPaperRow(Number(info.lastInsertRowid)) as PaperRow;
    },

    getPaper: getPaperRow,

    getPaperDetail(id) {
      const paper = getPaperRow(id);
      if (!paper) return null;
      const subjects = subjectMap(paper.subject_id === null ? [] : [paper.subject_id]);
      return {
        ...withSubject(paper, subjects),
        paper_assets: mapRows<PaperAssetRow>(
          'paper_assets',
          db.query('SELECT * FROM paper_assets WHERE paper_id = ?', [id]),
        ),
        paper_sections: mapRows<PaperSectionRow>(
          'paper_sections',
          db.query('SELECT * FROM paper_sections WHERE paper_id = ? ORDER BY order_no ASC', [id]),
        ),
        paper_items: paperItemsWithRelations(id),
      };
    },

    updatePaper(id, patch) {
      const sets: string[] = [];
      const params: SqlParam[] = [];
      if (patch.title !== undefined) {
        sets.push('title = ?');
        params.push(patch.title);
      }
      if (patch.status !== undefined) {
        sets.push('status = ?');
        params.push(patch.status);
      }
      if (patch.class_id !== undefined) {
        sets.push('class_id = ?');
        params.push(patch.class_id);
      }
      if (patch.subject_id !== undefined) {
        sets.push('subject_id = ?');
        params.push(patch.subject_id);
      }
      if (patch.total_points !== undefined) {
        sets.push('total_points = ?');
        params.push(patch.total_points);
      }
      if (patch.exam_date !== undefined) {
        sets.push('exam_date = ?');
        params.push(toEpoch(patch.exam_date));
      }

      if (sets.length === 0) {
        const current = getPaperRow(id);
        if (!current) throw missingRow('papers.update');
        return current;
      }

      params.push(id);
      const info = db.run(`UPDATE papers SET ${sets.join(', ')} WHERE id = ?`, params);
      if (info.changes === 0) throw missingRow('papers.update');
      return getPaperRow(id) as PaperRow;
    },

    countPaperItems(paperId) {
      const row = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM paper_items WHERE paper_id = ?', [paperId]);
      return Number(row?.n ?? 0);
    },

    deletePaperStructure(paperId) {
      // rubrics first: `rubric_points.paper_item_id` has no ON DELETE CASCADE, while
      // `paper_items.paper_id` does - so deleting the parent first would trip the FK.
      db.run(
        `DELETE FROM rubric_points WHERE paper_item_id IN (SELECT id FROM paper_items WHERE paper_id = ?)`,
        [paperId],
      );
      db.run('DELETE FROM paper_items WHERE paper_id = ?', [paperId]);
      db.run('DELETE FROM paper_sections WHERE paper_id = ?', [paperId]);
    },

    createPaperSection(paperId, title, orderNo) {
      const info = db.run(
        'INSERT INTO paper_sections (paper_id, title, order_no, created_at) VALUES (?, ?, ?, ?)',
        [paperId, title, orderNo, now()],
      );
      return mapRow<PaperSectionRow>(
        'paper_sections',
        db.get('SELECT * FROM paper_sections WHERE id = ?', [Number(info.lastInsertRowid)]),
      ) as PaperSectionRow;
    },

    createQuestion(input) {
      const info = db.run(
        `INSERT INTO questions
           (teacher_id, subject_id, stem, type, options_json, answer_json, explanation,
            difficulty, is_subjective, default_points, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.teacher_id,
          input.subject_id,
          input.stem,
          input.type,
          input.options_json,
          input.answer_json,
          input.explanation,
          input.difficulty,
          input.is_subjective,
          input.default_points,
          now(),
        ],
      );
      return Number(info.lastInsertRowid);
    },

    createPaperItem(input) {
      const info = db.run(
        `INSERT INTO paper_items
           (paper_id, section_id, question_id, order_no, points_override, difficulty_override, rubric_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.paper_id,
          input.section_id,
          input.question_id,
          input.order_no,
          input.points_override,
          input.difficulty_override,
          input.rubric_json,
          now(),
        ],
      );
      const created = getPaperItem(Number(info.lastInsertRowid)) as PaperItemRow;
      return { id: created.id, order_no: created.order_no };
    },

    createRubricPoint(input) {
      db.run(
        `INSERT INTO rubric_points (paper_item_id, label, points, keywords_json, step_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.paper_item_id, input.label, input.points, input.keywords_json, input.step_order, now()],
      );
    },

    getPaperStructure(id) {
      const paper = getPaperRow(id);
      if (!paper) return null;
      return {
        ...paper,
        paper_sections: mapRows<PaperSectionRow>(
          'paper_sections',
          db.query('SELECT * FROM paper_sections WHERE paper_id = ? ORDER BY order_no ASC', [id]),
        ),
        paper_items: paperItemsWithRelations(id),
      };
    },

    createPaperAsset(input) {
      const info = db.run(
        `INSERT INTO paper_assets (paper_id, kind, storage_path, mime, size, sha256, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [input.paper_id, input.kind, input.storage_path, input.mime, input.size, input.sha256, now()],
      );
      return mapRow<PaperAssetRow>(
        'paper_assets',
        db.get('SELECT * FROM paper_assets WHERE id = ?', [Number(info.lastInsertRowid)]),
      ) as PaperAssetRow;
    },

    // -- submissions --------------------------------------------------------

    createSubmission(paperId, studentId) {
      const stamp = now();
      const info = db.run(
        `INSERT INTO paper_submissions (paper_id, student_id, started_at, created_at) VALUES (?, ?, ?, ?)`,
        [paperId, studentId, stamp, stamp],
      );
      return mapRow<PaperSubmissionRow>(
        'paper_submissions',
        db.get('SELECT * FROM paper_submissions WHERE id = ?', [Number(info.lastInsertRowid)]),
      ) as PaperSubmissionRow;
    },

    getSubmission(id) {
      return mapRow<PaperSubmissionRow>(
        'paper_submissions',
        db.get('SELECT * FROM paper_submissions WHERE id = ?', [id]),
      );
    },

    getSubmissionWithAnswerSheet(id) {
      const submission = repository.getSubmission(id);
      if (!submission) return null;
      const paper = mapRow<PaperRow>('papers', db.get('SELECT * FROM papers WHERE id = ?', [submission.paper_id]));
      if (!paper) return null;
      return { ...submission, papers: paper, paper_answers: answersWithRelations(id) };
    },

    listPaperItemsWithRelations: paperItemsWithRelations,

    listPaperItemIds(paperId) {
      return db
        .query<{ id: number }>('SELECT id FROM paper_items WHERE paper_id = ?', [paperId])
        .map((row) => row.id);
    },

    getAnswerForItem(submissionId, paperItemId) {
      return (
        db.get<{ id: number }>(
          'SELECT id FROM paper_answers WHERE submission_id = ? AND paper_item_id = ?',
          [submissionId, paperItemId],
        ) ?? null
      );
    },

    updateAnswerInput(id, patch) {
      const sets: string[] = [];
      const params: SqlParam[] = [];
      if (patch.answer_json !== undefined) {
        sets.push('answer_json = ?');
        params.push(patch.answer_json);
      }
      if (patch.time_spent_sec !== undefined) {
        sets.push('time_spent_sec = ?');
        params.push(patch.time_spent_sec);
      }
      if (sets.length === 0) return;
      params.push(id);
      db.run(`UPDATE paper_answers SET ${sets.join(', ')} WHERE id = ?`, params);
    },

    createAnswer(input) {
      db.run(
        `INSERT INTO paper_answers (submission_id, paper_item_id, answer_json, time_spent_sec, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [input.submission_id, input.paper_item_id, input.answer_json, input.time_spent_sec, now()],
      );
    },

    markSubmissionSubmitted(id, submittedAt) {
      db.run('UPDATE paper_submissions SET submitted_at = ? WHERE id = ?', [toEpoch(submittedAt), id]);
    },

    createAnswerSheetRows(rows) {
      const stamp = now();
      for (const row of rows) {
        db.run(
          `INSERT INTO paper_answers
             (submission_id, paper_item_id, answer_json, score, is_correct, time_spent_sec, error_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.submission_id, row.paper_item_id, null, 0, 0, 0, null, stamp],
        );
      }
    },

    listAnswersWithRelations: answersWithRelations,

    updateAnswerScore(id, patch) {
      db.run('UPDATE paper_answers SET is_correct = ?, score = ? WHERE id = ?', [
        patch.is_correct,
        patch.score,
        id,
      ]);
    },

    // -- wrong questions ----------------------------------------------------

    listWrongQuestions(studentId) {
      return wrongQuestionsWithQuestion(
        'student_id = ? AND cleared_at IS NULL ORDER BY last_wrong_at DESC, id DESC',
        [studentId],
      );
    },

    getWrongQuestion(id) {
      return mapRow<WrongQuestionRow>(
        'wrong_questions',
        db.get('SELECT * FROM wrong_questions WHERE id = ?', [id]),
      );
    },

    getWrongQuestionForStudent(id, studentId) {
      const rows = wrongQuestionsWithQuestion('id = ? AND student_id = ?', [id, studentId]);
      return rows[0] ?? null;
    },

    getWrongQuestionByQuestion(studentId, questionId) {
      const rows = wrongQuestionsWithQuestion('student_id = ? AND question_id = ?', [studentId, questionId]);
      return rows[0] ?? null;
    },

    createWrongQuestion(input) {
      const stamp = now();
      db.run(
        `INSERT INTO wrong_questions
           (student_id, question_id, first_wrong_at, last_wrong_at, wrong_count, mastery_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [input.studentId, input.questionId, stamp, stamp, 1, 0, stamp, stamp],
      );
    },

    bumpWrongQuestion(id, patch) {
      const stamp = now();
      db.run(
        `UPDATE wrong_questions
            SET wrong_count = ?, last_wrong_at = ?, mastery_score = ?, cleared_at = NULL, updated_at = ?
          WHERE id = ?`,
        [patch.wrongCount, stamp, patch.masteryScore, stamp, id],
      );
    },

    recordWrongQuestionAttempt(id, patch) {
      db.run('UPDATE wrong_questions SET mastery_score = ?, cleared_at = ?, updated_at = ? WHERE id = ?', [
        patch.masteryScore,
        toEpoch(patch.clearedAt),
        now(),
        id,
      ]);
    },

    createWrongQuestionAttempt(input) {
      db.run(
        `INSERT INTO wrong_question_attempts (wrong_question_id, practice_source, is_correct, spent_sec, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [input.wrongQuestionId, input.practiceSource, input.isCorrect, input.spentSec, now()],
      );
    },

    listQuestionKnowledgeNodeIds(questionId) {
      return db
        .query<{ node_id: number }>('SELECT node_id FROM question_knowledge WHERE question_id = ?', [questionId])
        .map((row) => row.node_id);
    },

    listQuestionsByNodeIds(excludeQuestionId, nodeIds) {
      if (nodeIds.length === 0) return [];
      return mapRows<QuestionRow>(
        'questions',
        db.query(
          `SELECT * FROM questions
            WHERE id != ?
              AND id IN (SELECT question_id FROM question_knowledge WHERE node_id IN (${placeholders(nodeIds.length)}))
            ORDER BY id DESC LIMIT 5`,
          [excludeQuestionId, ...nodeIds],
        ),
      );
    },

    listQuestionsBySubjectType(excludeQuestionId, subjectId, type) {
      const parts = ['id != ?', 'type = ?'];
      const params: SqlParam[] = [excludeQuestionId, type];
      // Prisma's `subject_id: undefined` drops the filter entirely; that is what a
      // question with no subject must keep doing.
      if (subjectId !== null) {
        parts.splice(1, 0, 'subject_id = ?');
        params.splice(1, 0, subjectId);
      }
      return mapRows<QuestionRow>(
        'questions',
        db.query(`SELECT * FROM questions WHERE ${parts.join(' AND ')} ORDER BY id DESC LIMIT 5`, params),
      );
    },

    // -- study plans --------------------------------------------------------

    getActiveStudyPlan(studentId) {
      const plan = repository.getActiveStudyPlanRow(studentId);
      return studyPlanWithItems(plan);
    },

    getActiveStudyPlanRow(studentId) {
      return mapRow<StudyPlanRow>(
        'study_plans',
        db.get('SELECT * FROM study_plans WHERE student_id = ? AND status = ? ORDER BY id DESC LIMIT 1', [
          studentId,
          'active',
        ]),
      );
    },

    createStudyPlan(input) {
      const stamp = now();
      const info = db.run(
        `INSERT INTO study_plans (student_id, target_exam_date, target_score, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.student_id, toEpoch(input.target_exam_date), input.target_score, 'active', stamp, stamp],
      );
      return mapRow<StudyPlanRow>(
        'study_plans',
        db.get('SELECT * FROM study_plans WHERE id = ?', [Number(info.lastInsertRowid)]),
      ) as StudyPlanRow;
    },

    archiveActiveStudyPlans(studentId, archivedAt) {
      db.run(`UPDATE study_plans SET status = 'archived', updated_at = ? WHERE student_id = ? AND status = 'active'`, [
        toEpoch(archivedAt),
        studentId,
      ]);
    },

    getStudyPlanItemWithPlan(id) {
      const item = mapRow<StudyPlanItemRow>(
        'study_plan_items',
        db.get('SELECT * FROM study_plan_items WHERE id = ?', [id]),
      );
      if (!item) return null;
      const plan = mapRow<StudyPlanRow>('study_plans', db.get('SELECT * FROM study_plans WHERE id = ?', [item.plan_id]));
      if (!plan) return null;
      return { item, plan };
    },

    updateStudyPlanItem(id, status) {
      const info = db.run('UPDATE study_plan_items SET status = ? WHERE id = ?', [status, id]);
      if (info.changes === 0) throw missingRow('study_plan_items.update');
      return mapRow<StudyPlanItemRow>(
        'study_plan_items',
        db.get('SELECT * FROM study_plan_items WHERE id = ?', [id]),
      ) as StudyPlanItemRow;
    },

    listPendingPracticeItems(planId) {
      return db.query<{ id: number; question_id: number | null }>(
        `SELECT id, question_id FROM study_plan_items
          WHERE plan_id = ? AND kind = ? AND status = ?`,
        [planId, 'practice', 'pending'],
      );
    },

    createStudyPlanItem(input) {
      db.run(
        `INSERT INTO study_plan_items (plan_id, kind, question_id, estimated_min, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [input.plan_id, input.kind, input.question_id, input.estimated_min, input.status, now()],
      );
    },
  };

  return repository;
}
