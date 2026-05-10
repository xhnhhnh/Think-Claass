import { Router, type Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import type { SlgService } from './slg.service.js';

function ok<T>(res: Response, data: T, legacyPayload: Record<string, unknown> = {}) {
  res.json({ success: true, data, ...legacyPayload });
}

export function createSlgRouter(service: SlgService) {
  const router = Router();

  router.get(
    '/classes/:classId/map',
    asyncHandler(async (req, res) => {
      const data = service.getMap(req.params.classId);
      ok(res, data, data);
    }),
  );

  router.post(
    '/students/:studentId/territories/:territoryId/contributions',
    asyncHandler(async (req, res) => {
      ok(res, service.contribute(req.params.studentId, req.params.territoryId, req.body));
    }),
  );

  router.post(
    '/classes/:classId/territories',
    asyncHandler(async (req, res) => {
      ok(res, service.createTerritory({ ...req.body, class_id: Number(req.params.classId) }));
    }),
  );

  router.post(
    '/classes/:classId/yield',
    asyncHandler(async (req, res) => {
      ok(res, service.yieldResources(req.params.classId));
    }),
  );

  return router;
}
