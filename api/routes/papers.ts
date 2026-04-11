import { Router, type Request, type Response } from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { createHash, randomUUID } from 'crypto';
import multer from 'multer';

import { prisma } from '../prismaClient.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { getRequestActor, requireActorRole } from '../utils/requestAuth.js';

const router = Router();
const upload = multer({ dest: os.tmpdir() });

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function sha256File(filePath: string) {
  const hash = createHash('sha256');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}

async function getStudentByActor(req: Request) {
  const actor = getRequestActor(req);
  if (actor.role !== 'student' || !actor.id) throw new ApiError(403, '无权限执行该操作');
  const student = await prisma.students.findFirst({ where: { user_id: actor.id } });
  if (!student) throw new ApiError(404, 'Student not found');
  return student;
}

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = getRequestActor(req);

    if (actor.role === 'teacher' || actor.role === 'admin' || actor.role === 'superadmin') {
      const teacherId = actor.role === 'teacher' ? actor.id : null;
      const classId = req.query.class_id === undefined ? null : Number(req.query.class_id);
      const where: any = {};
      if (teacherId) where.teacher_id = teacherId;
      if (Number.isFinite(classId)) where.class_id = classId;

      const papers = await prisma.papers.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: { subjects: true },
      });

      res.json({ success: true, data: papers });
      return;
    }

    if (actor.role === 'student') {
      const student = await getStudentByActor(req);
      if (!student.class_id) throw new ApiError(400, 'Student has no class');
      const papers = await prisma.papers.findMany({
        where: { class_id: student.class_id, status: 'published' },
        orderBy: { created_at: 'desc' },
        include: { subjects: true },
      });
      res.json({ success: true, data: papers });
      return;
    }

    throw new ApiError(403, '无权限执行该操作');
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const { class_id, subject_id, title, source, total_points, exam_date } = req.body ?? {};

    const teacherId = actor.id;
    if (!teacherId) throw new ApiError(400, 'Missing actor id');
    if (!title || typeof title !== 'string') throw new ApiError(400, 'Missing title');

    const created = await prisma.papers.create({
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

    res.json({ success: true, data: created });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const idNum = Number(req.params.id);
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
      res.json({ success: true, data: paper });
      return;
    }

    if (actor.role === 'student') {
      const student = await getStudentByActor(req);
      if (!student.class_id || student.class_id !== paper.class_id) throw new ApiError(403, '无权限查看该试卷');
      if (paper.status !== 'published') throw new ApiError(403, '试卷未发布');
      res.json({ success: true, data: paper });
      return;
    }

    throw new ApiError(403, '无权限执行该操作');
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const paper = await prisma.papers.findUnique({ where: { id: idNum } });
    if (!paper) throw new ApiError(404, 'Paper not found');
    if (actor.role === 'teacher' && actor.id !== paper.teacher_id) throw new ApiError(403, '无权限编辑该试卷');

    const { title, status, class_id, subject_id, total_points, exam_date } = req.body ?? {};
    if (status === 'published') {
      const itemCount = await prisma.paper_items.count({ where: { paper_id: idNum } });
      if (itemCount === 0) throw new ApiError(400, '试卷没有题目，无法发布');
    }

    const updated = await prisma.papers.update({
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

    res.json({ success: true, data: updated });
  }),
);

router.put(
  '/:id/structure',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    const paper = await prisma.papers.findUnique({ where: { id: idNum } });
    if (!paper) throw new ApiError(404, 'Paper not found');
    if (actor.role === 'teacher' && actor.id !== paper.teacher_id) throw new ApiError(403, '无权限编辑该试卷');

    const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const rubricPoints = Array.isArray(req.body?.rubric_points) ? req.body.rubric_points : [];

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

    const refreshed = await prisma.papers.findFirst({
      where: { id: idNum },
      include: {
        paper_sections: { orderBy: { order_no: 'asc' } },
        paper_items: { orderBy: { order_no: 'asc' }, include: { questions: true, rubric_points: { orderBy: { step_order: 'asc' } } } },
      },
    });

    res.json({ success: true, data: refreshed });
  }),
);

router.post(
  '/:id/assets',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const actor = requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    if (!req.file) throw new ApiError(400, 'Missing file');

    const paper = await prisma.papers.findUnique({ where: { id: idNum } });
    if (!paper) throw new ApiError(404, 'Paper not found');
    if (actor.role === 'teacher' && actor.id !== paper.teacher_id) throw new ApiError(403, '无权限上传该试卷文件');

    const ext = path.extname(req.file.originalname || '');
    const fileName = `${randomUUID()}${ext}`;
    const targetDir = path.join(process.cwd(), 'uploads', 'papers');
    ensureDir(targetDir);
    const targetPath = path.join(targetDir, fileName);
    fs.renameSync(req.file.path, targetPath);

    const digest = sha256File(targetPath);
    const created = await prisma.paper_assets.create({
      data: {
        paper_id: idNum,
        kind: 'file',
        storage_path: `/uploads/papers/${fileName}`,
        mime: req.file.mimetype,
        size: req.file.size,
        sha256: digest,
      },
    });

    res.json({ success: true, data: created });
  }),
);

export default router;

