import express from 'express';

import { SlgService } from '../modules/slg/slg.service.js';
import { SqliteSlgRepository } from '../modules/slg/slg.repository.sqlite.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
const service = new SlgService(new SqliteSlgRepository());

router.get(
  '/map/:classId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, ...service.getMap(req.params.classId) });
  }),
);

router.post(
  '/student/:studentId/contribute/:territoryId',
  asyncHandler(async (req, res) => {
    service.contribute(req.params.studentId, req.params.territoryId, req.body);
    res.json({ success: true });
  }),
);

router.post(
  '/teacher',
  asyncHandler(async (req, res) => {
    service.createTerritory(req.body);
    res.json({ success: true });
  }),
);

router.post(
  '/teacher/yield/:classId',
  asyncHandler(async (req, res) => {
    service.yieldResources(req.params.classId);
    res.json({ success: true });
  }),
);

export default router;
