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

    const plan = await prisma.study_plans.findFirst({
      where: { student_id: student.id, status: 'active' },
      orderBy: { id: 'desc' },
      include: { study_plan_items: { orderBy: { id: 'asc' }, include: { questions: true, knowledge_nodes: true } } },
    });

    res.json({ success: true, data: plan });
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['student']);
    const student = await getStudentByActor(req);

    const { target_exam_date, target_score } = req.body ?? {};

    const created = await prisma.$transaction(async (tx) => {
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

    res.json({ success: true, data: created });
  }),
);

router.put(
  '/items/:id',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['student']);
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    const { status } = req.body ?? {};
    if (!status || typeof status !== 'string') throw new ApiError(400, 'Missing status');

    const student = await getStudentByActor(req);
    const item = await prisma.study_plan_items.findFirst({
      where: { id: idNum },
      include: { study_plans: true },
    });
    if (!item) throw new ApiError(404, 'Item not found');
    if (item.study_plans.student_id !== student.id) throw new ApiError(403, '无权限修改该任务');

    const updated = await prisma.study_plan_items.update({
      where: { id: idNum },
      data: { status },
    });

    res.json({ success: true, data: updated });
  }),
);

export default router;

