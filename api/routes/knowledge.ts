import { Router, type Request, type Response } from 'express';
import { prisma } from '../prismaClient.js';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { requireActorRole } from '../utils/requestAuth.js';

const router = Router();

router.get(
  '/subjects',
  asyncHandler(async (_req: Request, res: Response) => {
    const subjects = await prisma.subjects.findMany({ orderBy: { id: 'asc' } });
    res.json({ success: true, data: subjects });
  }),
);

router.post(
  '/subjects',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const { name, stage, grade } = req.body ?? {};
    if (!name || typeof name !== 'string') throw new ApiError(400, 'Missing name');

    const created = await prisma.subjects.create({
      data: {
        name,
        stage: typeof stage === 'string' ? stage : null,
        grade: grade === undefined || grade === null ? null : Number(grade),
      },
    });

    res.json({ success: true, data: created });
  }),
);

router.get(
  '/nodes',
  asyncHandler(async (req: Request, res: Response) => {
    const subjectIdNum = Number(req.query.subject_id);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');

    const nodes = await prisma.knowledge_nodes.findMany({
      where: { subject_id: subjectIdNum },
      orderBy: [{ parent_id: 'asc' }, { id: 'asc' }],
    });

    res.json({ success: true, data: nodes });
  }),
);

router.post(
  '/nodes',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const { subject_id, name, code, parent_id, importance } = req.body ?? {};
    const subjectIdNum = Number(subject_id);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');
    if (!name || typeof name !== 'string') throw new ApiError(400, 'Missing name');

    const created = await prisma.knowledge_nodes.create({
      data: {
        subject_id: subjectIdNum,
        name,
        code: typeof code === 'string' ? code : null,
        parent_id: parent_id === undefined || parent_id === null ? null : Number(parent_id),
        importance: importance === undefined || importance === null ? null : Number(importance),
      },
    });

    res.json({ success: true, data: created });
  }),
);

router.put(
  '/nodes/:id',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    const { name, code, parent_id, importance } = req.body ?? {};

    const updated = await prisma.knowledge_nodes.update({
      where: { id: idNum },
      data: {
        name: typeof name === 'string' ? name : undefined,
        code: typeof code === 'string' ? code : code === null ? null : undefined,
        parent_id: parent_id === undefined ? undefined : parent_id === null ? null : Number(parent_id),
        importance: importance === undefined ? undefined : importance === null ? null : Number(importance),
      },
    });

    res.json({ success: true, data: updated });
  }),
);

router.delete(
  '/nodes/:id',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');

    await prisma.knowledge_nodes.delete({ where: { id: idNum } });
    res.json({ success: true });
  }),
);

router.get(
  '/edges',
  asyncHandler(async (req: Request, res: Response) => {
    const subjectIdNum = Number(req.query.subject_id);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');

    const edges = await prisma.knowledge_edges.findMany({
      where: { subject_id: subjectIdNum },
      orderBy: { id: 'asc' },
    });

    res.json({ success: true, data: edges });
  }),
);

router.post(
  '/edges',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const { subject_id, from_node_id, to_node_id, edge_type, weight } = req.body ?? {};

    const subjectIdNum = Number(subject_id);
    const fromIdNum = Number(from_node_id);
    const toIdNum = Number(to_node_id);
    if (!Number.isFinite(subjectIdNum)) throw new ApiError(400, 'Missing or invalid subject_id');
    if (!Number.isFinite(fromIdNum)) throw new ApiError(400, 'Missing or invalid from_node_id');
    if (!Number.isFinite(toIdNum)) throw new ApiError(400, 'Missing or invalid to_node_id');
    if (!edge_type || typeof edge_type !== 'string') throw new ApiError(400, 'Missing edge_type');

    const created = await prisma.knowledge_edges.create({
      data: {
        subject_id: subjectIdNum,
        from_node_id: fromIdNum,
        to_node_id: toIdNum,
        edge_type,
        weight: weight === undefined || weight === null ? null : Number(weight),
      },
    });

    res.json({ success: true, data: created });
  }),
);

router.delete(
  '/edges/:id',
  asyncHandler(async (req: Request, res: Response) => {
    requireActorRole(req, ['teacher', 'admin', 'superadmin']);
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) throw new ApiError(400, 'Invalid id');
    await prisma.knowledge_edges.delete({ where: { id: idNum } });
    res.json({ success: true });
  }),
);

export default router;
