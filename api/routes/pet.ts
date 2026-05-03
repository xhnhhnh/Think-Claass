import { Router } from 'express';

import { asyncHandler } from '../utils/asyncHandler.js';
import { PetService } from '../modules/pet/pet.service.js';
import { SqlitePetRepository } from '../modules/pet/pet.repository.sqlite.js';

const router = Router();
const service = new PetService(new SqlitePetRepository());

router.get(
  '/admin/class/:classId',
  asyncHandler(async (req, res) => {
    const students = service.listClassPets(req.params.classId);
    res.json({ success: true, students });
  }),
);

router.get(
  '/classmates/:studentId',
  asyncHandler(async (req, res) => {
    const classmatesPets = service.listClassmates(req.params.studentId);
    res.json({ success: true, classmatesPets });
  }),
);

router.post(
  '/battle',
  asyncHandler(async (req, res) => {
    const result = service.battle(req.body);
    res.json({ success: true, result });
  }),
);

router.get(
  '/leaderboard/:classId',
  asyncHandler(async (req, res) => {
    const leaderboard = service.listLeaderboard(req.params.classId);
    res.json({ success: true, leaderboard });
  }),
);

router.get(
  '/:studentId',
  asyncHandler(async (req, res) => {
    const data = service.getStudentPet(req.params.studentId);
    res.json({ success: true, pet: data.pet, has_parent_buff: data.hasParentBuff });
  }),
);

router.post(
  '/adopt',
  asyncHandler(async (req, res) => {
    const data = service.adoptPet(req.body?.studentId, {
      ...req.body,
      custom_image: req.body?.custom_image ?? req.body?.customImage,
    });
    res.json({ success: true, petId: data.petId, pet: data.pet });
  }),
);

router.post(
  '/interact',
  asyncHandler(async (req, res) => {
    const data = service.interact(req.body?.studentId, req.body);
    res.json({ success: true, pet: data.pet, points: data.points });
  }),
);

router.put(
  '/:studentId',
  asyncHandler(async (req, res) => {
    const data = service.updatePet(req.params.studentId, req.body);
    res.json({ success: true, message: 'Pet updated successfully', pet: data.pet });
  }),
);

export default router;
