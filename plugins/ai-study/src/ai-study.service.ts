/**
 * AiStudyService - the 智学 personalisation service.
 *
 * ## What it orchestrates
 *
 *   input            `classroom.public` (who the caller is, who is in the class)
 *   facts            `learning.public` (the candidate pool, the wrong-question book, the graph)
 *   ranking          `ai-study.engine.ts` (pure, deterministic - see that file)
 *   ordering+prose   `ai-study.ai.ts` (optional model, over the rule's own candidates)
 *   storage          `ai-study.repository.ts` (its own three tables)
 *   mastery write    `learning.public.recordPracticeOutcome` (the owner's arithmetic, not a copy)
 *
 * ## The two invariants worth stating
 *
 * **The set is always the rule's.** A model may reorder it and rewrite its reasons; it contributes no
 * question. A failure anywhere in the model path - not installed, unreachable, slow, unparseable -
 * leaves the rule's answer intact and reports `ai.available: false`, and the feature is fully usable
 * in that state. That is why the default deployment (`ai_provider=mock`) is not a degraded one.
 *
 * **Mastery is written by the owner, once per answer.** `judged_at` on the answer row is what makes
 * submitting twice harmless: a retry after a mid-loop failure judges only the answers that were never
 * judged, so one answer cannot move 错题本 twice.
 */

import { ApiError } from '@thinkclass/kernel';
import type { ClassroomPort } from '@thinkclass/contracts/domains/classroom';
import type { HomeworkAiPort } from '@thinkclass/contracts/domains/homework';
import type { LearningPort, LearningQuestionRef } from '@thinkclass/contracts/domains/learning';
import type {
  AiStudyAnsweredItem,
  AiStudyAssignResult,
  AiStudyClassInsight,
  AiStudyOutcome,
  AiStudySet,
  AiStudySetItem,
  AiStudySetResult,
  AiStudyStudentSuggestion,
  AiStudySubmitResult,
  AiStudyWeakNode,
} from '@thinkclass/contracts/domains/ai-study';

import { rerankWithModel } from './ai-study.ai.js';
import { ENGINE_VERSION, clampSize, rankCandidates } from './ai-study.engine.js';
import { parseFactors, type AiStudyRepository } from './ai-study.repository.js';
import type { AiStudyActor, AiStudyAuthorization } from './ai-study.authorization.js';
import type { EngineCandidate, EngineWeakNode, StudySetBundle, StudySetRow } from './ai-study.types.js';

/**
 * How many questions the rule scores to fill one set.
 *
 * A filter, not a page: the engine needs enough candidates that the type-balance pass and the
 * difficulty term have something to choose between, and 120 is well inside one indexed query. A
 * bigger number would not improve the answer - the top of a score-ordered list is decided by the
 * highest-weighted factors, not by how many also-rans were loaded.
 */
const CANDIDATE_POOL_LIMIT = 120;

/**
 * How many students the class board analyses in one request.
 *
 * Each student costs one signal read. A board is a screen a teacher opens between classes, so it is
 * bounded and it *says* it is bounded (`students_considered` vs `students_total`) rather than
 * silently showing the first page as if it were the class.
 */
const CLASS_STUDENT_LIMIT = 40;

/** How many students one dispatch may cover. A class-sized batch, not a district-sized one. */
const ASSIGN_STUDENT_LIMIT = 60;

/** The weak-node list on the board. Five is what a teacher can act on before the bell. */
const WEAK_NODE_LIMIT = 5;

/** The model's optional extra instruction. Long enough for a sentence, short enough to stay a prompt. */
const HINT_MAX_LENGTH = 200;

export interface AiStudyServiceDeps {
  repository: AiStudyRepository;
  classroom: ClassroomPort;
  learning: LearningPort;
  authorization: AiStudyAuthorization;
  /**
   * The borrowed model, resolved **per call**.
   *
   * A function rather than the port itself: `homework` is `required: false` and sorts after this
   * plugin, so a value captured during `setup()` would be `null` for the life of the process. This is
   * the trap `plugins/insights` and `plugins/payment` both record.
   */
  aiProvider: () => HomeworkAiPort | null;
}

/** The stored provenance of a set, as the wire shape reports it. */
function outcomeFromRow(set: StudySetRow): AiStudyOutcome {
  return {
    source: set.ai_source,
    available: Number(set.ai_available) === 1,
    // A stored set carries no confidence: the number would have to be invented on read, which is
    // exactly the kind of claim this domain refuses to make.
    confidence: null,
    message: set.ai_message,
  };
}

/** A number from a body field, or `null` for anything absent or unparseable. */
function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toEngineCandidate(ref: LearningQuestionRef, nodeIds: number[]): EngineCandidate {
  return {
    questionId: ref.id,
    type: ref.type,
    difficulty: ref.difficulty,
    points: ref.defaultPoints,
    subjectId: ref.subjectId,
    nodeIds,
    isSubjective: ref.isSubjective,
  };
}

export class AiStudyService {
  private readonly repository: AiStudyRepository;
  private readonly classroom: ClassroomPort;
  private readonly learning: LearningPort;
  private readonly authorization: AiStudyAuthorization;
  private readonly aiProvider: () => HomeworkAiPort | null;

  constructor(deps: AiStudyServiceDeps) {
    this.repository = deps.repository;
    this.classroom = deps.classroom;
    this.learning = deps.learning;
    this.authorization = deps.authorization;
    this.aiProvider = deps.aiProvider;
  }

  // -- reads ----------------------------------------------------------------

  /**
   * A set as the wire shape carries it.
   *
   * Items whose question cannot be resolved are **omitted**. A question can only vanish through the
   * admin account-deletion cascade, and the honest rendering of "this question is gone" is not a
   * blank row a student is asked to answer. Submitting still treats the item correctly: the owner
   * declines to judge a question it cannot read, so the item lands in `pending` rather than as a
   * wrong answer.
   */
  private async toWireSet(bundle: StudySetBundle): Promise<AiStudySet> {
    const questionIds = Array.from(new Set(bundle.items.map((item) => item.question_id)));
    const questions = await this.learning.listQuestionsByIds(questionIds);
    const byId = new Map(questions.map((question) => [question.id, question]));
    const answersByItem = new Map(bundle.answers.map((answer) => [answer.item_id, answer]));

    const items: AiStudySetItem[] = [];
    for (const item of bundle.items) {
      const question = byId.get(item.question_id);
      if (!question) continue;
      const answer = answersByItem.get(item.id);

      items.push({
        id: item.id,
        question_id: item.question_id,
        order_no: item.order_no,
        reason: item.reason,
        score: item.score,
        factors: parseFactors(item.factors_json),
        ai_ranked: Number(item.ai_ranked) === 1,
        question: {
          id: question.id,
          type: question.type,
          stem: question.stem,
          options: question.options,
          points: question.defaultPoints,
          difficulty: question.difficulty,
        },
        answer:
          answer && answer.answer_json !== null
            ? {
                value: answer.answer_json,
                is_correct: answer.is_correct === null || answer.is_correct === undefined ? null : Number(answer.is_correct) === 1,
              }
            : null,
      });
    }

    return {
      id: bundle.set.id,
      student_id: bundle.set.student_id,
      class_id: bundle.set.class_id,
      subject_id: bundle.set.subject_id,
      source: bundle.set.source,
      status: bundle.set.status,
      engine_version: bundle.set.engine_version,
      created_at: bundle.set.created_at,
      updated_at: bundle.set.updated_at,
      items,
    };
  }

  /** The student's open set, with its stored provenance. `set: null` is the normal empty state. */
  async currentMySet(actor: AiStudyActor): Promise<AiStudySetResult> {
    const student = await this.authorization.requireOwnStudent(actor);
    await this.authorization.assertStudentFeature(student.id);

    const open = this.repository.findOpenSet(student.id);
    if (!open) {
      return {
        set: null,
        ai: {
          source: this.providerSource(),
          available: false,
          confidence: null,
          message: '还没有进行中的智学练单，点击「生成今日智学」即可。',
        },
      };
    }

    const bundle = this.repository.loadBundle(open.id);
    if (!bundle) throw new ApiError(404, '练单不存在');
    return { set: await this.toWireSet(bundle), ai: outcomeFromRow(bundle.set) };
  }

  // -- generation -----------------------------------------------------------

  /**
   * The student's own practice set for today.
   *
   * Idempotent while a set is open: a second press returns the set that already exists rather than
   * replacing it. That is a product decision with a technical reason behind it - a student halfway
   * through five questions who presses the button again must not lose their answers, and the partial
   * unique index in the migration means "one open set" is enforced rather than hoped for.
   */
  async generateMySet(
    actor: AiStudyActor,
    input: { subject_id?: unknown; size?: unknown; hint?: unknown } | null,
  ): Promise<AiStudySetResult> {
    const student = await this.authorization.requireOwnStudent(actor);
    await this.authorization.assertStudentFeature(student.id);

    const existing = this.repository.findOpenSet(student.id);
    if (existing) {
      const bundle = this.repository.loadBundle(existing.id);
      if (bundle) {
        return {
          set: await this.toWireSet(bundle),
          ai: {
            ...outcomeFromRow(bundle.set),
            message: `已有一份进行中的智学练单（共 ${bundle.items.length} 题），先完成它再生成新的。`,
          },
        };
      }
    }

    const built = await this.buildSet({
      studentId: student.id,
      classId: student.classId ?? null,
      subjectId: optionalNumber(input?.subject_id),
      source: 'self',
      createdBy: null,
      size: clampSize(input?.size),
      hint: typeof input?.hint === 'string' ? input.hint.trim().slice(0, HINT_MAX_LENGTH) || null : null,
      excludeQuestionIds: [],
    });

    if (!built) {
      // The one case where no set is created. Persisting an empty set would block the student's next
      // attempt behind the "one open set" rule, which would turn "your question bank is empty" into
      // "智学 is stuck".
      return {
        set: null,
        ai: {
          source: this.providerSource(),
          available: false,
          confidence: null,
          message:
            '题库里还没有可用于智学的题目。请先在「试卷系统」或「作业管理」里录入题目，或让老师导入试卷后再试。',
        },
      };
    }

    const bundle = this.repository.loadBundle(built.set.id);
    if (!bundle) throw new ApiError(404, '练单不存在');
    return { set: await this.toWireSet(bundle), ai: built.ai };
  }

  /**
   * Rank a pool and persist a set, or `null` when there is nothing to rank.
   *
   * Shared by the student's own generation and a teacher's dispatch, because they differ only in
   * who is asking and what is recorded on the row - the ranking must not be able to drift between
   * the two paths.
   */
  private async buildSet(input: {
    studentId: number;
    classId: number | null;
    subjectId: number | null;
    source: string;
    createdBy: number | null;
    size: number;
    hint: string | null;
    excludeQuestionIds: number[];
  }): Promise<{ set: StudySetRow; ai: AiStudyOutcome } | null> {
    const signals = await this.learning.getStudentSignals(input.studentId);
    if (!signals) throw new ApiError(404, '学生未找到');

    const weakNodes: EngineWeakNode[] = signals.knowledgeProgress.map((node) => ({
      nodeId: node.nodeId,
      name: node.name,
      importance: node.importance,
      wrongCount: node.wrongCount,
    }));

    // The pool is deliberately *not* filtered to the weak nodes. A student whose whole book sits on
    // one node would otherwise practise that node and nothing else, and the engine's weak-node factor
    // already ranks towards those questions - as a preference rather than a filter.
    const pool = await this.learning.listCandidates({
      subjectId: input.subjectId,
      nodeIds: [],
      types: [],
      difficultyMin: null,
      difficultyMax: null,
      excludeQuestionIds: input.excludeQuestionIds,
      limit: CANDIDATE_POOL_LIMIT,
    });
    if (pool.length === 0) return null;

    const pairs = await this.learning.listQuestionKnowledgeMap(pool.map((question) => question.id));
    const nodesByQuestion = new Map<number, number[]>();
    for (const pair of pairs) {
      const list = nodesByQuestion.get(pair.questionId);
      if (list) list.push(pair.nodeId);
      else nodesByQuestion.set(pair.questionId, [pair.nodeId]);
    }

    const ranked = rankCandidates({
      candidates: pool.map((question) => toEngineCandidate(question, nodesByQuestion.get(question.id) ?? [])),
      wrongQuestions: signals.wrongQuestions,
      weakNodes,
      accuracy: signals.recentPaperAccuracy,
      excludeQuestionIds: input.excludeQuestionIds,
      size: input.size,
    });
    if (ranked.length === 0) return null;

    const reranked = await rerankWithModel({
      provider: this.aiProvider(),
      ranked,
      weakNodes,
      hint: input.hint,
    });

    const set = this.repository.createSet({
      studentId: input.studentId,
      classId: input.classId,
      subjectId: input.subjectId,
      source: input.source,
      createdBy: input.createdBy,
      engineVersion: ENGINE_VERSION,
      aiSource: reranked.ai.source,
      aiAvailable: reranked.ai.available,
      aiMessage: reranked.ai.message,
      items: reranked.ranked.map((item, index) => ({
        questionId: item.questionId,
        orderNo: index + 1,
        reason: item.reason,
        score: item.score,
        factors: item.factors,
        aiRanked: reranked.rankedByModel.has(item.questionId),
      })),
    });

    return { set, ai: reranked.ai };
  }

  // -- answering ------------------------------------------------------------

  /** Save (or replace) the student's answers for a set they own. */
  async saveAnswers(
    actor: AiStudyActor,
    setIdInput: unknown,
    body: { answers?: unknown } | null,
  ): Promise<AiStudySetResult> {
    const student = await this.authorization.requireOwnStudent(actor);
    await this.authorization.assertStudentFeature(student.id);

    const setId = Number(setIdInput);
    if (!Number.isFinite(setId)) throw new ApiError(400, 'Invalid id');

    const bundle = this.repository.loadBundle(setId);
    // 404, not 500. `plugins/learning`'s `_known_debt` records that a missing-row update answers 500
    // there, inherited from Prisma's P2025 translation; a new surface must not reproduce it.
    if (!bundle) throw new ApiError(404, '练单不存在');
    if (bundle.set.student_id !== student.id) throw new ApiError(403, '无权限操作该练单');
    if (bundle.set.status !== 'open') throw new ApiError(400, '该练单已提交，不能再修改作答');

    const incoming = Array.isArray(body?.answers) ? body.answers : [];
    const itemsById = new Map(bundle.items.map((item) => [item.id, item]));

    this.repository.transaction(() => {
      for (const entry of incoming) {
        if (!entry || typeof entry !== 'object') continue;
        const record = entry as { item_id?: unknown; value?: unknown; spent_sec?: unknown };
        const itemId = Number(record.item_id);
        const item = itemsById.get(itemId);
        // An item id from another set is ignored rather than refused: the set is identified by the
        // path, and a body that names foreign rows is a client bug, not an authorization event.
        if (!item) continue;

        const value = record.value === undefined || record.value === null ? null : String(record.value);
        const spent = optionalNumber(record.spent_sec);
        this.repository.upsertAnswer({
          setId,
          itemId,
          answerJson: value,
          spentSec: spent === null ? 0 : Math.max(0, Math.floor(spent)),
        });
      }
    });

    const updated = this.repository.loadBundle(setId);
    if (!updated) throw new ApiError(404, '练单不存在');
    return { set: await this.toWireSet(updated), ai: outcomeFromRow(updated.set) };
  }

  /**
   * Submit the set: judge every answer through the owner, then close it.
   *
   * Items with no saved answer are **not** judged and not counted wrong - skipping a question is not
   * the same claim as answering it incorrectly, and marking it wrong would move mastery for something
   * the student never said. They land in `pending`, which is also where a declined (subjective or
   * unconfigured) answer lands.
   */
  async submitSet(actor: AiStudyActor, setIdInput: unknown): Promise<AiStudySubmitResult> {
    const student = await this.authorization.requireOwnStudent(actor);
    await this.authorization.assertStudentFeature(student.id);

    const setId = Number(setIdInput);
    if (!Number.isFinite(setId)) throw new ApiError(400, 'Invalid id');

    const bundle = this.repository.loadBundle(setId);
    if (!bundle) throw new ApiError(404, '练单不存在');
    if (bundle.set.student_id !== student.id) throw new ApiError(403, '无权限操作该练单');

    const answersByItem = new Map(bundle.answers.map((answer) => [answer.item_id, answer]));

    for (const item of bundle.items) {
      const answer = answersByItem.get(item.id);
      // Already judged on a previous attempt that failed part-way. Re-judging would move mastery a
      // second time for the same answer - see `judged_at` in the migration.
      if (answer?.judged_at) continue;
      if (!answer || answer.answer_json === null || answer.answer_json.trim() === '') continue;

      const outcome = await this.learning.recordPracticeOutcome({
        studentId: student.id,
        questionId: item.question_id,
        answerJson: answer.answer_json,
        spentSec: answer.spent_sec,
        // Provenance for `wrong_question_attempts.practice_source`, so the book can say where a
        // mastery step came from.
        source: 'ai_study',
      });
      this.repository.recordVerdict(item.id, outcome.isCorrect, outcome.masteryScore);
    }

    this.repository.closeSet(setId);

    const finalBundle = this.repository.loadBundle(setId);
    if (!finalBundle) throw new ApiError(404, '练单不存在');

    const items: AiStudyAnsweredItem[] = finalBundle.items.map((item) => {
      const answer = finalBundle.answers.find((row) => row.item_id === item.id);
      return {
        item_id: item.id,
        question_id: item.question_id,
        is_correct: answer?.is_correct === null || answer?.is_correct === undefined ? null : Number(answer.is_correct) === 1,
        mastery_score: answer?.mastery_score ?? null,
      };
    });

    return {
      set_id: setId,
      total: finalBundle.items.length,
      correct: items.filter((item) => item.is_correct === true).length,
      pending: items.filter((item) => item.is_correct === null).length,
      items,
      ai: outcomeFromRow(finalBundle.set),
    };
  }

  // -- the teacher's board --------------------------------------------------

  /**
   * Which knowledge nodes this class is collectively missing, and what each student should do next.
   *
   * Aggregation only - no model call. A board is read between classes and must answer immediately;
   * the numbers come from the same signals the engine uses, so what the teacher sees is what the
   * engine would act on rather than a second summary.
   */
  async classInsight(actor: AiStudyActor, classIdInput: unknown): Promise<AiStudyClassInsight> {
    const classId = Number(classIdInput);
    if (!Number.isFinite(classId)) throw new ApiError(400, 'Invalid classId');
    await this.authorization.assertClassAccess(actor, classId, '无权限查看该班级智学');
    await this.authorization.assertClassFeature(classId);

    const klass = await this.classroom.getClassById(classId);
    if (!klass) throw new ApiError(404, '班级未找到');

    const roster = await this.classroom.listClassStudents(classId);
    const considered = roster.slice(0, CLASS_STUDENT_LIMIT);
    const openSets = this.repository.listOpenSetIdsForStudents(considered.map((student) => student.id));

    interface NodeTotal {
      node_id: number;
      name: string;
      importance: number | null;
      wrong_count: number;
      student_count: number;
    }
    const nodeTotals = new Map<number, NodeTotal>();
    const suggestions: AiStudyStudentSuggestion[] = [];

    for (const student of considered) {
      const signals = await this.learning.getStudentSignals(student.id);
      if (!signals) continue;

      for (const node of signals.knowledgeProgress) {
        const total = nodeTotals.get(node.nodeId) ?? {
          node_id: node.nodeId,
          name: node.name,
          importance: node.importance,
          wrong_count: 0,
          student_count: 0,
        };
        total.wrong_count += node.wrongCount;
        total.student_count += 1;
        nodeTotals.set(node.nodeId, total);
      }

      // The student's worst node: wrong questions first, then the node the graph says matters, then
      // id - so the board is stable between two reads of the same class.
      const top = signals.knowledgeProgress
        .slice()
        .sort((a, b) => b.wrongCount - a.wrongCount || (b.importance ?? 0) - (a.importance ?? 0) || a.nodeId - b.nodeId)[0];

      const openSetId = openSets.get(student.id) ?? null;
      const wrongTotal = signals.wrongQuestions.length;

      suggestions.push({
        student_id: student.id,
        name: student.name,
        top_node_id: top?.nodeId ?? null,
        top_node_name: top?.name ?? null,
        wrong_count: wrongTotal,
        open_set_id: openSetId,
        reason: top
          ? `「${top.name}」错了 ${top.wrongCount} 次，建议先练这一块。`
          : '暂无错题记录，可以生成一份难度适中的练习。',
      });
    }

    const weakNodes: AiStudyWeakNode[] = [...nodeTotals.values()]
      .sort(
        (a, b) =>
          b.wrong_count - a.wrong_count ||
          (b.importance ?? 0) - (a.importance ?? 0) ||
          a.node_id - b.node_id,
      )
      .slice(0, WEAK_NODE_LIMIT);

    return {
      class_id: classId,
      students_considered: considered.length,
      students_total: roster.length,
      weak_nodes: weakNodes,
      suggestions,
      ai: {
        source: this.providerSource(),
        // The board is arithmetic, and saying so is the point: a teacher reading "AI 未参与" here is
        // being told the truth about a screen that never needed a model.
        available: false,
        confidence: null,
        message: '班级智学看板由本地规则汇总，不调用模型。',
      },
    };
  }

  /**
   * Dispatch a practice set to selected students.
   *
   * Per-student failure isolation, the same posture `AiGenerateOutcome.skipped` records for 出题: one
   * student who already has a set, or whose row was removed while the teacher had the page open, must
   * not void a dispatch to the other twenty-nine. Each failure comes back with a reason the board can
   * print next to the name.
   */
  async assign(actor: AiStudyActor, classIdInput: unknown, body: Record<string, unknown> | null): Promise<AiStudyAssignResult> {
    const classId = Number(classIdInput);
    if (!Number.isFinite(classId)) throw new ApiError(400, 'Invalid classId');
    await this.authorization.assertClassAccess(actor, classId, '无权限派发该班级练单');
    await this.authorization.assertClassFeature(classId);

    const raw = Array.isArray(body?.student_ids) ? (body?.student_ids as unknown[]) : [];
    const studentIds = Array.from(
      new Set(raw.map((value) => Number(value)).filter((value) => Number.isFinite(value))),
    );
    if (studentIds.length === 0) throw new ApiError(400, '缺少 student_ids');
    if (studentIds.length > ASSIGN_STUDENT_LIMIT) {
      throw new ApiError(400, `一次最多派发 ${ASSIGN_STUDENT_LIMIT} 名学生`);
    }

    const subjectId = optionalNumber(body?.subject_id);
    const size = clampSize(body?.size);
    const hint =
      typeof body?.hint === 'string' ? body.hint.trim().slice(0, HINT_MAX_LENGTH) || null : null;

    const created: Array<{ student_id: number; set_id: number }> = [];
    const failed: Array<{ student_id: number; reason: string }> = [];
    let lastAi: AiStudyOutcome | null = null;

    for (const studentId of studentIds) {
      try {
        // Membership is re-checked per student: an id in the body is the caller's claim, and the
        // class roster is the fact.
        await this.authorization.assertStudentInClass(studentId, classId);

        if (this.repository.findOpenSet(studentId)) {
          failed.push({ student_id: studentId, reason: '该学生已有进行中的智学练单' });
          continue;
        }

        const built = await this.buildSet({
          studentId,
          classId,
          subjectId,
          source: 'assigned',
          createdBy: actor.id,
          size,
          hint,
          excludeQuestionIds: [],
        });

        if (!built) {
          failed.push({ student_id: studentId, reason: '题库里还没有可用于智学的题目' });
          continue;
        }

        lastAi = built.ai;
        created.push({ student_id: studentId, set_id: built.set.id });
      } catch (error) {
        failed.push({
          student_id: studentId,
          reason: error instanceof ApiError ? error.message : '生成失败，请稍后重试',
        });
      }
    }

    return {
      class_id: classId,
      created,
      failed,
      ai:
        lastAi ??
        (created.length === 0 && failed.length > 0
          ? {
              source: this.providerSource(),
              available: false,
              confidence: null,
              message: '本次没有生成任何练单，原因见列表。',
            }
          : {
              source: this.providerSource(),
              available: false,
              confidence: null,
              message: '已按本地规则生成练单。',
            }),
    };
  }

  // -- helpers --------------------------------------------------------------

  /** The model that *would* answer, for provenance on paths that do not call it. */
  private providerSource(): string {
    const provider = this.aiProvider();
    if (!provider) return 'none';
    try {
      return provider.getAiState().provider;
    } catch {
      // A port that cannot answer a status question must not be able to fail a whole request.
      return 'unknown';
    }
  }
}
