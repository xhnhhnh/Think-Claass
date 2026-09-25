/**
 * homework service - every rule about who may do what to which row.
 *
 * ## Authorization is two layers, and this is the second
 *
 * The controllers gate the *route*: 401 for a caller nobody verified, 403 for a role the route does
 * not list. This layer then decides what a permitted caller may actually see or touch, because a
 * role gate alone answers "may this kind of user call this endpoint" and not "may this particular
 * teacher grade this particular pupil's work". Every method takes the actor the controller resolved
 * from the kernel's request context and narrows to what that actor owns:
 *
 *   * a teacher to rows carrying their own `teacher_id` - the ownership anchor these tables store,
 *     which is also how 本班 is expressed here;
 *   * a student or parent to the `studentId` the kernel resolved for their login, with a query
 *     naming someone else's row *refused* (403) rather than silently ignored;
 *   * admin / superadmin to everything.
 *
 * `teacher_id` and `student_id` on a create are derived from the actor and a body copy is
 * discarded: the legacy path trusted `input.teacher_id`, so an authenticated teacher could file
 * work under a colleague's name.
 *
 * ## The one rule that is not obvious
 *
 * `score` is never written directly. It is always *derived* - `teacher_score` when the teacher has
 * set one, otherwise `ai_score` - by `recomputeAnswerScore` and `recomputeSubmissionScore`. That is
 * what keeps "the AI proposed 4 and the teacher accepted it" distinguishable from "the AI proposed
 * 4 and the teacher changed it to 2", which is the only signal that says whether the model is worth
 * trusting. A method that assigned `score` on its own would destroy that, so none does.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { ApiError } from '@thinkclass/kernel';
import type {
  HomeworkAiGeneratePayload,
  HomeworkAiGenerateResult,
  HomeworkAiGradePayload,
  HomeworkAiGradeResult,
  HomeworkAiOutcome,
  HomeworkAiState,
  HomeworkAnswer,
  HomeworkAnswerValue,
  HomeworkAttemptDetail,
  HomeworkDetail,
  HomeworkGradePayload,
  HomeworkGradeRow,
  HomeworkListEntry,
  HomeworkOption,
  HomeworkPhoto,
  HomeworkPublishPayload,
  HomeworkQaMessage,
  HomeworkQaResult,
  HomeworkQuestion,
  HomeworkQuestionPayload,
  HomeworkQuestionType,
  HomeworkReferenceAnswer,
  HomeworkStudentEntry,
  HomeworkSubmission,
  HomeworkSubmissionStatus,
  HomeworkSubmitPayload,
  HomeworkUpdatePayload,
} from '@thinkclass/contracts/domains/homework';

import type { RequestActor } from './homework.authorization.js';
import {
  answerHasPhoto,
  describeAnswer,
  resolveHomeworkProvider,
  type AiAnswerInput,
  type AiQuestionInput,
} from './homework.ai.js';
import { gradeObjectiveAnswer, isObjectiveType } from './homework.grading.js';
import { GENERATABLE_TYPES, isGeneratableType } from './homework.templates.js';
import type { HomeworkRepository } from './homework.repository.js';
import type {
  HomeworkAnswerRow,
  HomeworkListRow,
  HomeworkQaRow,
  HomeworkQuestionInput,
  HomeworkQuestionRow,
  HomeworkRow,
  HomeworkScope,
  HomeworkSubmissionRow,
} from './homework.types.js';

/** The upload size ceiling, in bytes. A phone photo is well under this; a video is not allowed. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** The MIME types a submission photo may have. */
const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

const QUESTION_TYPES: ReadonlySet<string> = new Set(['single', 'multiple', 'blank', 'short']);
const HOMEWORK_STATUSES: ReadonlySet<string> = new Set(['draft', 'published', 'closed']);
const QA_MAX_LENGTH = 2000;
/** How many prior turns are replayed to the model, so a thread cannot grow without bound. */
const QA_HISTORY_TURNS = 8;
/** How long a 出题主题 may be. Long enough for a topic sentence, short enough to stay a prompt. */
const AI_TOPIC_MAX_LENGTH = 500;
/** The most questions one generation may ask for, and the most existing stems it may be given. */
const AI_GENERATE_MAX = 20;
const AI_AVOID_MAX = 40;

export interface HomeworkServiceOptions {
  repository: HomeworkRepository;
  /** Reverses at-rest encryption for `students.name`, injected by the host. */
  decryptName?: (value: string) => string;
  /** Where submission photos are written. Defaults to `<cwd>/uploads/homework`, as papers do. */
  uploadsDir?: string;
  /** The platform settings reader the AI provider is resolved from. */
  settings?: { getPlatform?<T = unknown>(key: string): T | undefined };
}

export class HomeworkService {
  constructor(private readonly options: HomeworkServiceOptions) {}

  private get repository(): HomeworkRepository {
    return this.options.repository;
  }

  // -- authorization helpers ----------------------------------------------

  /** The roles that own every row: the platform operator's escape hatch. */
  private isAdminRole(actor: RequestActor): boolean {
    return actor.role === 'admin' || actor.role === 'superadmin';
  }

  /**
   * The actor's user id, or 401.
   *
   * The controllers already refuse an anonymous caller, so this is the service-level belt for
   * direct callers (tests, a future non-HTTP caller): it fails closed instead of letting a `null`
   * id become the `teacher_id` of a new row.
   */
  private requireActorId(actor: RequestActor): number {
    if (actor.id === null || !Number.isFinite(actor.id)) throw new ApiError(401, '未登录或登录已过期');
    return actor.id;
  }

  /** The student row this login owns, resolved by the kernel - never from the request. */
  private requireOwnStudentId(actor: RequestActor): number {
    if (actor.studentId === null || !Number.isFinite(actor.studentId)) {
      throw new ApiError(403, '当前账号未绑定学生');
    }
    return actor.studentId;
  }

  private requireOwnClassId(actor: RequestActor): number {
    if (actor.classId === null || !Number.isFinite(actor.classId)) {
      throw new ApiError(403, '当前账号未绑定班级');
    }
    return actor.classId;
  }

  /** 403 unless the actor is the teacher who owns this homework; admin/superadmin always pass. */
  private ensureHomeworkOwner(actor: RequestActor, homework: HomeworkRow, message: string): void {
    if (this.isAdminRole(actor)) return;
    if (actor.role !== 'teacher' || actor.id === null || homework.teacher_id !== actor.id) {
      throw new ApiError(403, message);
    }
  }

  /**
   * Load a homework or 404.
   *
   * A legacy row (one the read bridge surfaced) is deliberately NOT reachable through this: it has
   * no questions, no submissions and no `p_homework_*` row to write, so every write path must
   * refuse it with a message that says why rather than half-succeeding.
   */
  private getHomeworkOr404(id: number): HomeworkRow {
    const homework = this.repository.getHomework(id);
    if (!homework) throw new ApiError(404, '作业不存在');
    return homework;
  }

  // -- serialization -------------------------------------------------------

  /**
   * A question row with its JSON columns parsed.
   *
   * Defensive rather than trusting: these columns are written by this service, but a row created by
   * the data migration or by hand could hold anything. A malformed `options_json` yields `[]` and a
   * malformed `answer_json` yields `{}`, so one bad row cannot take down a whole paper.
   */
  private toQuestion(row: HomeworkQuestionRow): HomeworkQuestion {
    return {
      id: row.id,
      assignment_id: row.assignment_id,
      order_no: row.order_no,
      type: (QUESTION_TYPES.has(row.type) ? row.type : 'short') as HomeworkQuestionType,
      stem: row.stem,
      options: parseJsonArray<HomeworkOption>(row.options_json),
      reference: parseJsonObject<HomeworkReferenceAnswer>(row.answer_json),
      explanation: row.explanation,
      points: row.points,
      created_at: row.created_at,
    };
  }

  private toAnswer(row: HomeworkAnswerRow): HomeworkAnswer {
    return {
      id: row.id,
      submission_id: row.submission_id,
      question_id: row.question_id,
      value: parseJsonObject<HomeworkAnswerValue>(row.answer_json),
      score: row.score,
      is_correct: row.is_correct,
      auto_score: row.auto_score,
      auto_source: row.auto_source,
      ai_score: row.ai_score,
      ai_comment: row.ai_comment,
      ai_confidence: row.ai_confidence,
      ai_source: row.ai_source,
      teacher_score: row.teacher_score,
      teacher_comment: row.teacher_comment,
      updated_at: row.updated_at,
    };
  }

  private toSubmission(row: HomeworkSubmissionRow): HomeworkSubmission {
    return {
      id: row.id,
      assignment_id: row.assignment_id,
      student_id: row.student_id,
      status: row.status,
      submitted_at: row.submitted_at,
      score: row.score,
      total_points: row.total_points,
      teacher_feedback: row.teacher_feedback,
      ai_feedback: row.ai_feedback,
      ai_confidence: row.ai_confidence,
      graded_by: row.graded_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * A homework row as the list shape.
   *
   * `row.question_count ?? 0` is a fallback rather than the source of truth: the list queries compute
   * the count in SQL, while `getHomework` reads a bare row (`SELECT *`) that has no such column. The
   * two paths callers see are also the two paths that must agree, so `toDetail` sets the field from
   * the questions it has just loaded rather than letting this fallback report 0 on a detail read.
   */
  private toListEntry(row: HomeworkListRow): HomeworkListEntry {
    return {
      id: row.id,
      class_id: row.class_id,
      teacher_id: row.teacher_id,
      title: row.title,
      description: row.description,
      due_at: row.due_at,
      status: row.status,
      total_points: row.total_points,
      reward_points: row.reward_points,
      ...(row.legacy ? { legacy: true as const } : {}),
      created_at: row.created_at,
      updated_at: row.updated_at,
      question_count: row.question_count ?? 0,
    };
  }

  private toDetail(homework: HomeworkListRow): HomeworkDetail {
    const questions = this.repository.listQuestions(homework.id).map((row) => this.toQuestion(row));
    // The count comes from the questions just loaded, not from the row: `getHomework` reads a bare
    // row with no `question_count` column, and without this a freshly published homework would report
    // `question_count: 0` on the very response that created it.
    return { ...this.toListEntry({ ...homework, question_count: questions.length }), questions };
  }

  /**
   * The composite an attempt view and the grading panel both render.
   *
   * Answers are joined to their parsed value and returned in question order, so the client never
   * has to correlate two arrays by id. Questions the pupil has not answered are simply absent from
   * `answers` - an empty answer row would be a claim that they answered with nothing.
   */
  private buildAttempt(
    homework: HomeworkRow,
    submission: HomeworkSubmissionRow,
    questions: HomeworkQuestion[],
  ): HomeworkAttemptDetail {
    const answerByQuestion = new Map(
      this.repository.listAnswers(submission.id).map((row) => [row.question_id, this.toAnswer(row)]),
    );
    const ordered = questions
      .map((question) => answerByQuestion.get(question.id))
      .filter((answer): answer is HomeworkAnswer => Boolean(answer));

    return {
      homework: {
        ...this.toListEntry({ ...homework, question_count: questions.length } as HomeworkListRow),
        questions,
      },
      submission: this.toSubmission(submission),
      answers: ordered,
      photos: this.repository.listPhotos(submission.id),
    };
  }

  // -- AI ------------------------------------------------------------------

  /**
   * The provider, resolved per call.
   *
   * Deliberately not cached on the instance: the admin console can change `ai_provider` while the
   * process runs, and a cached provider would keep using the old one until a restart - which reads
   * to the operator as "saving the setting did nothing".
   */
  private ai() {
    return resolveHomeworkProvider(this.options.settings);
  }

  /** Fill `HomeworkAiOutcome`, which every AI-bearing response carries. */
  private aiOutcome(source: string, available: boolean, message: string, confidence: number | null): HomeworkAiOutcome {
    return { source, available, confidence, message };
  }

  /**
   * The provider's resolved state, for `plugins/admin`'s AI panel.
   *
   * `provider` is the resolved source rather than the requested one on purpose: `resolveHomeworkProvider`
   * falls back to the mock when `ai_provider=http` is missing its base URL or key, and a state line
   * that echoed the *request* would tell the operator their model was in use when the mock was
   * answering. `reason` is that fallback's explanation, or null when no fallback happened.
   *
   * Reads the settings on every call - and destroys nothing - so an operator who has just saved a
   * key sees the new state without a restart, which is the same reason `ai()` is not cached.
   */
  getAiState(): HomeworkAiState {
    const { provider, reason } = this.ai();
    return {
      provider: provider.source,
      available: provider.available(),
      reason,
      message: reason ?? provider.state(),
    };
  }

  /**
   * A round trip to the configured model, for the console's 测试连接 button.
   *
   * Never throws: an unreachable model is a result the operator reads, not a 500 - the same posture
   * as `HomeworkAiOutcome`. `createMockProvider` answers `ok: true` with its own state line, because
   * the mock *is* a working configuration here and calling it a failure would be a lie that sends
   * the operator hunting for a problem that does not exist.
   */
  async testAiConnection(): Promise<{ ok: boolean; message: string }> {
    const { provider, reason } = this.ai();
    if (reason) return { ok: false, message: reason };
    return provider.testConnection();
  }

  /**
   * One borrowed completion for another plugin's AI surface (`plugins/ai-study`).
   *
   * Two things this deliberately does *not* do. It does not impose its own failure policy - the
   * provider answers `text: null, available: false` with a line, and this passes that through
   * untouched, because the caller has its own deterministic result to fall back on and only it knows
   * what to say about it. And it does not cache the provider: an operator who fixes a key in the
   * console must see the next 智选 use the new model, not the one loaded at boot.
   *
   * The prompt is the caller's. Nothing here names a 智学 concept, which is what keeps this port a
   * model gateway rather than a second homework surface.
   */
  completeFor(request: { system: string; user: string; maxTokens?: number; timeoutMs?: number }) {
    return this.ai().provider.complete(request);
  }

  /** One question as the provider sees it. */
  private toAiQuestion(row: HomeworkQuestionRow): AiQuestionInput {
    const question = this.toQuestion(row);
    return {
      question_id: question.id,
      type: question.type,
      stem: question.stem,
      options: question.options,
      reference: question.reference,
      rubric: rubricOf(question),
      points: question.points,
    };
  }

  // -- homework: reads -----------------------------------------------------

  /**
   * `GET /api/homework` - teacher/admin（限本班）, student（本班已发布）.
   *
   * The class filter comes from the actor for a student and intersects with the teacher's own rows
   * for a teacher, so a `class_id` naming a class the caller has no claim on cannot widen the
   * answer. A student additionally sees only `published`/`closed` homework: unlike the legacy
   * `assignments` table, this one has a status, so 本班已发布 is expressible and enforced instead of
   * being noted as impossible.
   */
  listHomeworks(actor: RequestActor, classIdInput?: unknown): HomeworkListEntry[] {
    const classId = optionalPositiveInteger(classIdInput, 'class_id');

    if (this.isAdminRole(actor)) {
      return this.bridgeHomeworks({ classId }, classId, undefined);
    }

    if (actor.role === 'teacher') {
      const teacherId = this.requireActorId(actor);
      return this.bridgeHomeworks({ classId, teacherId }, classId, teacherId);
    }

    if (actor.role === 'student') {
      const ownClass = this.requireOwnClassId(actor);
      if (classId !== undefined && classId !== ownClass) throw new ApiError(403, '无权限查看该班级作业');
      return this.repository
        .listHomeworks({ classId: ownClass, status: 'published' })
        .map((row) => this.toListEntry(row));
    }

    throw new ApiError(403, '无权限执行该操作');
  }

  /**
   * The new rows plus any legacy rows the migration has not copied yet.
   *
   * Ordered by `created_at` after concatenation rather than merged in SQL: the two tables have
   * different shapes and no shared key, and doing the union in JavaScript keeps the boundary between
   * "our rows" and "their rows" visible in the code instead of hiding it inside a `UNION ALL` that
   * the ownership checker would have to reason about.
   */
  private bridgeHomeworks(
    scope: HomeworkScope,
    legacyClassId: number | undefined,
    legacyTeacherId: number | undefined,
  ): HomeworkListEntry[] {
    const own = this.repository.listHomeworks(scope).map((row) => this.toListEntry(row));
    const legacy = this.repository
      .listLegacyHomeworks({ classId: legacyClassId, teacherId: legacyTeacherId })
      .map((row) => this.toListEntry(row));

    return [...own, ...legacy].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  }

  /** `GET /api/homework/my` - a student's own list, with their attempt status on each row. */
  listMyHomeworks(actor: RequestActor): HomeworkStudentEntry[] {
    if (actor.role !== 'student' && actor.role !== 'parent') {
      throw new ApiError(403, '无权限执行该操作');
    }
    const studentId = this.requireOwnStudentId(actor);
    const ownClass = this.requireOwnClassId(actor);

    const own: HomeworkStudentEntry[] = this.repository
      .listHomeworks({ classId: ownClass, status: 'published' })
      .map((row) => ({
        homework: this.toListEntry(row),
        submission: this.repository.getSubmissionByStudent(row.id, studentId)
          ? this.toSubmission(this.repository.getSubmissionByStudent(row.id, studentId)!)
          : null,
        question_count: row.question_count ?? 0,
      }));

    // Legacy rows are listed with a null submission: they have no submission table to read, and
    // reporting one as "not submitted" would be inventing state. The `legacy` flag tells the UI to
    // say "迁移前的旧作业" instead of offering an attempt it cannot start.
    const legacy: HomeworkStudentEntry[] = this.repository
      .listLegacyHomeworksForStudent(studentId)
      .map((row) => ({
        homework: this.toListEntry(row),
        submission: null,
        question_count: 0,
      }));

    return [...own, ...legacy].sort((a, b) =>
      String(b.homework.created_at ?? '').localeCompare(String(a.homework.created_at ?? '')),
    );
  }

  /**
   * `GET /api/homework/:id` - staff, or a student of the class it is set for.
   *
   * A draft is invisible to a student: the teacher's editing surface is not a preview surface, and
   * showing unpublished work would make 草稿 meaningless.
   */
  getHomework(actor: RequestActor, idInput: unknown): HomeworkDetail {
    const id = positiveInteger(idInput, 'id');
    const homework = this.getHomeworkOr404(id);

    if (this.isAdminRole(actor)) return this.toDetail(homework as HomeworkListRow);

    if (actor.role === 'teacher') {
      this.ensureHomeworkOwner(actor, homework, '无权限查看该作业');
      return this.toDetail(homework as HomeworkListRow);
    }

    if (actor.role === 'student') {
      const ownClass = this.requireOwnClassId(actor);
      if (homework.class_id !== ownClass) throw new ApiError(403, '无权限查看该作业');
      if (homework.status === 'draft') throw new ApiError(403, '该作业尚未发布');
      return this.toDetail(homework as HomeworkListRow);
    }

    throw new ApiError(403, '无权限执行该操作');
  }

  // -- homework: writes ----------------------------------------------------

  /**
   * `POST /api/homework` - teacher/admin.
   *
   * `teacher_id` is the actor's id; a body copy is ignored rather than validated, because it is not
   * a claim the caller is allowed to make. The whole insert - the homework and its questions, with
   * `total_points` summed from them - is one transaction, so a paper that fails halfway does not
   * leave a homework with a partial question list and a total that disagrees with it.
   */
  createHomework(actor: RequestActor, input: HomeworkPublishPayload): HomeworkDetail {
    const classId = positiveInteger(input?.class_id, 'class_id');
    const teacherId = this.requireActorId(actor);
    const title = requireTitle(input?.title);
    const status = normaliseHomeworkStatus(input?.status) ?? 'draft';
    const questions = normaliseQuestions(input?.questions);

    const id = this.repository.transaction(() => {
      const homeworkId = this.repository.createHomework({
        class_id: classId,
        teacher_id: teacherId,
        title,
        description: emptyToNull(input?.description),
        due_at: emptyToNull(input?.due_at),
        status,
        total_points: totalPoints(questions),
        reward_points: nonNegativeInt(input?.reward_points) ?? 0,
      });
      this.writeQuestions(homeworkId, questions);
      return homeworkId;
    });

    return this.getHomework({ id: teacherId, role: actor.role, studentId: null, classId: null }, id);
  }

  /**
   * `PUT /api/homework/:id` - teacher（归属者）/admin.
   *
   * `questions` present replaces the question list: ids that still exist are updated in place, new
   * ones are inserted and the rest are deleted. Updating in place rather than delete-all-and-insert
   * is what preserves the answers already written against a question - a delete would cascade them
   * away, so "fix a typo in the stem" would silently erase the class's work.
   *
   * When a question IS deleted its answers go with it (the foreign key cascades), and the affected
   * submissions have to be re-totalled because their `total_points` was computed from a list that
   * no longer exists. `questions` absent leaves the questions untouched entirely.
   */
  updateHomework(actor: RequestActor, idInput: unknown, input: HomeworkUpdatePayload): HomeworkDetail {
    const id = positiveInteger(idInput, 'id');
    const homework = this.getHomeworkOr404(id);
    this.ensureHomeworkOwner(actor, homework, '无权限修改该作业');

    const title = input?.title === undefined ? undefined : requireTitle(input.title);
    const status = input?.status === undefined ? undefined : normaliseHomeworkStatus(input.status);
    if (input?.status !== undefined && status === undefined) throw new ApiError(400, 'status 无效');

    const hasQuestions = input?.questions !== undefined;
    const questions = hasQuestions ? normaliseQuestions(input.questions) : [];

    this.repository.transaction(() => {
      this.repository.updateHomework(id, {
        ...(title !== undefined ? { title } : {}),
        ...(input?.description !== undefined ? { description: emptyToNull(input.description) } : {}),
        ...(input?.due_at !== undefined ? { due_at: emptyToNull(input.due_at) } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(input?.reward_points !== undefined ? { reward_points: nonNegativeInt(input.reward_points) ?? 0 } : {}),
        ...(hasQuestions ? { total_points: totalPoints(questions) } : {}),
      });

      if (hasQuestions) {
        const keptIds = this.writeQuestions(id, questions);
        this.deleteMissingQuestions(id, keptIds);
        this.retotalSubmissions(id);
      }
    });

    return this.getHomework({ id: this.requireActorId(actor), role: actor.role, studentId: null, classId: null }, id);
  }

  /** `DELETE /api/homework/:id` - teacher（归属者）/admin. */
  deleteHomework(actor: RequestActor, idInput: unknown) {
    const id = positiveInteger(idInput, 'id');
    const homework = this.getHomeworkOr404(id);
    this.ensureHomeworkOwner(actor, homework, '无权限删除该作业');
    this.repository.deleteHomework(id);
    return { deleted: true };
  }

  // -- questions -----------------------------------------------------------

  /**
   * Write a question list, returning the ids that survived.
   *
   * One transaction with the caller's, because `DbApi.tx` joins an outer transaction rather than
   * nesting: a failure half way through a ten-question paper leaves the previous state intact.
   */
  private writeQuestions(assignmentId: number, questions: HomeworkQuestionInput[]): number[] {
    const kept: number[] = [];
    questions.forEach((question, index) => {
      const orderNo = index + 1;
      if (question.id !== undefined) {
        // The id must belong to this homework: otherwise a crafted payload could re-point another
        // teacher's question into this paper to read its reference answer.
        const existing = this.repository.getQuestion(question.id);
        if (!existing || existing.assignment_id !== assignmentId) {
          throw new ApiError(400, `题目 ${question.id} 不属于该作业`);
        }
        this.repository.updateQuestion(question.id, orderNo, question);
        kept.push(question.id);
        return;
      }
      kept.push(this.repository.createQuestion(assignmentId, orderNo, question));
    });
    return kept;
  }

  /** Questions dropped by an edit are deleted, which cascades their answers away. */
  private deleteMissingQuestions(assignmentId: number, keptIds: number[]): void {
    const keep = new Set(keptIds);
    for (const questionId of this.repository.listQuestionIds(assignmentId)) {
      if (!keep.has(questionId)) this.repository.deleteQuestion(questionId);
    }
  }

  /**
   * Re-total every submission of a homework after its question list changed.
   *
   * Without this a pupil's `total_points` would still count a deleted question, and their score
   * would be shown against a denominator that no longer exists - 8/20 on a paper now worth 15.
   */
  private retotalSubmissions(assignmentId: number): void {
    const total = totalPointsFromRows(this.repository.listQuestions(assignmentId));
    for (const submission of this.repository.listSubmissions(assignmentId)) {
      this.repository.updateSubmission(submission.id, { total_points: total });
    }
  }

  // -- attempts and answers -------------------------------------------------

  /**
   * `POST /api/homework/:id/attempt` - student.
   *
   * Idempotent: an existing submission is returned as-is, so a page refresh continues the attempt
   * instead of creating a second one. The table's `UNIQUE(assignment_id, student_id)` is what
   * actually guarantees this; this method's read is the fast path.
   */
  startAttempt(actor: RequestActor, idInput: unknown): HomeworkAttemptDetail {
    if (actor.role !== 'student') throw new ApiError(403, '只有学生可以作答');
    const id = positiveInteger(idInput, 'id');
    const studentId = this.requireOwnStudentId(actor);
    const homework = this.getHomeworkOr404(id);

    if (homework.status === 'draft') throw new ApiError(403, '该作业尚未发布');
    if (homework.status === 'closed') {
      // A closed homework still lets a pupil who already started open their attempt - they need to
      // see what they wrote and what the teacher said. Only a NEW attempt is refused.
      const existing = this.repository.getSubmissionByStudent(id, studentId);
      if (!existing) throw new ApiError(403, '该作业已截止');
    }
    if (actor.classId !== null && homework.class_id !== actor.classId) {
      throw new ApiError(403, '无权限作答该作业');
    }

    const questions = this.repository.listQuestions(id).map((row) => this.toQuestion(row));

    // Idempotent: an existing attempt is returned rather than a second one being created. The
    // table's `UNIQUE(assignment_id, student_id)` is the real guarantee - this read is the fast
    // path, and the insert is wrapped so a concurrent double-click cannot raise a constraint error
    // at the pupil. The created row is re-read rather than assembled by hand, so there is one
    // definition of what a fresh submission looks like and it is the database's.
    let submission = this.repository.getSubmissionByStudent(id, studentId);
    if (!submission) {
      const createdId = this.repository.transaction(() =>
        this.repository.createSubmission({
          assignment_id: id,
          student_id: studentId,
          status: 'draft',
          total_points: totalPointsFromQuestions(questions),
        }),
      );
      submission = this.repository.getSubmission(createdId);
    }
    if (!submission) throw new ApiError(500, '创建作答记录失败');

    return this.buildAttempt(homework, submission, questions);
  }

  /** 403 unless this submission belongs to the actor's own student row. */
  private requireOwnSubmission(actor: RequestActor, submissionId: number): HomeworkSubmissionRow {
    if (actor.role !== 'student') throw new ApiError(403, '只有学生可以作答');
    const studentId = this.requireOwnStudentId(actor);
    const submission = this.repository.getSubmission(submissionId);
    if (!submission) throw new ApiError(404, '提交记录不存在');
    if (submission.student_id !== studentId) throw new ApiError(403, '无权限操作该提交');
    return submission;
  }

  /**
   * A submission may only be edited while it is a draft or has been returned for fixing.
   *
   * Checked on every student write rather than only on submit: allowing answers to change after
   * submission would let a pupil alter their work while it waits to be graded, which is the one
   * thing a submission is supposed to prevent.
   */
  private ensureEditable(submission: HomeworkSubmissionRow): void {
    if (submission.status === 'submitted') throw new ApiError(400, '已提交，等待批改，无法修改');
    if (submission.status === 'graded') throw new ApiError(400, '已批改，无法修改');
  }

  /**
   * `PUT /api/homework/submissions/:id/answers` - student, their own submission.
   *
   * Answers for questions that belong to a *different* homework are refused rather than ignored:
   * silently dropping them would make an auto-save look like it worked while the pupil's answer
   * went nowhere.
   */
  saveAnswers(actor: RequestActor, idInput: unknown, input: { answers?: unknown }) {
    const id = positiveInteger(idInput, 'id');
    const submission = this.requireOwnSubmission(actor, id);
    this.ensureEditable(submission);

    const answers = normaliseAnswerInputs(input?.answers);
    if (answers.length === 0) throw new ApiError(400, '没有需要保存的作答');

    const validQuestionIds = new Set(this.repository.listQuestionIds(submission.assignment_id));
    const unknown = answers.filter((answer) => !validQuestionIds.has(answer.question_id));
    if (unknown.length > 0) {
      throw new ApiError(400, `题目不属于该作业：${unknown.map((answer) => answer.question_id).join('、')}`);
    }

    this.repository.transaction(() => {
      for (const answer of answers) this.repository.upsertAnswer(id, answer);
    });

    return this.attemptById(submission);
  }

  /**
   * `POST /api/homework/submissions/:id/submit` - student.
   *
   * Accepts the final answer list, because a pupil pressing 提交 is the one moment the client is
   * certainly holding their last edits: relying on a separate auto-save having landed first would
   * make "submit" occasionally submit stale work. The answers are written before the status flips,
   * in one transaction, so a submission is never marked submitted with half its answers applied.
   *
   * Objective questions are then scored immediately, because that is a fact the server knows; short
   * answers are left at `score: null` for the teacher or the AI. A row is created for every question
   * - including the blank ones - so the grade sheet shows a line to fill rather than a gap the
   * teacher has to notice.
   */
  submitAttempt(actor: RequestActor, idInput: unknown, input?: HomeworkSubmitPayload): HomeworkAttemptDetail {
    const id = positiveInteger(idInput, 'id');
    const submission = this.requireOwnSubmission(actor, id);
    this.ensureEditable(submission);

    const rows = this.repository.listQuestions(submission.assignment_id);
    if (rows.length === 0) throw new ApiError(400, '该作业还没有题目');

    const answers = normaliseAnswerInputs(input?.answers);
    const validQuestionIds = new Set(rows.map((row) => row.id));
    const unknown = answers.filter((answer) => !validQuestionIds.has(answer.question_id));
    if (unknown.length > 0) {
      throw new ApiError(400, `题目不属于该作业：${unknown.map((answer) => answer.question_id).join('、')}`);
    }

    const photoIds = normaliseIds(input?.photo_ids);
    this.assertOwnPhotos(id, photoIds);

    this.repository.transaction(() => {
      for (const answer of answers) this.repository.upsertAnswer(id, answer);
      // A blank row for every question, so grading never has to invent one.
      this.repository.ensureAnswerRows(id, rows.map((row) => row.id));
      this.repository.updateSubmission(id, {
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        total_points: totalPointsFromRows(rows),
      });
    });

    this.autoScoreObjective(id, rows);
    this.recomputeSubmissionScore(id);

    return this.attemptById(this.repository.getSubmission(id)!);
  }

  /**
   * Score every objective answer of a submission from its question's reference answer.
   *
   * Uses the same `gradeObjectiveAnswer` the AI provider's mock uses, so "the auto-grade agrees with
   * the AI" holds by construction rather than by coincidence. An answer the grader declines to judge
   * (unanswered, or a question with no reference configured) is left alone rather than written as 0 -
   * a 0 is a claim, and the teacher is the one entitled to make it.
   */
  private autoScoreObjective(submissionId: number, questionRows: HomeworkQuestionRow[]): void {
    // Photos attached to a *specific* question, which are that question's answer. Whole-submission
    // photos are deliberately not counted here: a pupil who photographs their paper AND picks the
    // right option for question 1 has answered question 1, and skipping it would discard a mark they
    // earned. `answerHasPhoto` is the same predicate the AI provider declines on, so the two graders
    // cannot disagree about which questions a photograph speaks for.
    const photoIds = this.photoIdsByQuestion(submissionId);

    for (const row of questionRows) {
      if (!isObjectiveType(row.type)) continue;
      const answer = this.repository.getAnswerForQuestion(submissionId, row.id);
      if (!answer) continue;

      const value = parseJsonObject<HomeworkAnswerValue>(answer.answer_json);

      if (answerHasPhoto(value, photoIds.get(row.id) ?? 0)) {
        // A returned submission can be answered a *different* way the second time: a pupil who
        // picked option b and now photographs their working has replaced their answer, and the score
        // the old answer earned has to go with it. Leaving it would show a stale mark that no longer
        // corresponds to anything the pupil wrote - and the AI pass runs on this very submission, so
        // the two graders would then disagree about the same question.
        if (answer.auto_score !== null || answer.is_correct !== null) {
          this.repository.updateAnswerAuto(answer.id, {
            auto_score: null,
            auto_source: 'auto',
            is_correct: null,
            score: effectiveScore(answer.teacher_score, answer.ai_score, null),
          });
        }
        continue;
      }

      const question = this.toQuestion(row);
      const result = gradeObjectiveAnswer(
        { type: question.type, points: question.points, reference: question.reference },
        value,
      );
      if (result.score === null) continue;

      this.repository.updateAnswerAuto(answer.id, {
        auto_score: result.score,
        auto_source: 'auto',
        score: effectiveScore(answer.teacher_score, answer.ai_score, result.score),
        is_correct: result.isCorrect === null ? null : result.isCorrect ? 1 : 0,
      });
    }
  }

  /** How many photos each question carries, from the `photo_ids` its answer names. */
  private photoIdsByQuestion(submissionId: number): Map<number, number> {
    const counts = new Map<number, number>();
    for (const answer of this.repository.listAnswers(submissionId)) {
      const value = parseJsonObject<HomeworkAnswerValue>(answer.answer_json);
      const count = value.photo_ids?.length ?? 0;
      if (count > 0) counts.set(answer.question_id, count);
    }
    return counts;
  }

  /**
   * Photos named in a submit payload must belong to this submission.
   *
   * Without this check a pupil could name another pupil's photo id and have it stored as their
   * answer - the ids are sequential integers, so guessing one is trivial. Refused rather than
   * filtered, so a client bug shows up instead of silently dropping the pupil's photo.
   */
  private assertOwnPhotos(submissionId: number, photoIds: number[]): void {
    if (photoIds.length === 0) return;
    const owned = new Set(this.repository.listPhotos(submissionId).map((photo) => photo.id));
    const foreign = photoIds.filter((photoId) => !owned.has(photoId));
    if (foreign.length > 0) throw new ApiError(403, `照片不属于本次提交：${foreign.join('、')}`);
  }

  // -- photos ---------------------------------------------------------------

  /**
   * `POST /api/homework/submissions/:id/photos` - student, the 拍照题 half.
   *
   * Same shape as `plugins/learning`'s paper-asset upload: multer lands the file in the OS temp
   * directory and this method moves it into `uploads/homework`, which `api/app.ts` serves
   * statically. The digest is stored so a duplicate upload can be spotted, and the MIME type is
   * checked against an allow-list rather than trusted: an upload route that accepts anything is a
   * file host, and this one writes into a directory the web server exposes.
   */
  uploadPhoto(
    actor: RequestActor,
    idInput: unknown,
    file: { path: string; originalname: string; mimetype: string; size: number } | undefined,
  ): HomeworkPhoto {
    const id = positiveInteger(idInput, 'id');
    const submission = this.requireOwnSubmission(actor, id);
    this.ensureEditable(submission);

    if (!file) throw new ApiError(400, '缺少上传文件');
    if (!ALLOWED_PHOTO_MIME.has(String(file.mimetype).toLowerCase())) {
      throw new ApiError(400, '只支持 jpg / png / webp / heic 格式的照片');
    }
    if (file.size > MAX_PHOTO_BYTES) {
      throw new ApiError(400, `照片不能超过 ${Math.floor(MAX_PHOTO_BYTES / 1024 / 1024)}MB`);
    }

    const targetDir = this.options.uploadsDir ?? path.join(process.cwd(), 'uploads', 'homework');
    fs.mkdirSync(targetDir, { recursive: true });

    const extension = extensionFor(file.mimetype, file.originalname);
    const fileName = `${crypto.randomUUID()}${extension}`;
    const targetPath = path.join(targetDir, fileName);
    fs.copyFileSync(file.path, targetPath);
    fs.unlinkSync(file.path);

    const digest = crypto.createHash('sha256').update(fs.readFileSync(targetPath)).digest('hex');
    const photoId = this.repository.createPhoto({
      submission_id: id,
      storage_path: `/uploads/homework/${fileName}`,
      mime: file.mimetype,
      size: file.size,
      sha256: digest,
      uploaded_by: actor.id,
    });

    const photo = this.repository.listPhotos(id).find((row) => row.id === photoId);
    if (!photo) throw new ApiError(500, '照片保存失败');
    return photo;
  }

  // -- reads for the grade sheet and the attempt ----------------------------

  /**
   * `GET /api/homework/:id/submissions` - teacher（归属者）/admin: the whole class's sheet.
   *
   * Unlike the legacy exams route, every pupil of the class appears - including those who have not
   * started - because "who has not submitted" is the question a teacher opens this screen to answer.
   * A missing submission is returned with a synthetic `draft` row and a null score rather than being
   * omitted, so the sheet has one row per pupil and no holes to notice.
   */
  listSubmissions(actor: RequestActor, idInput: unknown): HomeworkGradeRow[] {
    const id = positiveInteger(idInput, 'id');
    const homework = this.getHomeworkOr404(id);
    this.ensureHomeworkOwner(actor, homework, '无权限查看该作业成绩');

    const existing = new Map(
      this.repository.listGradeSheet(id).map((row) => [row.submission.student_id, row]),
    );

    // One row per pupil of the class, with the name coming from the roster rather than from the
    // submission join: a pupil who never started has no submission row to join, and labelling them
    // `学生 #11` when their name is right there would be a worse answer for no reason.
    return this.repository.listRosterOfClass(homework.class_id).map((pupil) => {
      const row = existing.get(pupil.id);
      if (row) return { submission: this.toSubmission(row.submission), student_name: row.student_name };
      return {
        submission: {
          id: 0,
          assignment_id: id,
          student_id: pupil.id,
          status: 'draft' as HomeworkSubmissionStatus,
          submitted_at: null,
          score: null,
          total_points: homework.total_points,
          teacher_feedback: null,
          ai_feedback: null,
          ai_confidence: null,
          graded_by: null,
          created_at: null,
          updated_at: null,
        },
        // `id: 0` is the marker for "no submission yet": the attempt routes are keyed on a real row,
        // so the UI must not offer to open this one. Recorded as a comment because a zero id is
        // otherwise indistinguishable from a bug.
        student_name: pupil.name,
      };
    });
  }

  /**
   * `GET /api/homework/submissions/:id` - the pupil themselves, their parent, or the owning teacher.
   *
   * A parent is allowed through the same path as the student because the kernel resolves their
   * `studentId` to their own child; the check below is therefore the same one for both, and a parent
   * cannot read another family's submission by naming its id.
   */
  getSubmission(actor: RequestActor, idInput: unknown): HomeworkAttemptDetail {
    const id = positiveInteger(idInput, 'id');
    const submission = this.repository.getSubmission(id);
    if (!submission) throw new ApiError(404, '提交记录不存在');

    const homework = this.getHomeworkOr404(submission.assignment_id);

    if (this.isAdminRole(actor)) return this.attemptById(submission);

    if (actor.role === 'teacher') {
      this.ensureHomeworkOwner(actor, homework, '无权限查看该提交');
      return this.attemptById(submission);
    }

    if (actor.role === 'student' || actor.role === 'parent') {
      const own = this.requireOwnStudentId(actor);
      if (submission.student_id !== own) throw new ApiError(403, '无权限查看该提交');
      return this.attemptById(submission);
    }

    throw new ApiError(403, '无权限执行该操作');
  }

  private attemptById(submission: HomeworkSubmissionRow): HomeworkAttemptDetail {
    const homework = this.getHomeworkOr404(submission.assignment_id);
    const questions = this.repository.listQuestions(submission.assignment_id).map((row) => this.toQuestion(row));
    return this.buildAttempt(homework, submission, questions);
  }

  // -- grading --------------------------------------------------------------

  /**
   * `PUT /api/homework/submissions/:id` - teacher（归属者）.
   *
   * The teacher's number always wins: `updateAnswerTeacher` writes `teacher_score`, and
   * `effectiveScore` recomputes `score` from it. Setting `status` to `graded` publishes both the
   * score and the feedback to the pupil, which is why it is a separate explicit step rather than
   * implied by writing a mark - a teacher part way through a sheet must not publish it.
   */
  gradeSubmission(actor: RequestActor, idInput: unknown, input: HomeworkGradePayload): HomeworkAttemptDetail {
    const id = positiveInteger(idInput, 'id');
    const submission = this.repository.getSubmission(id);
    if (!submission) throw new ApiError(404, '提交记录不存在');
    const homework = this.getHomeworkOr404(submission.assignment_id);
    this.ensureHomeworkOwner(actor, homework, '无权限批改该提交');

    const status = input?.status;
    if (status !== undefined && status !== 'graded' && status !== 'returned') {
      throw new ApiError(400, 'status 只能是 graded 或 returned');
    }

    const entries = Array.isArray(input?.answers) ? input.answers : [];
    for (const entry of entries) {
      const score = entry.teacher_score;
      if (score !== null && score !== undefined && (!Number.isFinite(Number(score)) || Number(score) < 0)) {
        throw new ApiError(400, '分数必须是非负数');
      }
    }

    this.repository.transaction(() => {
      for (const entry of entries) {
        const answerId = positiveInteger(entry.answer_id, 'answer_id');
        const answer = this.repository.listAnswers(id).find((row) => row.id === answerId);
        if (!answer) throw new ApiError(400, `作答 ${answerId} 不属于该提交`);

        const question = this.repository.getQuestion(answer.question_id);
        const max = question?.points ?? 0;
        const raw = entry.teacher_score === null || entry.teacher_score === undefined ? null : Number(entry.teacher_score);
        if (raw !== null && raw > max) {
          // Refused rather than clamped: a teacher typing 20 into a 5-point question has made a
          // mistake, and silently storing 5 would let the grade sheet disagree with what they saw.
          throw new ApiError(400, `分数不能超过该题满分（${max}）`);
        }

        this.repository.updateAnswerTeacher(answerId, {
          teacher_score: raw,
          teacher_comment: entry.teacher_comment ?? null,
          score: effectiveScore(raw, answer.ai_score, answer.auto_score),
        });
      }

      if (input?.teacher_feedback !== undefined || status !== undefined) {
        this.repository.updateSubmission(id, {
          ...(input?.teacher_feedback !== undefined ? { teacher_feedback: emptyToNull(input.teacher_feedback) } : {}),
          ...(status !== undefined ? { status } : {}),
          // `graded_by` records who produced the final number, which is what makes an override
          // auditable later: 'teacher' means a human set every mark, 'ai+teacher' that the model
          // proposed and a human revised.
          ...(status === 'graded' ? { graded_by: this.gradedByFor(id) } : {}),
        });
      }

      if (status === 'graded') this.recomputeSubmissionScore(id);
    });

    return this.attemptById(this.repository.getSubmission(id)!);
  }

  /**
   * `teacher` when no model was involved, `ai+teacher` when one was.
   *
   * Reads `ai_score`, NOT `auto_score`. That distinction is the whole reason the two columns exist:
   * the deterministic grader runs on every submission whether or not an AI provider is configured,
   * so counting it here made `graded_by` report `ai+teacher` on a deployment with no model at all -
   * telling the operator the AI had helped when nothing had.
   */
  private gradedByFor(submissionId: number): string {
    const answers = this.repository.listAnswers(submissionId).filter((row) => row.score !== null);
    if (answers.length === 0) return 'teacher';
    return answers.some((row) => row.ai_score !== null) ? 'ai+teacher' : 'teacher';
  }

  /**
   * Recompute a submission's total from its answers, and write it.
   *
   * The denominator comes from the homework's own question list rather than from the answers, so a
   * pupil who left questions blank is still marked out of the whole paper - the scores of the
   * missing rows are null and `sum` treats them as 0, which is the intended reading of "they did
   * not answer it".
   */
  private recomputeSubmissionScore(submissionId: number): void {
    const submission = this.repository.getSubmission(submissionId);
    if (!submission) return;
    const rows = this.repository.listQuestions(submission.assignment_id);
    const answers = this.repository.listAnswers(submissionId);

    const total = totalPointsFromRows(rows);
    const scored = answers.filter((row) => row.score !== null);
    const score = scored.length === 0 ? null : scored.reduce((sum, row) => sum + (row.score ?? 0), 0);

    this.repository.updateSubmission(submissionId, { score, total_points: total });
  }

  // -- AI grading -----------------------------------------------------------

  /**
   * `POST /api/homework/:id/ai-grade` - teacher（归属者）.
   *
   * Writes ONLY the `ai_*` columns plus (when the teacher has not marked the question) `score`.
   * `teacher_score` is never touched unless the caller explicitly set `overwrite_teacher`, because a
   * batch AI run silently undoing a teacher's decisions is the failure that would make the feature
   * untrustworthy. The default is therefore `false`, and the flag's name says what it does.
   *
   * Returns the graded submission and all of its answers so the panel can re-render without a second
   * fetch, and an `HomeworkAiOutcome` describing the provider - `available: false` with a message is
   * a success payload, not an error, because the teacher's write has already succeeded.
   */
  async aiGrade(actor: RequestActor, idInput: unknown, input: HomeworkAiGradePayload): Promise<HomeworkAiGradeResult[]> {
    const homeworkId = positiveInteger(idInput, 'id');
    const homework = this.getHomeworkOr404(homeworkId);
    this.ensureHomeworkOwner(actor, homework, '无权限批改该作业');

    const overwrite = input?.overwrite_teacher === true;
    const requestedIds = Array.isArray(input?.submission_ids)
      ? input.submission_ids.map((value) => positiveInteger(value, 'submission_ids'))
      : [];

    const all = this.repository.listSubmissions(homeworkId);
    // Only submitted (or already-graded) attempts are graded. A draft is a pupil still working, and
    // grading it would produce marks for an answer they are about to change.
    const targets =
      requestedIds.length > 0
        ? all.filter((row) => requestedIds.includes(row.id))
        : all.filter((row) => row.status === 'submitted' || row.status === 'graded');

    if (requestedIds.length > 0) {
      const found = new Set(targets.map((row) => row.id));
      const missing = requestedIds.filter((id) => !found.has(id));
      if (missing.length > 0) throw new ApiError(404, `提交记录不存在或不属于该作业：${missing.join('、')}`);
    }

    const { provider, reason } = this.ai();
    const questionRows = this.repository.listQuestions(homeworkId);
    if (questionRows.length === 0) throw new ApiError(400, '该作业还没有题目，无法判分');

    const results: HomeworkAiGradeResult[] = [];

    for (const submission of targets) {
      const answers = this.repository.listAnswers(submission.id);
      const photos = this.repository.listPhotos(submission.id);

      const aiQuestions = questionRows.map((row) => this.toAiQuestion(row));
      const aiAnswers: AiAnswerInput[] = answers.map((row) => {
        const value = parseJsonObject<HomeworkAnswerValue>(row.answer_json);
        return {
          question_id: row.question_id,
          value,
          // Whole-submission photos count towards every question, which is why a paper of photos
          // with no typed answer has every question declined rather than scored as blank.
          photoCount: photos.length + (value.photo_ids?.length ?? 0),
        };
      });

      const outcome = await provider.grade({ questions: aiQuestions, answers: aiAnswers });
      const lineByQuestion = new Map(outcome.lines.map((line) => [line.question_id, line]));

      this.repository.transaction(() => {
        for (const answer of answers) {
          const line = lineByQuestion.get(answer.question_id);
          if (!line) continue;

          const keepTeacher = answer.teacher_score !== null && !overwrite;
          // Clearing the teacher's mark is what `overwrite_teacher: true` means - leaving the column
          // intact while `score` moved to the AI's number would leave a row whose stored teacher mark
          // no longer agrees with the score shown, which is worse than either choice.
          const teacherScore = keepTeacher ? answer.teacher_score : null;

          this.repository.updateAnswerAi(answer.id, {
            ai_score: line.score,
            ai_comment: line.comment,
            ai_confidence: line.confidence,
            ai_source: provider.source,
            // Passed explicitly so `overwrite_teacher` can actually clear the mark. See the
            // repository method: without this parameter the column silently kept its old value while
            // `score` moved on, which is the one state a grade sheet must never be in.
            teacher_score: teacherScore,
            score: effectiveScore(teacherScore, line.score, answer.auto_score),
            // `is_correct` is only claimed where the objective grader agrees; a short answer has no
            // boolean truth, so the AI's opinion must not be recorded as one.
            is_correct: correctnessOf(questionRows, answer.question_id, line.score),
          });
        }

        this.repository.updateSubmission(submission.id, {
          ai_feedback: outcome.feedback,
          ai_confidence: outcome.confidence,
          ...(overwrite ? { graded_by: 'ai' } : {}),
        });
        this.recomputeSubmissionScore(submission.id);
      });

      results.push({
        submission: this.toSubmission(this.repository.getSubmission(submission.id)!),
        answers: this.repository.listAnswers(submission.id).map((row) => this.toAnswer(row)),
        ai: this.aiOutcome(
          provider.source,
          provider.available(),
          reason ? `${reason}（已回退到模拟判分）` : outcome.message,
          outcome.confidence,
        ),
      });
    }

    return results;
  }

  // -- AI question generation ----------------------------------------------

  /**
   * `POST /api/homework/ai/questions` - 出题, teacher（作业归属者 for an edit）/admin.
   *
   * ## Why this route is not under `/:id`
   *
   * Generation happens in the *publish* dialog, where the homework does not exist yet, and in the
   * edit dialog, where it does - and the two want identical behaviour. Keying the route on an id
   * would mean two routes (one that can see the row and one that cannot) or a client that has to
   * know which it is holding. Nothing here reads or writes a row, so the id would only ever be
   * context, and `context_title` already carries that.
   *
   * ## What it guarantees about its output
   *
   * Every candidate goes through `normaliseQuestions` - the *same* validation the teacher's own
   * publish payload passes through. That is the invariant worth stating: a generated question that
   * the manual editor would have refused to save cannot reach a paper through this route either, and
   * there is only one definition of a valid question in the codebase rather than a laxer one for
   * whatever a model happened to emit.
   *
   * Nothing is persisted. The candidates are returned for the dialog to insert, and they are written
   * only when the teacher presses 发布/保存 - so an abandoned generation leaves no rows, and a
   * generation cannot mutate a paper the teacher is still editing.
   *
   * Generation is teacher-only even though the plugin's other AI routes are shared: this is
   * authoring, not assistance, and there is no student-facing counterpart to it.
   */
  async generateQuestions(
    actor: RequestActor,
    input: HomeworkAiGeneratePayload,
  ): Promise<HomeworkAiGenerateResult> {
    if (!this.isAdminRole(actor) && actor.role !== 'teacher') {
      throw new ApiError(403, '只有老师可以出题');
    }
    this.requireActorId(actor);

    const topic = String(input?.topic ?? '').trim();
    if (!topic) throw new ApiError(400, '请填写出题主题');
    if (topic.length > AI_TOPIC_MAX_LENGTH) {
      throw new ApiError(400, `出题主题不能超过 ${AI_TOPIC_MAX_LENGTH} 字`);
    }

    const requestedCount = Number(input?.count ?? 5);
    if (!Number.isFinite(requestedCount) || requestedCount < 1) {
      throw new ApiError(400, '出题数量至少为 1');
    }
    // Clamped rather than refused: a client that asks for 50 is making a reasonable request the
    // server declines to spend on, and failing the whole call for it would be pedantry. The cap is
    // also what keeps one generation from filling a dialog with a paper nobody will read.
    const count = Math.min(Math.floor(requestedCount), AI_GENERATE_MAX);

    // Normalised through a local rather than compared inline: the contract types `type` as the union
    // of question types, so `=== ''` is a comparison the compiler is right to question - but a request
    // body is untrusted data, and a form that submits an empty select must mean "no preference"
    // rather than "题型无效".
    const rawType: unknown = input?.type;
    const type = rawType === undefined || rawType === null || rawType === '' ? null : String(rawType);
    // Only the three templated types: 简答题 is authored by hand (its answer is prose and its marking
    // is a rubric, which is exactly what a template cannot pin down), so asking for one is refused
    // with that reason rather than silently generating something else.
    if (type !== null && !isGeneratableType(type)) {
      throw new ApiError(400, `${type} 不支持 AI 出题，可选：${GENERATABLE_TYPES.join(' / ')}`);
    }
    // Narrowed here rather than at the provider: this is the boundary where an untrusted body turns
    // into a typed request, so the compiler can prove below that the prompt asks for a template that
    // exists.
    const generatableType = isGeneratableType(type) ? type : null;

    const avoid = Array.isArray(input?.avoid)
      ? input.avoid
          .map((stem) => String(stem ?? '').trim())
          .filter(Boolean)
          .slice(0, AI_AVOID_MAX)
      : [];

    const { provider, reason } = this.ai();
    if (reason) {
      // A misconfigured `http` provider is not a generation-capable one, and the mock refuses by
      // design - so this returns the same "not available" shape instead of asking the mock for a
      // paper it will not write.
      return {
        questions: [],
        skipped: 0,
        ai: this.aiOutcome(provider.source, false, reason, 0),
      };
    }

    const outcome = await provider.generateQuestions({
      topic,
      type: generatableType,
      count,
      grade: emptyToNull(input?.grade),
      hint: emptyToNull(input?.hint),
      contextTitle: emptyToNull(input?.context_title),
      avoid,
    });

    const usable = provider.available() ? this.toValidatedCandidates(outcome.questions) : [];

    return {
      questions: usable,
      skipped: outcome.skipped + (outcome.questions.length - usable.length),
      ai: this.aiOutcome(
        provider.source,
        provider.available() && usable.length > 0,
        outcome.message,
        usable.length > 0 ? null : 0,
      ),
    };
  }

  /**
   * Run candidates through the manual path's own validation, dropping the ones it refuses.
   *
   * `normaliseQuestions` throws on the first problem - which is right for a hand-written payload,
   * because a teacher needs to be told which of *their* rows is wrong, and wrong at all for a model
   * reply, where one malformed candidate out of ten must not discard the other nine. So they are
   * validated one at a time and the failures are counted, not raised.
   *
   * The count is folded into `skipped` by the caller, so "6 generated, 4 usable" is reported as the
   * truth rather than silently trimmed to "4 generated".
   */
  private toValidatedCandidates(questions: HomeworkQuestionPayload[]): HomeworkQuestionPayload[] {
    const usable: HomeworkQuestionPayload[] = [];
    for (const question of questions) {
      try {
        const [validated] = normaliseQuestions([{ ...question, id: undefined }]);
        if (validated) usable.push(validated);
      } catch {
        // Counted by the caller; a per-question reason would be a wall of JSON in the dialog.
      }
    }
    return usable;
  }

  // -- AI Q&A ---------------------------------------------------------------

  /**
   * `GET /api/homework/:id/qa` - the thread for one pupil.
   *
   * A teacher may read a pupil's thread only by naming them, and the id they name is checked against
   * the resolved `studentId` for a student or parent. `ai: null` here is deliberate: reading history
   * involves no provider, and reporting an AI outcome for a call that never happened would be noise.
   */
  listQa(actor: RequestActor, idInput: unknown, studentIdInput?: unknown): HomeworkQaResult {
    const homeworkId = positiveInteger(idInput, 'id');
    const homework = this.getHomeworkOr404(homeworkId);
    const studentId = this.resolveQaStudentId(actor, homework, studentIdInput);

    return {
      messages: this.repository.listQa(homeworkId, studentId).map((row) => this.toQaMessage(row)),
      ai: null,
    };
  }

  /**
   * `POST /api/homework/:id/qa` - ask the AI about this homework.
   *
   * The reply is persisted alongside the question, so a pupil can come back to an explanation rather
   * than having to ask again - and so a teacher can see what the assistant told them.
   *
   * Unlike grading, a provider failure here IS thrown: an answer is the entire point of the request,
   * and a stored quote with no answer under it would read as a broken thread. The stored pupil
   * message survives that, which is the honest outcome - they asked, and the answer failed.
   */
  async askQa(actor: RequestActor, idInput: unknown, input: { content?: unknown; question_id?: unknown }): Promise<HomeworkQaResult> {
    const homeworkId = positiveInteger(idInput, 'id');
    const homework = this.getHomeworkOr404(homeworkId);
    const studentId = this.resolveQaStudentId(actor, homework, undefined);

    const content = String(input?.content ?? '').trim();
    if (!content) throw new ApiError(400, '请输入你的问题');
    if (content.length > QA_MAX_LENGTH) throw new ApiError(400, `问题不能超过 ${QA_MAX_LENGTH} 字`);

    const questionRows = this.repository.listQuestions(homeworkId);
    const focusId = input?.question_id === undefined ? null : positiveInteger(input.question_id, 'question_id');
    const focusRow = focusId === null ? null : questionRows.find((row) => row.id === focusId) ?? null;
    if (focusId !== null && !focusRow) throw new ApiError(400, '题目不属于该作业');

    const submission = this.repository.getSubmissionByStudent(homeworkId, studentId);
    const focusAnswer = focusRow && submission ? this.repository.getAnswerForQuestion(submission.id, focusRow.id) : null;
    const focusQuestion = focusRow ? this.toQuestion(focusRow) : null;

    const history = this.repository
      .listQa(homeworkId, studentId)
      .slice(-QA_HISTORY_TURNS)
      .map((row) => ({
        role: (row.role === 'assistant' ? 'assistant' : 'student') as 'student' | 'assistant',
        content: row.content,
      }));

    this.repository.createQa({
      assignment_id: homeworkId,
      student_id: studentId,
      role: 'student',
      content,
      ai_source: null,
    });

    const { provider, reason } = this.ai();
    const outcome = await provider.ask({
      homeworkTitle: homework.title,
      focus: focusQuestion
        ? {
            question_id: focusQuestion.id,
            type: focusQuestion.type,
            stem: focusQuestion.stem,
            options: focusQuestion.options,
            reference: focusQuestion.reference,
            rubric: rubricOf(focusQuestion),
            points: focusQuestion.points,
          }
        : null,
      studentAnswer: focusAnswer
        ? describeAnswer(parseJsonObject<HomeworkAnswerValue>(focusAnswer.answer_json), focusQuestion?.options ?? [])
        : '',
      teacherFeedback: submission?.teacher_feedback ?? null,
      history,
      studentQuestion: content,
    });

    this.repository.createQa({
      assignment_id: homeworkId,
      student_id: studentId,
      role: 'assistant',
      content: outcome.text,
      ai_source: provider.source,
    });

    return {
      messages: this.repository.listQa(homeworkId, studentId).map((row) => this.toQaMessage(row)),
      ai: this.aiOutcome(provider.source, provider.available(), reason ?? outcome.message, outcome.confidence),
    };
  }

  /**
   * Whose thread is being read or written.
   *
   * A student or parent is pinned to their own resolved `studentId` whatever they asked for. Staff
   * must name one - a thread belongs to a pupil, and there is no meaningful "all threads" for a
   * question about one pupil's answer.
   */
  private resolveQaStudentId(actor: RequestActor, homework: HomeworkRow, studentIdInput: unknown): number {
    if (actor.role === 'student' || actor.role === 'parent') {
      const own = this.requireOwnStudentId(actor);
      const requested = optionalPositiveInteger(studentIdInput, 'student_id');
      if (requested !== undefined && requested !== own) throw new ApiError(403, '无权限查看该学生的问答');
      return own;
    }

    if (actor.role === 'teacher') {
      this.ensureHomeworkOwner(actor, homework, '无权限查看该作业问答');
    } else if (!this.isAdminRole(actor)) {
      throw new ApiError(403, '无权限执行该操作');
    }

    const requested = optionalPositiveInteger(studentIdInput, 'student_id');
    if (requested === undefined) throw new ApiError(400, '缺少 student_id');
    return requested;
  }

  private toQaMessage(row: HomeworkQaRow): HomeworkQaMessage {
    return {
      id: row.id,
      assignment_id: row.assignment_id,
      student_id: row.student_id,
      role: row.role === 'assistant' ? 'assistant' : 'student',
      content: row.content,
      ai_source: row.ai_source,
      created_at: row.created_at,
    };
  }
}

// ---------------------------------------------------------------------------
// Free functions

/**
 * The effective score, in precedence order: the teacher, then the AI provider, then the server's own
 * grader.
 *
 * A single renderer is the only place this rule is expressed. Writing `score` anywhere else would
 * let the three sources disagree, and the precedence is deliberate: a human overrides a model, and a
 * model overrides the deterministic grader (because it is the more considered judgement), while the
 * grader is what fills in when neither of the other two spoke.
 *
 * `teacherScore` is checked with `!== null`, not truthiness: a teacher scoring 0 is a decision, and
 * `||` would silently fall through to the AI on every question they marked zero.
 */
export function effectiveScore(
  teacherScore: number | null,
  aiScore: number | null,
  autoScore: number | null = null,
): number | null {
  if (teacherScore !== null && teacherScore !== undefined) return teacherScore;
  if (aiScore !== null && aiScore !== undefined) return aiScore;
  return autoScore ?? null;
}

/**
 * Whether an answer is correct, and only where that is a fact.
 *
 * A short answer's `is_correct` stays null however the model scored it: "partially right" is not a
 * boolean, and recording one would make the grade sheet claim more than it knows. An unanswered
 * question is also null rather than "wrong".
 */
function correctnessOf(questionRows: HomeworkQuestionRow[], questionId: number, score: number | null): number | null {
  if (score === null) return null;
  const question = questionRows.find((row) => row.id === questionId);
  if (!question || !isObjectiveType(question.type)) return null;
  return score >= question.points ? 1 : 0;
}

/** A question's rubric lines, read out of `reference.rubric` where the teacher wrote them. */
function rubricOf(question: HomeworkQuestion): Array<{ label: string; points: number }> {
  const raw = (question.reference as { rubric?: unknown }).rubric;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const label = String(record.label ?? '').trim();
      const points = Number(record.points);
      return { label, points: Number.isFinite(points) ? points : 0 };
    })
    .filter((entry) => entry.label !== '');
}

/** Answer rows' total, from the questions themselves rather than from the answers. */
function totalPointsFromRows(rows: HomeworkQuestionRow[]): number {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row.points) ? row.points : 0), 0);
}

function totalPointsFromQuestions(questions: HomeworkQuestion[]): number {
  return questions.reduce((sum, question) => sum + (Number.isFinite(question.points) ? question.points : 0), 0);
}

function totalPoints(questions: HomeworkQuestionInput[]): number {
  return questions.reduce((sum, question) => sum + question.points, 0);
}

function parseJsonObject<T>(value: string | null): T {
  const parsed = parseJson(value);
  return (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}) as T;
}

function parseJsonArray<T>(value: string | null): T[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function parseJson(value: string | null): unknown {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = optionalPositiveInteger(value, label);
  if (parsed === undefined) throw new ApiError(400, `${label} is invalid`);
  return parsed;
}

function optionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new ApiError(400, `${label} is invalid`);
  return number;
}

function nonNegativeInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new ApiError(400, 'reward_points is invalid');
  return Math.floor(number);
}

/** A list of positive integer ids from a body field that may be absent, a scalar, or an array. */
function normaliseIds(value: unknown): number[] {
  if (value === undefined || value === null || value === '') return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((entry) => positiveInteger(entry, 'id'));
}

function requireTitle(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, '请填写作业标题');
  return value.trim();
}

/** `''` means "clear this field", which is a different thing from `undefined` ("leave it alone"). */
function emptyToNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function normaliseHomeworkStatus(value: unknown): 'draft' | 'published' | 'closed' | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value);
  if (!HOMEWORK_STATUSES.has(text)) throw new ApiError(400, 'status 无效');
  return text as 'draft' | 'published' | 'closed';
}

/**
 * Validate and normalise a teacher's question list.
 *
 * Validation is strict and specific, because a silently-accepted malformed question becomes a grade
 * sheet that cannot be completed: a single-choice question with two answers, a choice question with
 * no options, a blank question with nothing accepted. Each refusal names the offending position, so
 * a ten-question editor can highlight the row rather than saying "something is wrong".
 */
export function normaliseQuestions(value: unknown): HomeworkQuestionInput[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(400, 'questions 必须是数组');

  return value.map((entry, index) => {
    const position = index + 1;
    const question = (entry ?? {}) as HomeworkQuestionPayload;
    const type = String(question.type ?? '');
    if (!QUESTION_TYPES.has(type)) throw new ApiError(400, `第 ${position} 题：题型无效`);
    const stem = String(question.stem ?? '').trim();
    if (!stem) throw new ApiError(400, `第 ${position} 题：请填写题干`);

    const points = Number(question.points);
    if (!Number.isFinite(points) || points < 0) throw new ApiError(400, `第 ${position} 题：分值必须是非负数`);

    const options: HomeworkOption[] = (Array.isArray(question.options) ? question.options : []).map((option, optionIndex) => {
      const record = (option ?? {}) as Partial<HomeworkOption>;
      const id = String(record.id ?? '').trim();
      const text = String(record.text ?? '').trim();
      if (!id) throw new ApiError(400, `第 ${position} 题：第 ${optionIndex + 1} 个选项缺少 id`);
      if (!text) throw new ApiError(400, `第 ${position} 题：第 ${optionIndex + 1} 个选项内容为空`);
      return { id, text };
    });

    const reference = (question.reference ?? {}) as HomeworkReferenceAnswer;
    if (type === 'single' || type === 'multiple') {
      if (options.length < 2) throw new ApiError(400, `第 ${position} 题：选择题至少需要 2 个选项`);
      const choice = (reference.choice ?? []).map((id) => String(id));
      if (choice.length === 0) throw new ApiError(400, `第 ${position} 题：请设置正确答案`);
      if (type === 'single' && choice.length !== 1) {
        throw new ApiError(400, `第 ${position} 题：单选题只能有 1 个正确答案`);
      }
      const known = new Set(options.map((option) => option.id));
      const stray = choice.filter((id) => !known.has(id));
      if (stray.length > 0) throw new ApiError(400, `第 ${position} 题：正确答案 ${stray.join('、')} 不在选项中`);
    }

    return {
      ...(question.id !== undefined && question.id !== null ? { id: Number(question.id) } : {}),
      type: type as HomeworkQuestionType,
      stem,
      options,
      reference,
      explanation: emptyToNull(question.explanation),
      points: Math.floor(points),
    } as HomeworkQuestionInput;
  });
}

/** Validate a student's answers, tolerating a missing list but not a malformed one. */
function normaliseAnswerInputs(value: unknown): Array<{ question_id: number; value: HomeworkAnswerValue }> {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const record = (entry ?? {}) as { question_id?: unknown; value?: unknown };
    const questionId = Number(record.question_id);
    if (!Number.isInteger(questionId) || questionId <= 0) {
      throw new ApiError(400, `第 ${index + 1} 个作答：question_id 无效`);
    }
    const raw = (record.value ?? {}) as HomeworkAnswerValue;
    return {
      question_id: questionId,
      value: {
        ...(raw.choice !== undefined ? { choice: (Array.isArray(raw.choice) ? raw.choice : [raw.choice]).map(String) } : {}),
        ...(raw.text !== undefined ? { text: String(raw.text) } : {}),
        ...(raw.photo_ids !== undefined
          ? { photo_ids: (Array.isArray(raw.photo_ids) ? raw.photo_ids : [raw.photo_ids]).map(Number) }
          : {}),
      },
    };
  });
}

/** A file extension for the stored photo, preferring the declared MIME over the client's name. */
function extensionFor(mime: string, originalName: string): string {
  const byMime: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
  };
  const known = byMime[String(mime).toLowerCase()];
  if (known) return known;
  const fromName = path.extname(String(originalName ?? '')).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(fromName) ? fromName : '.jpg';
}
