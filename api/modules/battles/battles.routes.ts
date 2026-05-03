import { Router, type Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import type { BattlesService } from './battles.service.js';

function ok<T>(res: Response, data: T, legacyPayload: Record<string, unknown> = {}) {
  res.json({ success: true, data, ...legacyPayload });
}

export function createBattlesRouter(service: BattlesService) {
  const router = Router();

  router.get(
    '/classes/search',
    asyncHandler(async (req, res) => {
      const classes = service.searchClasses(req.query.q, req.query.excludeClassId);
      ok(res, { classes }, { classes });
    }),
  );

  router.get(
    '/classes/:classId',
    asyncHandler(async (req, res) => {
      const battles = service.listBattles(req.params.classId);
      ok(res, { battles }, { battles });
    }),
  );

  router.get(
    '/:battleId/stats',
    asyncHandler(async (req, res) => {
      const data = service.getStats(req.params.battleId);
      ok(res, data, data);
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const data = service.initiate(req.body);
      ok(res, data, data);
    }),
  );

  router.put(
    '/:battleId/accept',
    asyncHandler(async (req, res) => {
      ok(res, service.accept(req.params.battleId));
    }),
  );

  router.put(
    '/:battleId/reject',
    asyncHandler(async (req, res) => {
      ok(res, service.reject(req.params.battleId));
    }),
  );

  router.put(
    '/:battleId/end',
    asyncHandler(async (req, res) => {
      ok(res, service.end(req.params.battleId, req.body));
    }),
  );

  return router;
}
