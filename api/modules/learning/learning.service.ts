import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import fs from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { prisma } from '../../prismaClient.js';
import { ApiError } from '../../utils/apiError.js';
import { getRequestActor, requireActorRole } from '../../utils/requestAuth.js';

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

@Injectable()
export class LearningService {
  async getStudentByActor(req: Request) {
    const actor = getRequestActor(req);
    if (actor.role !== 'student' || !actor.id) throw new ApiError(403, '无权限执行该操作');
    const student = await prisma.students.findFirst({ where: { user_id: actor.id } });
    if (!student) throw new ApiError(404, 'Student not found');
    return student;
  }

  async listPapers(req: Request, classIdInput?: string) {
    const actor = getRequestActor(req);

    if (actor.role === 'teacher' || actor.role === 'admin' || actor.role === 'superadmin') {
      const teacherId = actor.role === 'teacher' ? actor.id : null;
      const classId = classIdInput === undefined ? null : Number(classIdInput);
      const where: any = {};
      if (teacherId) where.teacher_id = teacherId;
      if (Number.isFinite(classId)) where.class_id = classId;

      return prisma.papers.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: { subjects: true },
      });
    }

    if (actor.role === 'student') {
      const student = await this.getStudentByActor(req);
      if (!student.class_id) throw new ApiError(400, 'Student has no class');
      return prisma.papers.findMany({
        where: { class_id: student.class_id, status: 'published' },
        orderBy: { created_at: 'desc' },
        include: { subjects: true },
      });
    }

    throw new ApiError(403, '无权限执行该操作');
  }

  async createPaper(req: Request, input: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const { class_id, subject_id, title, source, total_points, exam_date } = input ?? {};

    const teacherId = actor.id;
    if (!teacherId) throw new ApiError(400, 'Missing actor id');
    if (!title || typeof title !== 'string') throw new ApiError(400, 'Missing title');

    return prisma.papers.create({
      data: {
        teacher_id: teacherId,
        class_id: class_id === undefined || class_id === null ? null : Number(class_id),
        subject_id: subject_id === undefined || subject_id === null ? null : Number(subject_id),
        title,
        source: typeof source === 'string' ? source : 'manual',
        total_points: total_points === undefined || total_points === null ? 0 : Number(total_points),
        exam_date: exam_date ? new Date(exam_date) : null,
      },
    });
  }

  async getPaper(req: Request, idInput: string) {
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const paper = await prisma.papers.findFirst({
      where: { id: idNum },
      include: {
        subjects: true,
        paper_assets: true,
        paper_sections: { orderBy: { order_no: 'asc' } },
        paper_items: {
          orderBy: { order_no: 'asc' },
          include: {
            questions: true,
            rubric_points: { orderBy: { step_order: 'asc' } },
          },
        },
      },
    });
    if (!paper) throw new ApiError(404, 'Paper not found');

    const actor = getRequestActor(req);
    if (actor.role === 'teacher' || actor.role === 'admin' || actor.role === 'superadmin') {
      if (actor.role === 'teacher' && actor.id !== paper.teacher_id) throw new ApiError(403, '无权限查看该试卷');
      return paper;
    }

    if (actor.role === 'student') {
      const student = await this.getStudentByActor(req);
      if (!student.class_id || student.class_id !== paper.class_id) throw new ApiError(403, '无权限查看该试卷');
      if (paper.status !== 'published') throw new ApiError(403, '试卷未发布');
      return paper;
    }

    throw new ApiError(403, '无权限执行该操作');
  }

  async updatePaper(req: Request, idInput: string, input: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const paper = await prisma.papers.findUnique({ where: { id: idNum } });
    if (!paper) throw new ApiError(404, 'Paper not found');
    if (actor.role === 'teacher' && actor.id !== paper.teacher_id) throw new ApiError(403, '无权限编辑该试卷');

    const { title, status, class_id, subject_id, total_points, exam_date } = input ?? {};
    if (status === 'published') {
      const itemCount = await prisma.paper_items.count({ where: { paper_id: idNum } });
      if (itemCount === 0) throw new ApiError(400, '试卷没有题目，无法发布');
    }

    return prisma.papers.update({
      where: { id: idNum },
      data: {
        title: typeof title === 'string' ? title : undefined,
        status: typeof status === 'string' ? status : undefined,
        class_id: class_id === undefined ? undefined : class_id === null ? null : Number(class_id),
        subject_id: subject_id === undefined ? undefined : subject_id === null ? null : Number(subject_id),
        total_points: total_points === undefined ? undefined : Number(total_points),
        exam_date: exam_date === undefined ? undefined : exam_date === null ? null : new Date(exam_date),
      },
    });
  }

  async savePaperStructure(req: Request, idInput: string, input: Record<string, any>) {
    const actor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const paper = await prisma.papers.findUnique({ where: { id: idNum } });
    if (!paper) throw new ApiError(404, 'Paper not found');
    if (actor.role === 'teacher' && actor.id !== paper.teacher_id) throw new ApiError(403, '无权限编辑该试卷');

    const sections = Array.isArray(input?.sections) ? input.sections : [];
    const items = Array.isArray(input?.items) ? input.items : [];
    const rubricPoints = Array.isArray(input?.rubric_points) ? input.rubric_points : [];

    await prisma.$transaction(async (tx) => {
      await tx.rubric_points.deleteMany({ where: { paper_items: { paper_id: idNum } } });
      await tx.paper_items.deleteMany({ where: { paper_id: idNum } });
      await tx.paper_sections.deleteMany({ where: { paper_id: idNum } });

      const createdSections = await Promise.all(
        sections.map((section: any) => {
          if (!section?.title || typeof section.title !== 'string') throw new ApiError(400, 'Invalid section title');
          const orderNo = Number(section.order_no);
          if (!Number.isFinite(orderNo)) throw new ApiError(400, 'Invalid section order_no');
          return tx.paper_sections.create({
            data: { paper_id: idNum, title: section.title, order_no: orderNo },
          });
        }),
      );
      const sectionIdByOrderNo = new Map<number, number>(createdSections.map((s) => [s.order_no, s.id]));

      const createdItems = await Promise.all(
        items.map(async (item: any) => {
          const orderNo = Number(item.order_no);
          if (!Number.isFinite(orderNo)) throw new ApiError(400, 'Invalid item order_no');

          let questionId = item.question_id === undefined || item.question_id === null ? null : Number(item.question_id);
          if (!questionId || !Number.isFinite(questionId)) {
            const stem = item?.question?.stem;
            const type = item?.question?.type;
            if (!stem || typeof stem !== 'string') throw new ApiError(400, 'Missing question.stem');
            if (!type || typeof type !== 'string') throw new ApiError(400, 'Missing question.type');
            const createdQuestion = await tx.questions.create({
              data: {
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
              },
            });
            questionId = createdQuestion.id;
          }

          const sectionOrderNo = item.section_order_no === undefined || item.section_order_no === null ? null : Number(item.section_order_no);
          const sectionId = sectionOrderNo === null ? null : sectionIdByOrderNo.get(sectionOrderNo) ?? null;

          return tx.paper_items.create({
            data: {
              paper_id: idNum,
              section_id: sectionId,
              question_id: questionId,
              order_no: orderNo,
              points_override: item.points_override === undefined ? null : Number(item.points_override),
              difficulty_override: item.difficulty_override === undefined ? null : Number(item.difficulty_override),
              rubric_json: typeof item.rubric_json === 'string' ? item.rubric_json : null,
            },
          });
        }),
      );
      const itemIdByOrderNo = new Map<number, number>(createdItems.map((it) => [it.order_no, it.id]));

      await Promise.all(
        rubricPoints.map((rp: any) => {
          const itemOrderNo = Number(rp.paper_item_order_no);
          const itemId = itemIdByOrderNo.get(itemOrderNo);
          if (!itemId) throw new ApiError(400, 'Invalid rubric_points.paper_item_order_no');
          if (!rp?.label || typeof rp.label !== 'string') throw new ApiError(400, 'Invalid rubric_points.label');
          const points = Number(rp.points);
          const stepOrder = Number(rp.step_order);
          if (!Number.isFinite(points)) throw new ApiError(400, 'Invalid rubric_points.points');
          if (!Number.isFinite(stepOrder)) throw new ApiError(400, 'Invalid rubric_points.step_order');
          return tx.rubric_points.create({
            data: {
              paper_item_id: itemId,
              label: rp.label,
              points,
              keywords_json: typeof rp.keywords_json === 'string' ? rp.keywords_json : null,
              step_order: stepOrder,
            },
          });
        }),
      );
    });

    return prisma.papers.findFirst({
      where: { id: idNum },
      include: {
        paper_sections: { orderBy: { order_no: 'asc' } },
        paper_items: { orderBy: { order_no: 'asc' }, include: { questions: true, rubric_points: { orderBy: { step_order: 'asc' } } } },
      },
    });
  }

  async uploadPaperAsset(req: Request, idInput: string, file?: Express.Multer.File) {
    const actor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    if (!file) throw new ApiError(400, 'Missing file');

    const paper = await prisma.papers.findUnique({ where: { id: idNum } });
    if (!paper) throw new ApiError(404, 'Paper not found');
    if (actor.role === 'teacher' && actor.id !== paper.teacher_id) throw new ApiError(403, '无权限上传该试卷文件');

    const ext = path.extname(file.originalname || '');
    const fileName = `${randomUUID()}${ext}`;
    const targetDir = path.join(process.cwd(), 'uploads', 'papers');
    ensureDir(targetDir);
    const targetPath = path.join(targetDir, fileName);
    moveUploadedFile(file.path, targetPath);

    const digest = sha256File(targetPath);
    return prisma.paper_assets.create({
      data: {
        paper_id: idNum,
        kind: 'file',
        storage_path: `/uploads/papers/${fileName}`,
        mime: file.mimetype,
        size: file.size,
        sha256: digest,
      },
    });
  }

  async startPaperSubmission(req: Request, input: Record<string, any>) {
    requireActorRole(req, ['student']);
    const paperIdNum = Number(input?.paper_id);
    if (!Number.isFinite(paperIdNum)) throw new ApiError(400, 'Missing or invalid paper_id');

    const student = await this.getStudentByActor(req);
    if (!student.class_id) throw new ApiError(400, 'Student has no class');

    const paper = await prisma.papers.findUnique({ where: { id: paperIdNum } });
    if (!paper) throw new ApiError(404, 'Paper not found');
    if (paper.status !== 'published') throw new ApiError(403, '试卷未发布');
    if (paper.class_id !== student.class_id) throw new ApiError(403, '无权限开始该试卷');

    const submission = await prisma.paper_submissions.create({
      data: {
        paper_id: paperIdNum,
        student_id: student.id,
      },
    });

    const items = await prisma.paper_items.findMany({
      where: { paper_id: paperIdNum },
      orderBy: { order_no: 'asc' },
      include: { questions: true, rubric_points: { orderBy: { step_order: 'asc' } } },
    });

    return { submission, items };
  }

  async savePaperAnswers(req: Request, idInput: string, input: Record<string, any>) {
    requireActorRole(req, ['student']);
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await this.getStudentByActor(req);
    const submission = await prisma.paper_submissions.findUnique({ where: { id: idNum } });
    if (!submission) throw new ApiError(404, 'Submission not found');
    if (submission.student_id !== student.id) throw new ApiError(403, '无权限保存该作答');
    if (submission.submitted_at) throw new ApiError(400, '已提交，无法修改');

    const answers = Array.isArray(input?.answers) ? input.answers : null;
    if (!answers || answers.length === 0) throw new ApiError(400, 'Missing answers');

    await prisma.$transaction(async (tx) => {
      for (const a of answers) {
        const paperItemIdNum = Number(a?.paper_item_id);
        if (!Number.isFinite(paperItemIdNum)) throw new ApiError(400, 'Invalid paper_item_id');
        const timeSpent = a?.time_spent_sec === undefined || a?.time_spent_sec === null ? null : Number(a.time_spent_sec);

        const existing = await tx.paper_answers.findFirst({
          where: { submission_id: idNum, paper_item_id: paperItemIdNum },
          select: { id: true },
        });

        if (existing) {
          await tx.paper_answers.update({
            where: { id: existing.id },
            data: {
              answer_json: a?.answer_json === undefined ? undefined : a.answer_json === null ? null : String(a.answer_json),
              time_spent_sec: timeSpent === null ? undefined : timeSpent,
            },
          });
        } else {
          await tx.paper_answers.create({
            data: {
              submission_id: idNum,
              paper_item_id: paperItemIdNum,
              answer_json: a?.answer_json === undefined ? null : a.answer_json === null ? null : String(a.answer_json),
              time_spent_sec: timeSpent === null ? 0 : timeSpent,
            },
          });
        }
      }
    });
  }

  async submitPaper(req: Request, idInput: string) {
    requireActorRole(req, ['student']);
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await this.getStudentByActor(req);

    const submission = await prisma.paper_submissions.findFirst({
      where: { id: idNum },
      include: {
        papers: true,
        paper_answers: {
          include: {
            paper_items: { include: { questions: true } },
          },
        },
      },
    });
    if (!submission) throw new ApiError(404, 'Submission not found');
    if (submission.student_id !== student.id) throw new ApiError(403, '无权限提交该作答');
    if (submission.submitted_at) throw new ApiError(400, '已提交');

    let totalScore = 0;
    let correctCount = 0;
    let wrongCount = 0;
    const wrongQuestionIds: number[] = [];

    await prisma.$transaction(async (tx) => {
      await tx.paper_submissions.update({
        where: { id: idNum },
        data: { submitted_at: new Date() },
      });

      const allItems = await tx.paper_items.findMany({
        where: { paper_id: submission.paper_id },
        select: { id: true },
      });
      const answeredItemIdSet = new Set(submission.paper_answers.map((a) => a.paper_item_id));
      const missingItemIds = allItems.map((it) => it.id).filter((itemId) => !answeredItemIdSet.has(itemId));
      if (missingItemIds.length) {
        await tx.paper_answers.createMany({
          data: missingItemIds.map((paperItemId) => ({
            submission_id: idNum,
            paper_item_id: paperItemId,
            answer_json: null,
            score: 0,
            is_correct: 0,
            time_spent_sec: 0,
            error_type: null,
          })),
        });
      }

      const answersToScore = await tx.paper_answers.findMany({
        where: { submission_id: idNum },
        include: { paper_items: { include: { questions: true } } },
      });

      for (const answer of answersToScore) {
        const question = answer.paper_items.questions;
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

        await tx.paper_answers.update({
          where: { id: answer.id },
          data: { is_correct: isCorrect ? 1 : 0, score },
        });

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
        const existing = await tx.wrong_questions.findFirst({
          where: { student_id: student.id, question_id: qid },
        });
        if (existing) {
          await tx.wrong_questions.update({
            where: { id: existing.id },
            data: {
              wrong_count: existing.wrong_count + 1,
              last_wrong_at: new Date(),
              mastery_score: Math.max(0, (existing.mastery_score ?? 0) - 0.1),
              cleared_at: null,
              updated_at: new Date(),
            },
          });
        } else {
          await tx.wrong_questions.create({
            data: { student_id: student.id, question_id: qid, wrong_count: 1, mastery_score: 0 },
          });
        }
      }

      const plan = await tx.study_plans.findFirst({
        where: { student_id: student.id, status: 'active' },
        orderBy: { id: 'desc' },
      });
      const planId = plan
        ? plan.id
        : (
            await tx.study_plans.create({
              data: { student_id: student.id, status: 'active' },
            })
          ).id;

      const existingItems = await tx.study_plan_items.findMany({
        where: { plan_id: planId, kind: 'practice', status: 'pending' },
        select: { id: true, question_id: true },
      });
      const existingQuestionIdSet = new Set(existingItems.map((it) => it.question_id).filter((id) => id !== null) as number[]);

      for (const qid of uniqueWrong) {
        if (existingQuestionIdSet.has(qid)) continue;
        await tx.study_plan_items.create({
          data: { plan_id: planId, kind: 'practice', question_id: qid, estimated_min: 10, status: 'pending' },
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

  listSubjects() {
    return prisma.subjects.findMany({ orderBy: { id: 'asc' } });
  }

  createSubject(req: Request, input: Record<string, any>) {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const { name, stage, grade } = input ?? {};
    if (!name || typeof name !== 'string') throw new ApiError(400, 'Missing name');

    return prisma.subjects.create({
      data: {
        name,
        stage: typeof stage === 'string' ? stage : null,
        grade: grade === undefined || grade === null ? null : Number(grade),
      },
    });
  }

  listKnowledgeNodes(subjectIdInput: unknown) {
    const subjectIdNum = Number(subjectIdInput);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');

    return prisma.knowledge_nodes.findMany({
      where: { subject_id: subjectIdNum },
      orderBy: [{ parent_id: 'asc' }, { id: 'asc' }],
    });
  }

  createKnowledgeNode(req: Request, input: Record<string, any>) {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const { subject_id, name, code, parent_id, importance } = input ?? {};
    const subjectIdNum = Number(subject_id);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');
    if (!name || typeof name !== 'string') throw new ApiError(400, 'Missing name');

    return prisma.knowledge_nodes.create({
      data: {
        subject_id: subjectIdNum,
        name,
        code: typeof code === 'string' ? code : null,
        parent_id: parent_id === undefined || parent_id === null ? null : Number(parent_id),
        importance: importance === undefined || importance === null ? null : Number(importance),
      },
    });
  }

  updateKnowledgeNode(req: Request, idInput: string, input: Record<string, any>) {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    const { name, code, parent_id, importance } = input ?? {};

    return prisma.knowledge_nodes.update({
      where: { id: idNum },
      data: {
        name: typeof name === 'string' ? name : undefined,
        code: typeof code === 'string' ? code : code === null ? null : undefined,
        parent_id: parent_id === undefined ? undefined : parent_id === null ? null : Number(parent_id),
        importance: importance === undefined ? undefined : importance === null ? null : Number(importance),
      },
    });
  }

  async deleteKnowledgeNode(req: Request, idInput: string) {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    await prisma.knowledge_nodes.delete({ where: { id: idNum } });
  }

  listKnowledgeEdges(subjectIdInput: unknown) {
    const subjectIdNum = Number(subjectIdInput);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');

    return prisma.knowledge_edges.findMany({
      where: { subject_id: subjectIdNum },
      orderBy: { id: 'asc' },
    });
  }

  createKnowledgeEdge(req: Request, input: Record<string, any>) {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const { subject_id, from_node_id, to_node_id, edge_type, weight } = input ?? {};

    const subjectIdNum = Number(subject_id);
    const fromIdNum = Number(from_node_id);
    const toIdNum = Number(to_node_id);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');
    if (!Number.isFinite(fromIdNum)) throw new ApiError(400, 'Missing or invalid from_node_id');
    if (!Number.isFinite(toIdNum)) throw new ApiError(400, 'Missing or invalid to_node_id');
    if (!edge_type || typeof edge_type !== 'string') throw new ApiError(400, 'Missing edge_type');

    return prisma.knowledge_edges.create({
      data: {
        subject_id: subjectIdNum,
        from_node_id: fromIdNum,
        to_node_id: toIdNum,
        edge_type,
        weight: weight === undefined || weight === null ? null : Number(weight),
      },
    });
  }

  async deleteKnowledgeEdge(req: Request, idInput: string) {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    await prisma.knowledge_edges.delete({ where: { id: idNum } });
  }

  async listWrongQuestions(req: Request) {
    requireActorRole(req, ['student']);
    const student = await this.getStudentByActor(req);

    return prisma.wrong_questions.findMany({
      where: { student_id: student.id, cleared_at: null },
      orderBy: [{ last_wrong_at: 'desc' }, { id: 'desc' }],
      include: {
        questions: true,
      },
    });
  }

  async attemptWrongQuestion(req: Request, idInput: string, input: Record<string, any>) {
    requireActorRole(req, ['student']);
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await this.getStudentByActor(req);
    const wrong = await prisma.wrong_questions.findUnique({ where: { id: idNum } });
    if (!wrong) throw new ApiError(404, 'Wrong question not found');
    if (wrong.student_id !== student.id) throw new ApiError(403, '无权限操作该错题');

    const { is_correct, spent_sec, practice_source } = input ?? {};
    const isCorrect = Number(is_correct) === 1;
    const spentSecNum = spent_sec === undefined || spent_sec === null ? 0 : Number(spent_sec);
    const source = typeof practice_source === 'string' ? practice_source : 'practice';

    await prisma.$transaction(async (tx) => {
      await tx.wrong_question_attempts.create({
        data: {
          wrong_question_id: idNum,
          practice_source: source,
          is_correct: isCorrect ? 1 : 0,
          spent_sec: Number.isFinite(spentSecNum) ? spentSecNum : 0,
        },
      });

      const nextMastery = Math.min(1, Math.max(0, (wrong.mastery_score ?? 0) + (isCorrect ? 0.2 : -0.1)));
      await tx.wrong_questions.update({
        where: { id: idNum },
        data: {
          mastery_score: nextMastery,
          cleared_at: isCorrect && nextMastery >= 0.95 ? new Date() : null,
          updated_at: new Date(),
        },
      });
    });
  }

  async generateWrongQuestionPractice(req: Request, idInput: string) {
    requireActorRole(req, ['student']);
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await this.getStudentByActor(req);
    const wrong = await prisma.wrong_questions.findFirst({
      where: { id: idNum, student_id: student.id },
      include: { questions: true },
    });
    if (!wrong) throw new ApiError(404, 'Wrong question not found');

    const nodeLinks = await prisma.question_knowledge.findMany({
      where: { question_id: wrong.question_id },
      select: { node_id: true },
    });
    const nodeIds = nodeLinks.map((l) => l.node_id);

    return nodeIds.length > 0
      ? prisma.questions.findMany({
          where: {
            id: { not: wrong.question_id },
            question_knowledge: { some: { node_id: { in: nodeIds } } },
          },
          take: 5,
          orderBy: { id: 'desc' },
        })
      : prisma.questions.findMany({
          where: {
            id: { not: wrong.question_id },
            subject_id: wrong.questions.subject_id ?? undefined,
            type: wrong.questions.type,
          },
          take: 5,
          orderBy: { id: 'desc' },
        });
  }

  async getMyStudyPlan(req: Request) {
    requireActorRole(req, ['student']);
    const student = await this.getStudentByActor(req);

    return prisma.study_plans.findFirst({
      where: { student_id: student.id, status: 'active' },
      orderBy: { id: 'desc' },
      include: { study_plan_items: { orderBy: { id: 'asc' }, include: { questions: true, knowledge_nodes: true } } },
    });
  }

  async createStudyPlan(req: Request, input: Record<string, any>) {
    requireActorRole(req, ['student']);
    const student = await this.getStudentByActor(req);
    const { target_exam_date, target_score } = input ?? {};

    return prisma.$transaction(async (tx) => {
      await tx.study_plans.updateMany({
        where: { student_id: student.id, status: 'active' },
        data: { status: 'archived', updated_at: new Date() },
      });

      return tx.study_plans.create({
        data: {
          student_id: student.id,
          target_exam_date: target_exam_date ? new Date(target_exam_date) : null,
          target_score: target_score === undefined || target_score === null ? null : Number(target_score),
          status: 'active',
        },
      });
    });
  }

  async updateStudyPlanItem(req: Request, idInput: string, input: Record<string, any>) {
    requireActorRole(req, ['student']);
    const idNum = Number(idInput);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    const { status } = input ?? {};
    if (!status || typeof status !== 'string') throw new ApiError(400, 'Missing status');

    const student = await this.getStudentByActor(req);
    const item = await prisma.study_plan_items.findFirst({
      where: { id: idNum },
      include: { study_plans: true },
    });
    if (!item) throw new ApiError(404, 'Item not found');
    if (item.study_plans.student_id !== student.id) throw new ApiError(403, '无权限修改该任务');

    return prisma.study_plan_items.update({
      where: { id: idNum },
      data: { status },
    });
  }
}
