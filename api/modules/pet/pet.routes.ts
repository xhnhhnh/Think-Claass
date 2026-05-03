import { Router, type Response } from 'express';

import { asyncHandler } from '../../utils/asyncHandler.js';
import type { PetService } from './pet.service.js';

function ok<T>(res: Response, data: T, message?: string, legacyPayload: Record<string, unknown> = {}) {
  res.json(message ? { success: true, data, message, ...legacyPayload } : { success: true, data, ...legacyPayload });
}

export function createPetRouter(service: PetService) {
  const router = Router();

  router.get(
    '/students/:studentId',
    asyncHandler(async (req, res) => {
      const data = service.getStudentPet(req.params.studentId);
      ok(res, data, undefined, { pet: data.pet, has_parent_buff: data.hasParentBuff });
    }),
  );

  router.get(
    '/students/:studentId/dashboard',
    asyncHandler(async (req, res) => {
      const data = service.getStudentDashboard(req.params.studentId);
      ok(res, data);
    }),
  );

  router.get(
    '/students/:studentId/classmates',
    asyncHandler(async (req, res) => {
      const classmatesPets = service.listClassmates(req.params.studentId);
      ok(res, { classmatesPets }, undefined, { classmatesPets });
    }),
  );

  router.post(
    '/students/:studentId/adoptions',
    asyncHandler(async (req, res) => {
      const data = service.adoptPet(req.params.studentId, {
        ...req.body,
        custom_image: req.body?.custom_image ?? req.body?.customImage,
      });
      ok(res, data, undefined, { petId: data.petId, pet: data.pet });
    }),
  );

  router.post(
    '/students/:studentId/actions',
    asyncHandler(async (req, res) => {
      const data = service.interact(req.params.studentId, req.body);
      ok(res, data, undefined, { pet: data.pet, points: data.points });
    }),
  );

  router.put(
    '/students/:studentId',
    asyncHandler(async (req, res) => {
      const data = service.updatePet(req.params.studentId, req.body);
      ok(res, data, 'Pet updated successfully', { pet: data.pet });
    }),
  );

  router.get(
    '/classes/:classId',
    asyncHandler(async (req, res) => {
      const students = service.listClassPets(req.params.classId);
      ok(res, { students }, undefined, { students });
    }),
  );

  router.get(
    '/classes/:classId/leaderboard',
    asyncHandler(async (req, res) => {
      const leaderboard = service.listLeaderboard(req.params.classId);
      ok(res, { leaderboard }, undefined, { leaderboard });
    }),
  );

  router.post(
    '/battles',
    asyncHandler(async (req, res) => {
      const result = service.battle(req.body);
      ok(res, { result }, undefined, { result });
    }),
  );

  return router;
}
