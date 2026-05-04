import { Router, type Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import type { ExamsService } from './exams.service.js';

function ok<T>(res: Response, data: T, legacyPayload: Record<string, unknown> = {}) {
  res.json({ success: true, data, ...legacyPayload });
}

export function createExamsRouter(service: ExamsService) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => ok(res, service.listExams(req.query.class_id))));
  router.post('/', asyncHandler(async (req, res) => {
    const data = service.createExam(req.body);
    ok(res, data, data);
  }));
  router.get('/:id/grades', asyncHandler(async (req, res) => {
    const data = service.getGrades(req.params.id);
    ok(res, data, data);
  }));
  router.put('/:id/grades', asyncHandler(async (req, res) => ok(res, service.saveGrades(req.params.id, req.body?.grades))));
  router.put('/:id', asyncHandler(async (req, res) => ok(res, service.updateExam(req.params.id, req.body))));
  router.delete('/:id', asyncHandler(async (req, res) => ok(res, service.deleteExam(req.params.id))));
  router.get('/student-exams', asyncHandler(async (req, res) => ok(res, service.listStudentExams(req.query))));
  router.put('/student-exams/:id', asyncHandler(async (req, res) => ok(res, service.updateStudentExam(req.params.id, req.body))));

  return router;
}
