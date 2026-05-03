import { Router } from 'express';

import { ChallengeService } from '../modules/challenge/challenge.service.js';
import { SqliteChallengeRepository } from '../modules/challenge/challenge.repository.sqlite.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertActorFeatureEnabled } from '../utils/classFeatures.js';
import { getRequestActor } from '../utils/requestAuth.js';

const router = Router();
const service = new ChallengeService(new SqliteChallengeRepository());

router.get(
  '/questions',
  asyncHandler(async (req, res) => {
    const actor = getRequestActor(req);
    if (actor.role === 'student' && actor.id) {
      assertActorFeatureEnabled(actor.id, 'student', 'enable_challenge');
    }
    const questions = service.getQuestions(req.query.limit);
    res.json({ success: true, questions });
  }),
);

router.post(
  '/submit',
  asyncHandler(async (req, res) => {
    const data = service.submitAnswers(req.body?.studentId, req.body?.answers);
    res.json({ success: true, ...data });
  }),
);

router.get(
  '/boss/active/:classId',
  asyncHandler(async (req, res) => {
    const boss = service.getActiveBoss(req.params.classId);
    res.json({ success: true, boss });
  }),
);

router.post(
  '/boss/:id/attack',
  asyncHandler(async (req, res) => {
    const data = service.attackBoss(req.params.id, req.body?.studentId);
    res.json({ success: true, ...data });
  }),
);

router.get(
  '/boss',
  asyncHandler(async (_req, res) => {
    const bosses = service.listBosses();
    res.json({ success: true, bosses });
  }),
);

router.post(
  '/boss',
  asyncHandler(async (req, res) => {
    const data = service.createBoss(req.body);
    res.json({ success: true, id: data.id });
  }),
);

router.delete(
  '/boss/:id',
  asyncHandler(async (req, res) => {
    await service.deleteBoss(req.params.id);
    res.json({ success: true });
  }),
);

export default router;
