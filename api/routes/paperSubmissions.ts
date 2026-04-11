import { Router, type Request, type Response } from 'express';
import { prisma } from '../prismaClient.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { getRequestActor, requireActorRole } from '../utils/requestAuth.js';

const router = Router();

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

async function getStudentByActor(req: Request) {
  const actor = getRequestActor(req);
  if (actor.role !== 'student' || !actor.id) throw new ApiError(403, '无权限执行该操作');
  const student = await prisma.students.findFirst({ where: { user_id: actor.id } });
  if (!student) throw new ApiError(404, 'Student not found');
  return student;
}

router.post(
  '/start',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['student']);
    const { paper_id } = req.body ?? {};
    const paperIdNum = Number(paper_id);
    if (!Number.isFinite(paperIdNum)) throw new ApiError(400, 'Missing or invalid paper_id');

    const student = await getStudentByActor(req);
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

    res.json({ success: true, data: { submission, items } });
  }),
);

router.put(
  '/:id/answers',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['student']);
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await getStudentByActor(req);
    const submission = await prisma.paper_submissions.findUnique({ where: { id: idNum } });
    if (!submission) throw new ApiError(404, 'Submission not found');
    if (submission.student_id !== student.id) throw new ApiError(403, '无权限保存该作答');
    if (submission.submitted_at) throw new ApiError(400, '已提交，无法修改');

    const answers = Array.isArray(req.body?.answers) ? req.body.answers : null;
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

    res.json({ success: true });
  }),
);

router.post(
  '/:id/submit',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['student']);
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await getStudentByActor(req);

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

    res.json({
      success: true,
      data: {
        paper_id: submission.paper_id,
        submission_id: submission.id,
        total_score: totalScore,
        correct_count: correctCount,
        wrong_count: wrongCount,
      },
    });
  }),
);

export default router;
