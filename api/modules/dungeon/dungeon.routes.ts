import { Router, type Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import type { DungeonService } from './dungeon.service.js';

function ok<T>(res: Response, data: T, legacyPayload: Record<string, unknown> = {}) {
  res.json({ success: true, data, ...legacyPayload });
}

export function createDungeonRouter(service: DungeonService) {
  const router = Router();

  router.get(
    '/students/:studentId/run',
    asyncHandler(async (req, res) => {
      const data = service.getRun(req.params.studentId);
      ok(res, data, data);
    }),
  );

  router.post(
    '/students/:studentId/start',
    asyncHandler(async (req, res) => {
      const data = service.startRun(req.params.studentId);
      ok(res, data, data);
    }),
  );

  router.post(
    '/students/:studentId/choices',
    asyncHandler(async (req, res) => {
      const data = service.choose(req.params.studentId, req.body);
      ok(res, data, data);
    }),
  );

  router.post(
    '/students/:studentId/abandon',
    asyncHandler(async (req, res) => {
      ok(res, service.abandon(req.params.studentId));
    }),
  );

  return router;
}
