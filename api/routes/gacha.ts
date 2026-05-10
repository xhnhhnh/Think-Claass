import express from 'express';

import { SqliteGachaRepository } from '../modules/gacha/gacha.repository.sqlite.js';
import { GachaService } from '../modules/gacha/gacha.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
const service = new GachaService(new SqliteGachaRepository());

router.get(
  '/dictionary',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, pets: service.listDictionary() });
  }),
);

router.post(
  '/dictionary',
  asyncHandler(async (req, res) => {
    service.createDictionary(req.body);
    res.json({ success: true });
  }),
);

router.get(
  '/pools/:classId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, pools: service.listPools(req.params.classId) });
  }),
);

router.post(
  '/draw/:studentId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, results: service.draw(req.params.studentId, req.body) });
  }),
);

router.get(
  '/collection/:studentId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, collection: service.listCollection(req.params.studentId) });
  }),
);

router.put(
  '/active/:studentId/:instanceId',
  asyncHandler(async (req, res) => {
    service.setActivePet(req.params.studentId, req.params.instanceId);
    res.json({ success: true });
  }),
);

export default router;
