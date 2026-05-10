import { Router, type Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import type { ChallengeService } from './challenge.service.js';

function ok<T>(res: Response, data: T, legacyPayload: Record<string, unknown> = {}) {
  res.json({ success: true, data, ...legacyPayload });
}

export function createChallengeRouter(service: ChallengeService) {
  const router = Router();

  router.get(
    '/students/:studentId/questions',
    asyncHandler(async (req, res) => {
      const questions = service.getQuestions(req.query.limit, req.params.studentId);
      ok(res, { questions }, { questions });
    }),
  );

  router.post(
    '/students/:studentId/submissions',
    asyncHandler(async (req, res) => {
      const data = service.submitAnswers(req.params.studentId, req.body?.answers);
      ok(res, data, data);
    }),
  );

  router.get(
    '/classes/:classId/bosses/active',
    asyncHandler(async (req, res) => {
      const boss = service.getActiveBoss(req.params.classId);
      ok(res, { boss }, { boss });
    }),
  );

  router.get(
    '/bosses',
    asyncHandler(async (_req, res) => {
      const bosses = service.listBosses();
      ok(res, { bosses }, { bosses });
    }),
  );

  router.post(
    '/bosses',
    asyncHandler(async (req, res) => {
      ok(res, service.createBoss(req.body));
    }),
  );

  router.delete(
    '/bosses/:id',
    asyncHandler(async (req, res) => {
      ok(res, service.deleteBoss(req.params.id));
    }),
  );

  router.post(
    '/bosses/:id/attacks',
    asyncHandler(async (req, res) => {
      const data = service.attackBoss(req.params.id, req.body?.studentId);
      ok(res, data, data);
    }),
  );

  return router;
}
