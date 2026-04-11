import { Router, type Request, type Response } from 'express';
import { prisma } from '../prismaClient.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { getRequestActor, requireActorRole } from '../utils/requestAuth.js';

const router = Router();

async function getStudentByActor(req: Request) {
  const actor = getRequestActor(req);
  if (actor.role !== 'student' || !actor.id) throw new ApiError(403, '无权限执行该操作');
  const student = await prisma.students.findFirst({ where: { user_id: actor.id } });
  if (!student) throw new ApiError(404, 'Student not found');
  return student;
}

router.get(
  '/my',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['student']);
    const student = await getStudentByActor(req);

    const items = await prisma.wrong_questions.findMany({
      where: { student_id: student.id, cleared_at: null },
      orderBy: [{ last_wrong_at: 'desc' }, { id: 'desc' }],
      include: {
        questions: true,
      },
    });

    res.json({ success: true, data: items });
  }),
);

router.post(
  '/:id/attempt',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['student']);
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await getStudentByActor(req);
    const wrong = await prisma.wrong_questions.findUnique({ where: { id: idNum } });
    if (!wrong) throw new ApiError(404, 'Wrong question not found');
    if (wrong.student_id !== student.id) throw new ApiError(403, '无权限操作该错题');

    const { is_correct, spent_sec, practice_source } = req.body ?? {};
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

    res.json({ success: true });
  }),
);

router.post(
  '/:id/generate',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['student']);
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const student = await getStudentByActor(req);
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

    const candidates =
      nodeIds.length > 0
        ? await prisma.questions.findMany({
            where: {
              id: { not: wrong.question_id },
              question_knowledge: { some: { node_id: { in: nodeIds } } },
            },
            take: 5,
            orderBy: { id: 'desc' },
          })
        : await prisma.questions.findMany({
            where: {
              id: { not: wrong.question_id },
              subject_id: wrong.questions.subject_id ?? undefined,
              type: wrong.questions.type,
            },
            take: 5,
            orderBy: { id: 'desc' },
          });

    res.json({ success: true, data: candidates });
  }),
);

export default router;

