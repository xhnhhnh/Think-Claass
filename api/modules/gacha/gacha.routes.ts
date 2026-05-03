import { Router, type Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import type { GachaService } from './gacha.service.js';

function ok<T>(res: Response, data: T, legacyPayload: Record<string, unknown> = {}) {
  res.json({ success: true, data, ...legacyPayload });
}

export function createGachaRouter(service: GachaService) {
  const router = Router();

  router.get(
    '/dictionary',
    asyncHandler(async (_req, res) => {
      const pets = service.listDictionary();
      ok(res, { pets }, { pets });
    }),
  );

  router.post(
    '/dictionary',
    asyncHandler(async (req, res) => {
      ok(res, service.createDictionary(req.body));
    }),
  );

  router.get(
    '/classes/:classId/pools',
    asyncHandler(async (req, res) => {
      const pools = service.listPools(req.params.classId);
      ok(res, { pools }, { pools });
    }),
  );

  router.post(
    '/students/:studentId/draws',
    asyncHandler(async (req, res) => {
      const results = service.draw(req.params.studentId, req.body);
      ok(res, { results }, { results });
    }),
  );

  router.get(
    '/students/:studentId/collection',
    asyncHandler(async (req, res) => {
      const collection = service.listCollection(req.params.studentId);
      ok(res, { collection }, { collection });
    }),
  );

  router.put(
    '/students/:studentId/active-pet/:instanceId',
    asyncHandler(async (req, res) => {
      ok(res, service.setActivePet(req.params.studentId, req.params.instanceId));
    }),
  );

  return router;
}
