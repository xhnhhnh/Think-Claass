import express from 'express';

import { SqliteBattlesRepository } from '../modules/battles/battles.repository.sqlite.js';
import { BattlesService } from '../modules/battles/battles.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
const service = new BattlesService(new SqliteBattlesRepository());

router.get(
  '/teacher/:classId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, battles: service.listBattles(req.params.classId) });
  }),
);

router.post(
  '/teacher/initiate',
  asyncHandler(async (req, res) => {
    res.json({ success: true, ...service.initiate(req.body) });
  }),
);

router.put(
  '/teacher/accept/:battleId',
  asyncHandler(async (req, res) => {
    service.accept(req.params.battleId);
    res.json({ success: true });
  }),
);

router.put(
  '/teacher/reject/:battleId',
  asyncHandler(async (req, res) => {
    service.reject(req.params.battleId);
    res.json({ success: true });
  }),
);

router.put(
  '/teacher/end/:battleId',
  asyncHandler(async (req, res) => {
    service.end(req.params.battleId, req.body);
    res.json({ success: true });
  }),
);

router.get(
  '/stats/:battleId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, ...service.getStats(req.params.battleId) });
  }),
);

router.get(
  '/classes/search',
  asyncHandler(async (req, res) => {
    res.json({ success: true, classes: service.searchClasses(req.query.q, req.query.excludeClassId) });
  }),
);

export default router;
