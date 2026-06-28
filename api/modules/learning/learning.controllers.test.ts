import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';
import {
  AssignmentsController,
  ExamsController,
  KnowledgeController,
  PaperSubmissionsController,
  PapersController,
  StudyPlansController,
  WrongQuestionsController,
} from './learning.controllers';

function expectHttpError(error: unknown, status: number, message: string) {
  expect(error).toBeInstanceOf(HttpException);
  const httpError = error as HttpException;
  expect(httpError.getStatus()).toBe(status);
  expect(httpError.getResponse()).toEqual({ success: false, message });
}

describe('Learning Nest controllers', () => {
  it('keeps assignment legacy list and create payload shapes', () => {
    const service = {
      listAssignments: vi.fn().mockReturnValue([{ id: 1, title: '阅读' }]),
      createAssignment: vi.fn().mockReturnValue({ id: 2, title: '数学' }),
    };
    const controller = new AssignmentsController(service as any);

    expect(controller.listAssignments('10')).toEqual({
      success: true,
      data: [{ id: 1, title: '阅读' }],
    });
    expect(service.listAssignments).toHaveBeenCalledWith('10');
    expect(controller.createAssignment({ title: '数学' })).toEqual({
      success: true,
      data: { id: 2, title: '数学' },
      id: 2,
      title: '数学',
    });
  });

  it('keeps exam legacy create and grades payload shapes', () => {
    const service = {
      createExam: vi.fn().mockReturnValue({ id: 3, title: '期中' }),
      getGrades: vi.fn().mockReturnValue({ grades: [{ student_id: 1, score: 98 }] }),
      saveGrades: vi.fn().mockReturnValue({ updated: 1 }),
    };
    const controller = new ExamsController(service as any);

    expect(controller.createExam({ title: '期中' })).toEqual({
      success: true,
      data: { id: 3, title: '期中' },
      id: 3,
      title: '期中',
    });
    expect(controller.getGrades('3')).toEqual({
      success: true,
      data: { grades: [{ student_id: 1, score: 98 }] },
      grades: [{ student_id: 1, score: 98 }],
    });
    expect(controller.saveGrades('3', { grades: [{ student_id: 1, score: 98 }] })).toEqual({
      success: true,
      data: { updated: 1 },
    });
  });

  it('maps assignment ApiError without changing status or message', () => {
    const controller = new AssignmentsController({
      createAssignment: vi.fn(() => {
        throw new ApiError(400, 'Missing title');
      }),
    } as any);

    try {
      controller.createAssignment({});
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 400, 'Missing title');
    }
  });

  it('delegates knowledge subjects, nodes, edges, and delete responses', async () => {
    const service = {
      listSubjects: vi.fn().mockResolvedValue([{ id: 1, name: '数学' }]),
      createSubject: vi.fn().mockResolvedValue({ id: 2, name: '语文' }),
      listKnowledgeNodes: vi.fn().mockResolvedValue([{ id: 10 }]),
      createKnowledgeNode: vi.fn().mockResolvedValue({ id: 11 }),
      updateKnowledgeNode: vi.fn().mockResolvedValue({ id: 11, name: '函数' }),
      deleteKnowledgeNode: vi.fn().mockResolvedValue(undefined),
      listKnowledgeEdges: vi.fn().mockResolvedValue([{ id: 20 }]),
      createKnowledgeEdge: vi.fn().mockResolvedValue({ id: 21 }),
      deleteKnowledgeEdge: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new KnowledgeController(service as any);
    const req = {} as any;

    await expect(controller.getSubjects()).resolves.toEqual({ success: true, data: [{ id: 1, name: '数学' }] });
    await expect(controller.createSubject(req, { name: '语文' })).resolves.toEqual({ success: true, data: { id: 2, name: '语文' } });
    await expect(controller.getNodes('1')).resolves.toEqual({ success: true, data: [{ id: 10 }] });
    await expect(controller.createNode(req, { subject_id: 1, name: '函数' })).resolves.toEqual({ success: true, data: { id: 11 } });
    await expect(controller.updateNode(req, '11', { name: '导数' })).resolves.toEqual({ success: true, data: { id: 11, name: '函数' } });
    await expect(controller.deleteNode(req, '11')).resolves.toEqual({ success: true });
    await expect(controller.getEdges('1')).resolves.toEqual({ success: true, data: [{ id: 20 }] });
    await expect(controller.createEdge(req, { subject_id: 1, from_node_id: 1, to_node_id: 2, edge_type: 'requires' })).resolves.toEqual({
      success: true,
      data: { id: 21 },
    });
    await expect(controller.deleteEdge(req, '21')).resolves.toEqual({ success: true });
  });

  it('maps paper errors and keeps upload success shape', async () => {
    const service = {
      listPapers: vi.fn().mockResolvedValue([{ id: 1 }]),
      getPaper: vi.fn().mockRejectedValue(new ApiError(404, 'Paper not found')),
      uploadPaperAsset: vi.fn().mockResolvedValue({ id: 4, storage_path: '/uploads/papers/a.pdf' }),
    };
    const controller = new PapersController(service as any);
    const req = {} as any;

    await expect(controller.listPapers(req, '2')).resolves.toEqual({ success: true, data: [{ id: 1 }] });
    try {
      await controller.getPaper(req, '99');
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 404, 'Paper not found');
    }
    await expect(controller.uploadAsset(req, '1', { originalname: 'a.pdf' } as any)).resolves.toEqual({
      success: true,
      data: { id: 4, storage_path: '/uploads/papers/a.pdf' },
    });
  });

  it('keeps paper submission success and Missing answers error responses', async () => {
    const service = {
      startPaperSubmission: vi.fn().mockResolvedValue({ submission: { id: 1 }, items: [] }),
      savePaperAnswers: vi.fn().mockRejectedValue(new ApiError(400, 'Missing answers')),
      submitPaper: vi.fn().mockResolvedValue({ submission_id: 1, total_score: 5 }),
    };
    const controller = new PaperSubmissionsController(service as any);
    const req = {} as any;

    await expect(controller.start(req, { paper_id: 1 })).resolves.toEqual({
      success: true,
      data: { submission: { id: 1 }, items: [] },
    });
    try {
      await controller.saveAnswers(req, '1', { answers: [] });
      throw new Error('Expected controller to throw');
    } catch (error) {
      expectHttpError(error, 400, 'Missing answers');
    }
    await expect(controller.submit(req, '1')).resolves.toEqual({
      success: true,
      data: { submission_id: 1, total_score: 5 },
    });
  });

  it('keeps wrong question and study plan controller shapes', async () => {
    const learningService = {
      listWrongQuestions: vi.fn().mockResolvedValue([{ id: 1 }]),
      attemptWrongQuestion: vi.fn().mockResolvedValue(undefined),
      generateWrongQuestionPractice: vi.fn().mockResolvedValue([{ id: 9 }]),
      getMyStudyPlan: vi.fn().mockResolvedValue({ id: 2 }),
      createStudyPlan: vi.fn().mockResolvedValue({ id: 3 }),
      updateStudyPlanItem: vi.fn().mockResolvedValue({ id: 4, status: 'done' }),
    };
    const wrongController = new WrongQuestionsController(learningService as any);
    const studyController = new StudyPlansController(learningService as any);
    const req = {} as any;

    await expect(wrongController.my(req)).resolves.toEqual({ success: true, data: [{ id: 1 }] });
    await expect(wrongController.attempt(req, '1', { is_correct: 1 })).resolves.toEqual({ success: true });
    await expect(wrongController.generate(req, '1')).resolves.toEqual({ success: true, data: [{ id: 9 }] });
    await expect(studyController.my(req)).resolves.toEqual({ success: true, data: { id: 2 } });
    await expect(studyController.create(req, { target_score: 90 })).resolves.toEqual({ success: true, data: { id: 3 } });
    await expect(studyController.updateItem(req, '4', { status: 'done' })).resolves.toEqual({
      success: true,
      data: { id: 4, status: 'done' },
    });
  });
});
