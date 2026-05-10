import { Router, type Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import type { AssignmentsService } from './assignments.service.js';

function ok<T>(res: Response, data: T, legacyPayload: Record<string, unknown> = {}) {
  res.json({ success: true, data, ...legacyPayload });
}

export function createAssignmentsRouter(service: AssignmentsService) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => ok(res, service.listAssignments(req.query.class_id))));
  router.post('/', asyncHandler(async (req, res) => {
    const data = service.createAssignment(req.body);
    ok(res, data, data);
  }));
  router.put('/:id', asyncHandler(async (req, res) => ok(res, service.updateAssignment(req.params.id, req.body))));
  router.delete('/:id', asyncHandler(async (req, res) => ok(res, service.deleteAssignment(req.params.id))));
  router.get('/student-assignments', asyncHandler(async (req, res) => ok(res, service.listStudentAssignments(req.query))));
  router.put('/student-assignments/:id', asyncHandler(async (req, res) => ok(res, service.updateStudentAssignment(req.params.id, req.body))));

  return router;
}
