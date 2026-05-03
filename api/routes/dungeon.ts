import express from 'express';

import { SqliteDungeonRepository } from '../modules/dungeon/dungeon.repository.sqlite.js';
import { DungeonService } from '../modules/dungeon/dungeon.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
const service = new DungeonService(new SqliteDungeonRepository());

router.get(
  '/:studentId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, ...service.getRun(req.params.studentId) });
  }),
);

router.post(
  '/start/:studentId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, ...service.startRun(req.params.studentId) });
  }),
);

router.post(
  '/choice/:studentId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, ...service.choose(req.params.studentId, req.body) });
  }),
);

router.post(
  '/abandon/:studentId',
  asyncHandler(async (req, res) => {
    service.abandon(req.params.studentId);
    res.json({ success: true });
  }),
);

export default router;
