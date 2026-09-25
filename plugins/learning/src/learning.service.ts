/**
 * Learning service - papers, paper submissions, the knowledge graph, wrong questions and
 * study plans.
 *
 * Behavior is relocated from `api/modules/learning/learning.service.ts` unchanged: same
 * validation order, same messages, same return shapes, same transaction boundaries. What
 * changed is only what a plugin cannot keep:
 *
 *   - `prisma` is gone; every call is a repository method over `ctx.db`.
 *   - `ApiError` is the kernel's (the deleted service used `api/utils/apiError.ts`, a
 *     *different class* - `instanceof` would not hold across the boundary).
 *   - `getRequestActor(req)` / `requireActorRole(req, …)` are gone: the controllers resolve
 *     the caller from the kernel request context and gate the route before delegating here,
 *     which is the same position in the call chain (gate first, then validation).
 *   - `prisma.students` is gone; the student behind an actor comes from
 *     `classroom.public.getStudentByUserId`, and `students` is deliberately *not* declared
 *     as a read in the manifest.
 *
 * The file-upload route keeps its filesystem work (it wrote to `uploads/papers` before and
 * still does); that is application storage, not database ownership, and it is recorded in
 * `plugin.json` `_known_debt`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import { ApiError } from '@thinkclass/kernel';
import type { ClassroomPort, StudentSnapshot } from '@thinkclass/contracts/domains/classroom';
import type {
  LearningCandidateFilter,
  LearningKnowledgeProgress,
  LearningPort,
  LearningPracticeOutcome,
  LearningQuestionOption,
  LearningQuestionRef,
  LearningStudentSignals,
} from '@thinkclass/contracts/domains/learning';

import type { LearningRepository } from './learning.repository.js';
import type {
  Actor,
  PaperStructureRow,
  QuestionRow,
  WrongQuestionWithQuestion,
} from './learning.types.js';

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function sha256File(filePath: string) {
  const hash = createHash('sha256');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}

function moveUploadedFile(sourcePath: string, targetPath: string) {
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
  }
}

function normalizeAnswer(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseJsonMaybe(value: unknown) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * The comparison the *practice* path uses - stricter in one place, looser in another.
 *
 * Looser: a one-element array is unwrapped, so `["b"]` and `"b"` are the same claim about a
 * single-choice question. That asymmetry is real in this database (a choice key is stored as whatever
 * the teacher's editor produced), and without the unwrapping the 智学 practice flow would mark a
 * correct pick wrong - the failure mode that matters most here. A multi-choice answer compares as a
 * sorted array, so the order the student clicked in is not part of the answer.
 *
 * Stricter: nothing else is normalised, and the caller additionally declines to judge when the
 * question carries no reference answer at all (see `recordPracticeOutcome`). `submitPaper` keeps its
 * own `normalizeAnswer` comparison untouched: that path has shipped, its behaviour is the exam
 * contract, and redefining "correct" for a paper already in a student's history is not this feature's
 * business.
 */
function normalizePracticeAnswer(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    const parts = value.map((entry) => String(entry).trim()).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return JSON.stringify([...parts].sort());
  }
  return normalizeAnswer(value);
}

/**
 * `questions.options_json` -> the option list the port publishes.
 *
 * Tolerant on purpose, and the tolerance is bounded to shape rather than to meaning: a row whose
 * JSON is a plain string, an array of strings or a malformed object yields `[]` rather than throwing,
 * because a question the teacher mistyped must not be able to fail a whole practice request. What it
 * does *not* do is invent an id: an option with no readable `id` is dropped, since an answer keyed on
 * a made-up id could never be matched back to what the student picked.
 */
function toQuestionOptions(raw: string | null): LearningQuestionOption[] {
  const parsed = parseJsonMaybe(raw);
  if (!Array.isArray(parsed)) return [];

  const options: LearningQuestionOption[] = [];
  for (const entry of parsed) {
    if (typeof entry === 'string') {
      // A bare string list ("A" / "B") is what an early import produced; the index is the id.
      options.push({ id: String.fromCharCode(97 + options.length), text: entry });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as { id?: unknown; text?: unknown; label?: unknown };
    const id = record.id === undefined || record.id === null ? '' : String(record.id);
    const text = typeof record.text === 'string' ? record.text : String(record.text ?? record.label ?? '');
    if (!id) continue;
    options.push({ id, text });
  }
  return options;
}

/**
 * A `paper_items.questions` row always exists (`question_id` is NOT NULL and the FK has no
 * cascade), so this only satisfies the type checker - and fails loudly if that ever stops
 * being true instead of reading `undefined.subject_id`.
 */
function requireQuestion(question: QuestionRow | null): QuestionRow {
  if (!question) throw new Error('paper item references a missing question');
  return question;
}

export class LearningService {
  constructor(
    private readonly repository: LearningRepository,
    private readonly classroom: ClassroomPort,
  ) {}

  /**
   * The student behind a `student` actor.
   *
   * `RequestContext.actor` carries `userId` only, so the lookup goes through the classroom
   * port (`getStudentByUserId`), which orders by id to stay deterministic - the legacy
   * `prisma.students.findFirst({ where: { user_id } })` took the first match the same way.
   */
  private async studentOf(actor: Actor): Promise<StudentSnapshot> {
    if (actor.role !== 'student' || !actor.id) throw new ApiError(403, '无权限执行该操作');
    const student = await this.classroom.getStudentByUserId(actor.id);
    if (!student) throw new ApiError(404, 'Student not found');
    return student;
  }

  // -- papers ---------------------------------------------------------------

  async listPapers(actor: Actor, classIdInput?: string) {
    if (actor.role === 'teacher' || actor.role === 'admin' || actor.role === 'superadmin') {
      const teacherId = actor.role === 'teacher' ? actor.id : null;
      const classId = classIdInput === undefined ? null : Number(classIdInput);
      const filter: { teacherId?: number; classId?: number } = {};
      if (teacherId) filter.teacherId = teacherId;
      if (Number.isFinite(classId)) filter.classId = classId as number;

      return this.repository.listPapers(filter);
    }

    if (actor.role === 'student') {
      const student = await this.studentOf(actor);
      if (!student.classId) throw new ApiError(400, 'Student has no class');
      return this.repository.listPapers({ classId: student.classId, status: 'published' });
    }

    throw new ApiError(403, '无权限执行该操作');
  }

  createPaper(actor: Actor, input: Record<string, any>) {
    const { class_id, subject_id, title, source, total_points, exam_date } = input ?? {};

    const teacherId = actor.id;
    if (!teacherId) throw new ApiError(400, 'Missing actor id');
    if (!title || typeof title !== 'string') throw new ApiError(400, 'Missing title');

    return this.repository.createPaper({
      teacher_id: teacherId,
      class_id: class_id === undefined || class_id === null ? null : Number(class_id),
      subject_id: subject_id === undefined || subject_id === null ? null : Number(subject_id),
      title,
      source: typeof source === 'string' ? source : 'manual',
      total_points: total_points === undefined || total_points === null ? 0 : Number(total_points),
      exam_date: exam_date ? new Date(exam_date) : null,
    });
  }

  async getPaper(actor: Actor, idInput: string) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const paper = this.repository.getPaperDetail(idNum);
    if (!paper) throw new ApiError(404, 'Paper not found');

    if (actor.role === 'teacher' || actor.role === 'admin' || actor.role === 'superadmin') {
      if (actor.role === 'teacher' && actor.id !== paper.teacher_id) throw new ApiError(403, '无权限查看该试卷');
      return paper;
    }

    if (actor.role === 'student') {
      const student = await this.studentOf(actor);
      if (!student.classId || student.classId !== paper.class_id) throw new ApiError(403, '无权限查看该试卷');
      if (paper.status !== 'published') throw new ApiError(403, '试卷未发布');
      return paper;
    }

    throw new ApiError(403, '无权限执行该操作');
  }

  updatePaper(actor: Actor, idInput: string, input: Record<string, any>) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const paper = this.repository.getPaper(idNum);
    if (!paper) throw new ApiError(404, 'Paper not found');
    if (actor.role === 'teacher' && actor.id !== paper.teacher_id) throw new ApiError(403, '无权限编辑该试卷');

    const { title, status, class_id, subject_id, total_points, exam_date } = input ?? {};
    if (status === 'published') {
      const itemCount = this.repository.countPaperItems(idNum);
      if (itemCount === 0) throw new ApiError(400, '试卷没有题目，无法发布');
    }

    return this.repository.updatePaper(idNum, {
      title: typeof title === 'string' ? title : undefined,
      status: typeof status === 'string' ? status : undefined,
      class_id: class_id === undefined ? undefined : class_id === null ? null : Number(class_id),
      subject_id: subject_id === undefined ? undefined : subject_id === null ? null : Number(subject_id),
      total_points: total_points === undefined ? undefined : Number(total_points),
      exam_date: exam_date === undefined ? undefined : exam_date === null ? null : new Date(exam_date),
    });
  }

  savePaperStructure(actor: Actor, idInput: string, input: Record<string, any>) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const paper = this.repository.getPaper(idNum);
    if (!paper) throw new ApiError(404, 'Paper not found');
    if (actor.role === 'teacher' && actor.id !== paper.teacher_id) throw new ApiError(403, '无权限编辑该试卷');

    const sections = Array.isArray(input?.sections) ? input.sections : [];
    const items = Array.isArray(input?.items) ? input.items : [];
    const rubricPoints = Array.isArray(input?.rubric_points) ? input.rubric_points : [];

    this.repository.transaction(() => {
      this.repository.deletePaperStructure(idNum);

      const sectionIdByOrderNo = new Map<number, number>();
      for (const section of sections) {
        if (!section?.title || typeof section.title !== 'string') throw new ApiError(400, 'Invalid section title');
        const orderNo = Number(section.order_no);
        if (!Number.isFinite(orderNo)) throw new ApiError(400, 'Invalid section order_no');
        const created = this.repository.createPaperSection(idNum, section.title, orderNo);
        sectionIdByOrderNo.set(created.order_no, created.id);
      }

      /**
       * Item inserts are deliberately split in two passes.
       *
       * The deleted service ran `await Promise.all(items.map(async (item) => …))`. Each
       * mapper ran synchronously until its first `await`, so an item that already had a
       * `question_id` enqueued its `paper_items` insert immediately, while an item that
       * needed a new question enqueued the `questions` insert and only enqueued its own
       * item insert once that resolved. Reproducing that order keeps the autoincrement ids
       * - and therefore the `paper_items` → `questions` mapping the caller reads back -
       * identical instead of merely equivalent.
       */
      const itemIdByOrderNo = new Map<number, number>();
      const awaitingQuestion: Array<{ orderNo: number; sectionId: number | null; questionId: number; item: any }> = [];

      for (const item of items) {
        const orderNo = Number(item.order_no);
        if (!Number.isFinite(orderNo)) throw new ApiError(400, 'Invalid item order_no');

        const questionId = item.question_id === undefined || item.question_id === null ? null : Number(item.question_id);
        const sectionOrderNo =
          item.section_order_no === undefined || item.section_order_no === null ? null : Number(item.section_order_no);
        const sectionId = sectionOrderNo === null ? null : sectionIdByOrderNo.get(sectionOrderNo) ?? null;

        if (questionId && Number.isFinite(questionId)) {
          const created = this.repository.createPaperItem({
            paper_id: idNum,
            section_id: sectionId,
            question_id: questionId,
            order_no: orderNo,
            points_override: item.points_override === undefined ? null : Number(item.points_override),
            difficulty_override: item.difficulty_override === undefined ? null : Number(item.difficulty_override),
            rubric_json: typeof item.rubric_json === 'string' ? item.rubric_json : null,
          });
          itemIdByOrderNo.set(created.order_no, created.id);
          continue;
        }

        const stem = item?.question?.stem;
        const type = item?.question?.type;
        if (!stem || typeof stem !== 'string') throw new ApiError(400, 'Missing question.stem');
        if (!type || typeof type !== 'string') throw new ApiError(400, 'Missing question.type');

        awaitingQuestion.push({
          orderNo,
          sectionId,
          questionId: this.repository.createQuestion({
            teacher_id: paper.teacher_id,
            subject_id: paper.subject_id,
            stem,
            type,
            options_json: typeof item.question.options_json === 'string' ? item.question.options_json : null,
            answer_json: typeof item.question.answer_json === 'string' ? item.question.answer_json : null,
            explanation: typeof item.question.explanation === 'string' ? item.question.explanation : null,
            difficulty: item.question.difficulty === undefined ? null : Number(item.question.difficulty),
            is_subjective: item.question.is_subjective === undefined ? null : Number(item.question.is_subjective),
            default_points: item.question.default_points === undefined ? null : Number(item.question.default_points),
          }),
          item,
        });
      }

      for (const pending of awaitingQuestion) {
        const created = this.repository.createPaperItem({
          paper_id: idNum,
          section_id: pending.sectionId,
          question_id: pending.questionId,
          order_no: pending.orderNo,
          points_override: pending.item.points_override === undefined ? null : Number(pending.item.points_override),
          difficulty_override:
            pending.item.difficulty_override === undefined ? null : Number(pending.item.difficulty_override),
          rubric_json: typeof pending.item.rubric_json === 'string' ? pending.item.rubric_json : null,
        });
        itemIdByOrderNo.set(created.order_no, created.id);
      }

      for (const rp of rubricPoints) {
        const itemOrderNo = Number(rp.paper_item_order_no);
        const itemId = itemIdByOrderNo.get(itemOrderNo);
        if (!itemId) throw new ApiError(400, 'Invalid rubric_points.paper_item_order_no');
        if (!rp?.label || typeof rp.label !== 'string') throw new ApiError(400, 'Invalid rubric_points.label');
        const points = Number(rp.points);
        const stepOrder = Number(rp.step_order);
        if (!Number.isFinite(points)) throw new ApiError(400, 'Invalid rubric_points.points');
        if (!Number.isFinite(stepOrder)) throw new ApiError(400, 'Invalid rubric_points.step_order');
        this.repository.createRubricPoint({
          paper_item_id: itemId,
          label: rp.label,
          points,
          keywords_json: typeof rp.keywords_json === 'string' ? rp.keywords_json : null,
          step_order: stepOrder,
        });
      }
    });

    return this.repository.getPaperStructure(idNum) as PaperStructureRow;
  }

  uploadPaperAsset(actor: Actor, idInput: string, file?: Express.Multer.File) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    if (!file) throw new ApiError(400, 'Missing file');

    const paper = this.repository.getPaper(idNum);
    if (!paper) throw new ApiError(404, 'Paper not found');
    if (actor.role === 'teacher' && actor.id !== paper.teacher_id) throw new ApiError(403, '无权限上传该试卷文件');

    const ext = path.extname(file.originalname || '');
    const fileName = `${randomUUID()}${ext}`;
    const targetDir = path.join(process.cwd(), 'uploads', 'papers');
    ensureDir(targetDir);
    const targetPath = path.join(targetDir, fileName);
    moveUploadedFile(file.path, targetPath);

    const digest = sha256File(targetPath);
    return this.repository.createPaperAsset({
      paper_id: idNum,
      kind: 'file',
      storage_path: `/uploads/papers/${fileName}`,
      mime: file.mimetype,
      size: file.size,
      sha256: digest,
    });
  }

  // -- paper submissions ----------------------------------------------------

  async startPaperSubmission(actor: Actor, input: Record<string, any>) {
    const paperIdNum = Number(input?.paper_id);
    if (!Number.isFinite(paperIdNum)) throw new ApiError(400, 'Missing or invalid paper_id');

    const student = await this.studentOf(actor);
    if (!student.classId) throw new ApiError(400, 'Student has no class');

    const paper = this.repository.getPaper(paperIdNum);
    if (!paper) throw new ApiError(404, 'Paper not found');
    if (paper.status !== 'published') throw new ApiError(403, '试卷未发布');
    if (paper.class_id !== student.classId) throw new ApiError(403, '无权限开始该试卷');

    const submission = this.repository.createSubmission(paperIdNum, student.id);
    const items = this.repository.listPaperItemsWithRelations(paperIdNum);

    return { submission, items };
  }

  async savePaperAnswers(actor: Actor, idInput: string, input: Record<string, any>) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await this.studentOf(actor);
    const submission = this.repository.getSubmission(idNum);
    if (!submission) throw new ApiError(404, 'Submission not found');
    if (submission.student_id !== student.id) throw new ApiError(403, '无权限保存该作答');
    if (submission.submitted_at) throw new ApiError(400, '已提交，无法修改');

    const answers = Array.isArray(input?.answers) ? input.answers : null;
    if (!answers || answers.length === 0) throw new ApiError(400, 'Missing answers');

    this.repository.transaction(() => {
      for (const a of answers) {
        const paperItemIdNum = Number(a?.paper_item_id);
        if (!Number.isFinite(paperItemIdNum)) throw new ApiError(400, 'Invalid paper_item_id');
        const timeSpent = a?.time_spent_sec === undefined || a?.time_spent_sec === null ? null : Number(a.time_spent_sec);

        const existing = this.repository.getAnswerForItem(idNum, paperItemIdNum);

        if (existing) {
          this.repository.updateAnswerInput(existing.id, {
            answer_json: a?.answer_json === undefined ? undefined : a.answer_json === null ? null : String(a.answer_json),
            time_spent_sec: timeSpent === null ? undefined : timeSpent,
          });
        } else {
          this.repository.createAnswer({
            submission_id: idNum,
            paper_item_id: paperItemIdNum,
            answer_json: a?.answer_json === undefined ? null : a.answer_json === null ? null : String(a.answer_json),
            time_spent_sec: timeSpent === null ? 0 : timeSpent,
          });
        }
      }
    });
  }

  async submitPaper(actor: Actor, idInput: string) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await this.studentOf(actor);

    const submission = this.repository.getSubmissionWithAnswerSheet(idNum);
    if (!submission) throw new ApiError(404, 'Submission not found');
    if (submission.student_id !== student.id) throw new ApiError(403, '无权限提交该作答');
    if (submission.submitted_at) throw new ApiError(400, '已提交');

    let totalScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    const wrongQuestionIds: number[] = [];

    this.repository.transaction(() => {
      this.repository.markSubmissionSubmitted(idNum, new Date());

      const allItems = this.repository.listPaperItemIds(submission.paper_id);
      const answeredItemIdSet = new Set(submission.paper_answers.map((a) => a.paper_item_id));
      const missingItemIds = allItems.filter((itemId) => !answeredItemIdSet.has(itemId));
      if (missingItemIds.length) {
        this.repository.createAnswerSheetRows(
          missingItemIds.map((paperItemId) => ({ submission_id: idNum, paper_item_id: paperItemId })),
        );
      }

      const answersToScore = this.repository.listAnswersWithRelations(idNum);

      for (const answer of answersToScore) {
        const question = requireQuestion(answer.paper_items.questions);
        const points = answer.paper_items.points_override ?? question.default_points ?? 0;
        const isSubjective = (question.is_subjective ?? 0) === 1;

        if (isSubjective) {
          totalScore += answer.score ?? 0;
          continue;
        }

        const expected = parseJsonMaybe(question.answer_json);
        const actual = parseJsonMaybe(answer.answer_json);
        const isCorrect = normalizeAnswer(expected) === normalizeAnswer(actual);
        const score = isCorrect ? points : 0;

        this.repository.updateAnswerScore(answer.id, { is_correct: isCorrect ? 1 : 0, score });

        totalScore += score;
        if (isCorrect) {
          correctCount += 1;
        } else {
          wrongCount += 1;
          wrongQuestionIds.push(question.id);
        }
      }

      const uniqueWrong = Array.from(new Set(wrongQuestionIds));
      for (const qid of uniqueWrong) {
        const existing = this.repository.getWrongQuestionByQuestion(student.id, qid);
        if (existing) {
          this.repository.bumpWrongQuestion(existing.id, {
            wrongCount: existing.wrong_count + 1,
            masteryScore: Math.max(0, (existing.mastery_score ?? 0) - 0.1),
          });
        } else {
          this.repository.createWrongQuestion({ studentId: student.id, questionId: qid });
        }
      }

      const plan = this.repository.getActiveStudyPlanRow(student.id);
      const planId = plan
        ? plan.id
        : this.repository.createStudyPlan({ student_id: student.id, target_exam_date: null, target_score: null }).id;

      const existingItems = this.repository.listPendingPracticeItems(planId);
      const existingQuestionIdSet = new Set(
        existingItems.map((it) => it.question_id).filter((id) => id !== null) as number[],
      );

      for (const qid of uniqueWrong) {
        if (existingQuestionIdSet.has(qid)) continue;
        this.repository.createStudyPlanItem({
          plan_id: planId,
          kind: 'practice',
          question_id: qid,
          estimated_min: 10,
          status: 'pending',
        });
      }
    });

    return {
      paper_id: submission.paper_id,
      submission_id: submission.id,
      total_score: totalScore,
      correct_count: correctCount,
      wrong_count: wrongCount,
    };
  }

  // -- subjects / knowledge graph ------------------------------------------

  listSubjects() {
    return this.repository.listSubjects();
  }

  createSubject(actor: Actor, input: Record<string, any>) {
    const { name, stage, grade } = input ?? {};
    if (!name || typeof name !== 'string') throw new ApiError(400, 'Missing name');

    return this.repository.createSubject({
      name,
      stage: typeof stage === 'string' ? stage : null,
      grade: grade === undefined || grade === null ? null : Number(grade),
    });
  }

  listKnowledgeNodes(subjectIdInput: unknown) {
    const subjectIdNum = Number(subjectIdInput);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');

    return this.repository.listKnowledgeNodes(subjectIdNum);
  }

  createKnowledgeNode(actor: Actor, input: Record<string, any>) {
    const { subject_id, name, code, parent_id, importance } = input ?? {};
    const subjectIdNum = Number(subject_id);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');
    if (!name || typeof name !== 'string') throw new ApiError(400, 'Missing name');

    return this.repository.createKnowledgeNode({
      subject_id: subjectIdNum,
      name,
      code: typeof code === 'string' ? code : null,
      parent_id: parent_id === undefined || parent_id === null ? null : Number(parent_id),
      importance: importance === undefined || importance === null ? null : Number(importance),
    });
  }

  updateKnowledgeNode(actor: Actor, idInput: string, input: Record<string, any>) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    const { name, code, parent_id, importance } = input ?? {};

    return this.repository.updateKnowledgeNode(idNum, {
      name: typeof name === 'string' ? name : undefined,
      code: typeof code === 'string' ? code : code === null ? null : undefined,
      parent_id: parent_id === undefined ? undefined : parent_id === null ? null : Number(parent_id),
      importance: importance === undefined ? undefined : importance === null ? null : Number(importance),
    });
  }

  deleteKnowledgeNode(actor: Actor, idInput: string) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    this.repository.deleteKnowledgeNode(idNum);
  }

  listKnowledgeEdges(subjectIdInput: unknown) {
    const subjectIdNum = Number(subjectIdInput);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');

    return this.repository.listKnowledgeEdges(subjectIdNum);
  }

  createKnowledgeEdge(actor: Actor, input: Record<string, any>) {
    const { subject_id, from_node_id, to_node_id, edge_type, weight } = input ?? {};

    const subjectIdNum = Number(subject_id);
    const fromIdNum = Number(from_node_id);
    const toIdNum = Number(to_node_id);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');
    if (!Number.isFinite(fromIdNum)) throw new ApiError(400, 'Missing or invalid from_node_id');
    if (!Number.isFinite(toIdNum)) throw new ApiError(400, 'Missing or invalid to_node_id');
    if (!edge_type || typeof edge_type !== 'string') throw new ApiError(400, 'Missing edge_type');

    return this.repository.createKnowledgeEdge({
      subject_id: subjectIdNum,
      from_node_id: fromIdNum,
      to_node_id: toIdNum,
      edge_type,
      weight: weight === undefined || weight === null ? null : Number(weight),
    });
  }

  deleteKnowledgeEdge(actor: Actor, idInput: string) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    this.repository.deleteKnowledgeEdge(idNum);
  }

  // -- wrong questions ------------------------------------------------------

  async listWrongQuestions(actor: Actor) {
    const student = await this.studentOf(actor);
    return this.repository.listWrongQuestions(student.id);
  }

  async attemptWrongQuestion(actor: Actor, idInput: string, input: Record<string, any>) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await this.studentOf(actor);
    const wrong = this.repository.getWrongQuestion(idNum);
    if (!wrong) throw new ApiError(404, 'Wrong question not found');
    if (wrong.student_id !== student.id) throw new ApiError(403, '无权限操作该错题');

    const { is_correct, spent_sec, practice_source } = input ?? {};
    const isCorrect = Number(is_correct) === 1;
    const spentSecNum = spent_sec === undefined || spent_sec === null ? 0 : Number(spent_sec);
    const source = typeof practice_source === 'string' ? practice_source : 'practice';

    this.applyPracticeOutcome({
      wrongQuestionId: idNum,
      masteryScore: wrong.mastery_score ?? 0,
      isCorrect,
      spentSec: Number.isFinite(spentSecNum) ? spentSecNum : 0,
      source,
    });
  }

  /**
   * What one practice answer does to a wrong-question row - in one place, on purpose.
   *
   * Three callers now depend on this arithmetic agreeing: the wrong-question book's own practice
   * route, `submitPaper`'s `+1 wrong_count / -0.1 mastery` path (which deliberately keeps its
   * different step, because failing an exam is not the same event as missing a practice question),
   * and the `learning.public` port that `plugins/ai-study` writes through. The mastery number is
   * what the student sees in 错题本, so a second implementation of it in another plugin would show
   * up as a book that disagrees with itself.
   *
   * The attempt row and the mastery update are one transaction: half of this pair would leave a
   * history entry with no effect, or an effect with no history.
   */
  private applyPracticeOutcome(input: {
    wrongQuestionId: number;
    masteryScore: number;
    isCorrect: boolean;
    spentSec: number;
    source: string;
  }): { masteryScore: number; cleared: boolean } {
    const nextMastery = Math.min(1, Math.max(0, input.masteryScore + (input.isCorrect ? 0.2 : -0.1)));
    const cleared = input.isCorrect && nextMastery >= 0.95;

    this.repository.transaction(() => {
      this.repository.createWrongQuestionAttempt({
        wrongQuestionId: input.wrongQuestionId,
        practiceSource: input.source,
        isCorrect: input.isCorrect ? 1 : 0,
        spentSec: input.spentSec,
      });

      this.repository.recordWrongQuestionAttempt(input.wrongQuestionId, {
        masteryScore: nextMastery,
        clearedAt: cleared ? new Date() : null,
      });
    });

    return { masteryScore: nextMastery, cleared };
  }

  async generateWrongQuestionPractice(actor: Actor, idInput: string) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await this.studentOf(actor);
    const wrong: WrongQuestionWithQuestion | null = this.repository.getWrongQuestionForStudent(idNum, student.id);
    if (!wrong) throw new ApiError(404, 'Wrong question not found');

    const question = requireQuestion(wrong.questions);
    const nodeIds = this.repository.listQuestionKnowledgeNodeIds(wrong.question_id);

    return nodeIds.length > 0
      ? this.repository.listQuestionsByNodeIds(wrong.question_id, nodeIds)
      : this.repository.listQuestionsBySubjectType(wrong.question_id, question.subject_id, question.type);
  }

  // -- study plans ----------------------------------------------------------

  async getMyStudyPlan(actor: Actor) {
    const student = await this.studentOf(actor);
    return this.repository.getActiveStudyPlan(student.id);
  }

  async createStudyPlan(actor: Actor, input: Record<string, any>) {
    const student = await this.studentOf(actor);
    const { target_exam_date, target_score } = input ?? {};

    return this.repository.transaction(() => {
      this.repository.archiveActiveStudyPlans(student.id, new Date());

      return this.repository.createStudyPlan({
        student_id: student.id,
        target_exam_date: target_exam_date ? new Date(target_exam_date) : null,
        target_score: target_score === undefined || target_score === null ? null : Number(target_score),
      });
    });
  }

  async updateStudyPlanItem(actor: Actor, idInput: string, input: Record<string, any>) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    const { status } = input ?? {};
    if (!status || typeof status !== 'string') throw new ApiError(400, 'Missing status');

    const student = await this.studentOf(actor);
    const found = this.repository.getStudyPlanItemWithPlan(idNum);
    if (!found) throw new ApiError(404, 'Item not found');
    if (found.plan.student_id !== student.id) throw new ApiError(403, '无权限修改该任务');

    return this.repository.updateStudyPlanItem(idNum, status);
  }

  // -- the `learning.public` port -------------------------------------------
  //
  // Read by `plugins/ai-study` (guardrail G1 forbids it reading these eighteen tables, and declaring
  // a `data.reads` would still leave the writes impossible). The methods are deliberately *rows in,
  // DTO out*: a consumer gets no repository handle and no `ctx.db`, so the ownership check in the db
  // handle remains the proof that nothing outside this plugin ever runs SQL against these tables.
  //
  // There is no authorization here and there must not be: a port has no request actor, so the caller
  // proves "this student is mine to ask about" through `classroom.public` first - the same split
  // `PetAuthorization` records. What this side guarantees is only that a missing student answers
  // `null` rather than an empty signal set, because "no such student" and "a student with nothing to
  // review" lead a consumer to two different screens.

  /** The student's wrong-question book, knowledge-node record and graded-answer accuracy. */
  async getStudentSignals(studentId: number): Promise<LearningStudentSignals | null> {
    const student = await this.classroom.getStudentById(studentId);
    if (!student) return null;

    // `listWrongQuestions` answers only *uncleared* rows (`cleared_at IS NULL`), which is exactly the
    // set the engine should re-pick: a question the student has taken over 0.95 is one they have
    // learned, and offering it again is how a recommendation system looks broken.
    const wrong = this.repository.listWrongQuestions(studentId);
    const nodePairs = this.repository.listQuestionKnowledgeMap(wrong.map((row) => row.question_id));

    const nodesByQuestion = new Map<number, number[]>();
    for (const pair of nodePairs) {
      const list = nodesByQuestion.get(pair.question_id);
      if (list) list.push(pair.node_id);
      else nodesByQuestion.set(pair.question_id, [pair.node_id]);
    }

    const knowledgeProgress: LearningKnowledgeProgress[] = this.repository
      .listKnowledgeProgress(studentId)
      .map((row) => ({
        nodeId: row.node_id,
        name: row.name,
        importance: row.importance,
        wrongCount: Number(row.wrong_count ?? 0),
        attemptCount: Number(row.attempt_count ?? 0),
        correctCount: Number(row.correct_count ?? 0),
      }));

    return {
      studentId,
      wrongQuestions: wrong.map((row) => ({
        questionId: row.question_id,
        wrongCount: row.wrong_count,
        // `mastery_score` has a DDL default of 0 but is nullable in the type; the engine wants a
        // number it can subtract, and "no record" is 0 mastery, not "unknown".
        masteryScore: typeof row.mastery_score === 'number' ? row.mastery_score : 0,
        lastWrongAt: row.last_wrong_at,
        nodeIds: nodesByQuestion.get(row.question_id) ?? [],
      })),
      knowledgeProgress,
      recentPaperAccuracy: this.repository.countGradedObjectiveAnswers(studentId),
    };
  }

  /** The candidate pool, as refs that carry no answer key - see the contract's header. */
  listCandidates(filter: LearningCandidateFilter): LearningQuestionRef[] {
    return this.repository.listCandidateQuestions(filter).map((row) => this.toQuestionRef(row));
  }

  /** Resolve a stored set's question ids. Missing ids are absent from the answer, not an error. */
  listQuestionsByIds(questionIds: number[]): LearningQuestionRef[] {
    return this.repository.listQuestionsByIds(questionIds).map((row) => this.toQuestionRef(row));
  }

  /** Which nodes these questions belong to, so a consumer can score them without a query per row. */
  listQuestionKnowledgeMap(questionIds: number[]): Array<{ questionId: number; nodeId: number }> {
    return this.repository
      .listQuestionKnowledgeMap(questionIds)
      .map((pair) => ({ questionId: pair.question_id, nodeId: pair.node_id }));
  }

  /**
   * One row -> the outward ref.
   *
   * The single place `answer_json` and `explanation` are dropped. Having exactly one mapper is what
   * makes "no consumer can see an answer key" a property of the code rather than a habit: both
   * `listCandidates` and `listQuestionsByIds` go through it, so adding a third reader cannot forget.
   */
  private toQuestionRef(row: QuestionRow): LearningQuestionRef {
    return {
      id: row.id,
      teacherId: row.teacher_id,
      subjectId: row.subject_id,
      type: row.type,
      stem: row.stem,
      options: toQuestionOptions(row.options_json),
      difficulty: row.difficulty,
      isSubjective: (row.is_subjective ?? 0) === 1,
      defaultPoints: row.default_points ?? 0,
    };
  }

  toPort(): LearningPort {
    return {
      getStudentSignals: (studentId) => this.getStudentSignals(studentId),
      // `async` even though the work is synchronous: the port is an async boundary because the
      // implementations behind it read a database, and a caller that had to know which of the five
      // methods happened to be sync would be a caller that breaks the first time one of them is not.
      listCandidates: async (filter) => this.listCandidates(filter),
      listQuestionsByIds: async (questionIds) => this.listQuestionsByIds(questionIds),
      listQuestionKnowledgeMap: async (questionIds) => this.listQuestionKnowledgeMap(questionIds),
      listSubjects: async () => this.repository.listSubjects(),
      listKnowledgeNodes: async (subjectId) => this.repository.listKnowledgeNodes(subjectId),
      recordPracticeOutcome: async (input) => this.recordPracticeOutcome(input),
    };
  }

  /**
   * Judge one practice answer, then fold it into the book.
   *
   * Two refusals, both deliberate, and both narrower than `submitPaper`'s behaviour:
   *
   *   - a **subjective** question is never judged (`isCorrect: null`), because the server has no
   *     rubric grader for these rows and a 0 would be a mark it invented;
   *   - a question with **no reference answer configured** is never judged as correct either. The
   *     exam path currently compares two empty strings and calls that correct, which is a legacy
   *     behaviour on a surface that already carries known debt; a new surface must not copy it, or
   *     "you got it right" would mean "nobody set an answer".
   *
   * A declined outcome records **nothing**: no attempt row, no mastery change. Writing a `-0.1`
   * against an answer nobody marked is the same class of lie as a fabricated score.
   */
  recordPracticeOutcome(input: {
    studentId: number;
    questionId: number;
    answerJson: string | null;
    spentSec: number;
    source: string;
  }): LearningPracticeOutcome {
    const question = this.repository.getQuestion(input.questionId);
    const existing = this.repository.getWrongQuestionByQuestion(input.studentId, input.questionId);
    const currentMastery = existing && typeof existing.mastery_score === 'number' ? existing.mastery_score : 0;

    if (!question || (question.is_subjective ?? 0) === 1) {
      return { isCorrect: null, masteryScore: existing ? currentMastery : null, cleared: false };
    }

    const expected = normalizePracticeAnswer(parseJsonMaybe(question.answer_json));
    if (!expected) {
      return { isCorrect: null, masteryScore: existing ? currentMastery : null, cleared: false };
    }

    const isCorrect = expected === normalizePracticeAnswer(parseJsonMaybe(input.answerJson));

    if (!existing) {
      if (isCorrect) {
        // Right on a question that was never wrong: there is no book row to move, and creating one
        // just to record a correct answer would put a question the student has never missed into
        // 错题本.
        return { isCorrect: true, masteryScore: null, cleared: false };
      }
      // The same shape `submitPaper` produces for a first miss, so the practice flow feeds the
      // student's real book rather than a parallel one.
      this.repository.createWrongQuestion({ studentId: input.studentId, questionId: input.questionId });
    }

    const created = this.repository.getWrongQuestionByQuestion(input.studentId, input.questionId);
    if (!created) return { isCorrect, masteryScore: null, cleared: false };

    const outcome = this.applyPracticeOutcome({
      wrongQuestionId: created.id,
      masteryScore: typeof created.mastery_score === 'number' ? created.mastery_score : currentMastery,
      isCorrect,
      spentSec: Math.max(0, Math.floor(input.spentSec) || 0),
      // Provenance, so a book entry can say where a mastery step came from. `input.source` is the
      // caller's own label (`ai_study`) rather than one this plugin invents.
      source: input.source,
    });

    return { isCorrect, masteryScore: outcome.masteryScore, cleared: outcome.cleared };
  }
}
