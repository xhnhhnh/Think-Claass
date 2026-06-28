import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../utils/apiError';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    $transaction: vi.fn(),
    knowledge_edges: {
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    knowledge_nodes: {
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    paper_answers: {
      findMany: vi.fn(),
    },
    paper_assets: {
      create: vi.fn(),
    },
    paper_items: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    paper_submissions: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    papers: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    question_knowledge: {
      findMany: vi.fn(),
    },
    questions: {
      findMany: vi.fn(),
    },
    students: {
      findFirst: vi.fn(),
    },
    study_plan_items: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    study_plans: {
      findFirst: vi.fn(),
    },
    subjects: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    wrong_questions: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../prismaClient.js', () => ({ prisma: prismaMock }));

import { LearningService } from './learning.service';

function mockReq(role: string, id: number | null = 1): Request {
  return {
    header(name: string) {
      if (name === 'x-user-role') return role;
      if (name === 'x-user-id') return id === null ? undefined : String(id);
      return undefined;
    },
  } as Request;
}

async function expectApiError(promise: Promise<unknown>, statusCode: number, message: string) {
  try {
    await promise;
    throw new Error('Expected promise to reject');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(statusCode);
    expect((error as ApiError).message).toBe(message);
  }
}

describe('LearningService', () => {
  let service: LearningService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new LearningService();
  });

  it('lists and creates knowledge resources with legacy validation', async () => {
    prismaMock.subjects.findMany.mockResolvedValue([{ id: 1, name: '数学' }]);
    prismaMock.subjects.create.mockResolvedValue({ id: 2, name: '语文', stage: null, grade: 3 });
    prismaMock.knowledge_nodes.findMany.mockResolvedValue([{ id: 10, subject_id: 1 }]);
    prismaMock.knowledge_nodes.create.mockResolvedValue({ id: 11, subject_id: 1, name: '函数' });
    prismaMock.knowledge_nodes.update.mockResolvedValue({ id: 11, name: '导数' });
    prismaMock.knowledge_edges.findMany.mockResolvedValue([{ id: 20, subject_id: 1 }]);
    prismaMock.knowledge_edges.create.mockResolvedValue({ id: 21, edge_type: 'requires' });

    await expect(service.listSubjects()).resolves.toEqual([{ id: 1, name: '数学' }]);
    await expect(service.createSubject(mockReq('teacher', 5), { name: '语文', grade: '3' })).resolves.toEqual({
      id: 2,
      name: '语文',
      stage: null,
      grade: 3,
    });
    try {
      service.listKnowledgeNodes(undefined);
      throw new Error('Expected listKnowledgeNodes to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(400);
      expect((error as ApiError).message).toBe('Missing or invalid subject_id');
    }
    await expect(service.listKnowledgeNodes('1')).resolves.toEqual([{ id: 10, subject_id: 1 }]);
    await expect(service.createKnowledgeNode(mockReq('teacher', 5), { subject_id: '1', name: '函数' })).resolves.toEqual({
      id: 11,
      subject_id: 1,
      name: '函数',
    });
    await expect(service.updateKnowledgeNode(mockReq('admin', 1), '11', { name: '导数' })).resolves.toEqual({ id: 11, name: '导数' });
    await service.deleteKnowledgeNode(mockReq('superadmin', 1), '11');
    expect(prismaMock.knowledge_nodes.delete).toHaveBeenCalledWith({ where: { id: 11 } });
    await expect(service.listKnowledgeEdges('1')).resolves.toEqual([{ id: 20, subject_id: 1 }]);
    await expect(
      service.createKnowledgeEdge(mockReq('teacher', 5), { subject_id: 1, from_node_id: 10, to_node_id: 11, edge_type: 'requires' }),
    ).resolves.toEqual({ id: 21, edge_type: 'requires' });
    await service.deleteKnowledgeEdge(mockReq('teacher', 5), '21');
    expect(prismaMock.knowledge_edges.delete).toHaveBeenCalledWith({ where: { id: 21 } });
  });

  it('enforces paper permissions, publish validation, structure save, and upload outcomes', async () => {
    const req = mockReq('teacher', 5);
    prismaMock.papers.findMany.mockResolvedValue([{ id: 1, teacher_id: 5 }]);
    prismaMock.papers.create.mockResolvedValue({ id: 2, title: '周测' });
    prismaMock.papers.findUnique.mockResolvedValue({ id: 2, teacher_id: 5, subject_id: 1 });
    prismaMock.paper_items.count.mockResolvedValue(0);

    await expect(service.listPapers(req, '3')).resolves.toEqual([{ id: 1, teacher_id: 5 }]);
    await expect(service.createPaper(req, { title: '周测', class_id: '3' })).resolves.toEqual({ id: 2, title: '周测' });
    await expectApiError(service.updatePaper(req, '2', { status: 'published' }), 400, '试卷没有题目，无法发布');
    await expectApiError(service.uploadPaperAsset(req, '2', undefined), 400, 'Missing file');

    const tx = {
      paper_items: {
        create: vi.fn().mockResolvedValue({ id: 200, order_no: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      paper_sections: {
        create: vi.fn().mockResolvedValue({ id: 100, order_no: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      questions: {
        create: vi.fn().mockResolvedValue({ id: 300 }),
      },
      rubric_points: {
        create: vi.fn().mockResolvedValue({ id: 400 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(tx));
    prismaMock.papers.findFirst.mockResolvedValue({ id: 2, paper_sections: [], paper_items: [] });

    await expect(
      service.savePaperStructure(req, '2', {
        sections: [{ title: '一', order_no: 1 }],
        items: [{ order_no: 1, section_order_no: 1, question: { stem: '1+1', type: 'single', answer_json: '2' } }],
        rubric_points: [{ paper_item_order_no: 1, label: '步骤', points: 2, step_order: 1 }],
      }),
    ).resolves.toEqual({ id: 2, paper_sections: [], paper_items: [] });
    expect(tx.rubric_points.deleteMany).toHaveBeenCalled();
    expect(tx.questions.create).toHaveBeenCalled();

    const tempPath = path.join(os.tmpdir(), `learning-upload-${Date.now()}.txt`);
    fs.writeFileSync(tempPath, 'hello');
    prismaMock.paper_assets.create.mockImplementation(async ({ data }: any) => ({ id: 9, ...data }));

    const createdAsset = await service.uploadPaperAsset(req, '2', {
      mimetype: 'text/plain',
      originalname: 'note.txt',
      path: tempPath,
      size: 5,
    } as Express.Multer.File);

    expect(createdAsset).toMatchObject({
      id: 9,
      kind: 'file',
      mime: 'text/plain',
      paper_id: 2,
      size: 5,
      sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    });
    if (typeof createdAsset.storage_path === 'string') {
      const savedPath = path.join(process.cwd(), createdAsset.storage_path.replace(/^\//, ''));
      if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
    }
  });

  it('starts, saves, and submits paper submissions with wrong-question and study-plan side effects', async () => {
    const req = mockReq('student', 8);
    prismaMock.students.findFirst.mockResolvedValue({ id: 80, user_id: 8, class_id: 6 });
    prismaMock.papers.findUnique.mockResolvedValue({ id: 30, class_id: 6, status: 'published' });
    prismaMock.paper_submissions.create.mockResolvedValue({ id: 70, paper_id: 30, student_id: 80 });
    prismaMock.paper_items.findMany.mockResolvedValue([{ id: 501, order_no: 1 }]);

    await expect(service.startPaperSubmission(req, { paper_id: '30' })).resolves.toEqual({
      submission: { id: 70, paper_id: 30, student_id: 80 },
      items: [{ id: 501, order_no: 1 }],
    });

    prismaMock.paper_submissions.findUnique.mockResolvedValue({ id: 70, student_id: 80, submitted_at: null });
    await expectApiError(service.savePaperAnswers(req, '70', { answers: [] }), 400, 'Missing answers');

    const answersToScore = [
      {
        id: 1,
        answer_json: '"A"',
        paper_item_id: 501,
        score: null,
        paper_items: {
          points_override: 5,
          questions: { id: 900, answer_json: '"B"', default_points: 5, is_subjective: 0 },
        },
      },
      {
        id: 2,
        answer_json: '"C"',
        paper_item_id: 502,
        score: null,
        paper_items: {
          points_override: 5,
          questions: { id: 901, answer_json: '"C"', default_points: 5, is_subjective: 0 },
        },
      },
    ];
    prismaMock.paper_submissions.findFirst.mockResolvedValue({
      id: 70,
      paper_id: 30,
      student_id: 80,
      submitted_at: null,
      paper_answers: answersToScore,
    });

    const tx = {
      paper_answers: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue(answersToScore),
        update: vi.fn().mockResolvedValue(undefined),
      },
      paper_items: {
        findMany: vi.fn().mockResolvedValue([{ id: 501 }, { id: 502 }]),
      },
      paper_submissions: {
        update: vi.fn().mockResolvedValue(undefined),
      },
      study_plan_items: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      study_plans: {
        create: vi.fn().mockResolvedValue({ id: 40 }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      wrong_questions: {
        create: vi.fn().mockResolvedValue({ id: 50 }),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await expect(service.submitPaper(req, '70')).resolves.toEqual({
      paper_id: 30,
      submission_id: 70,
      total_score: 5,
      correct_count: 1,
      wrong_count: 1,
    });
    expect(tx.wrong_questions.create).toHaveBeenCalledWith({
      data: { student_id: 80, question_id: 900, wrong_count: 1, mastery_score: 0 },
    });
    expect(tx.study_plan_items.create).toHaveBeenCalledWith({
      data: { plan_id: 40, kind: 'practice', question_id: 900, estimated_min: 10, status: 'pending' },
    });
  });

  it('handles wrong-question list, mastery attempts, and fallback generation', async () => {
    const req = mockReq('student', 8);
    prismaMock.students.findFirst.mockResolvedValue({ id: 80, user_id: 8, class_id: 6 });
    prismaMock.wrong_questions.findMany.mockResolvedValue([{ id: 1, student_id: 80 }]);
    prismaMock.wrong_questions.findUnique.mockResolvedValue({ id: 1, student_id: 80, mastery_score: 0.8 });
    prismaMock.wrong_questions.findFirst.mockResolvedValue({
      id: 1,
      question_id: 900,
      student_id: 80,
      questions: { subject_id: 2, type: 'single' },
    });
    prismaMock.question_knowledge.findMany.mockResolvedValue([]);
    prismaMock.questions.findMany.mockResolvedValue([{ id: 901 }]);

    await expect(service.listWrongQuestions(req)).resolves.toEqual([{ id: 1, student_id: 80 }]);

    const tx = {
      wrong_question_attempts: {
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
      wrong_questions: {
        update: vi.fn().mockResolvedValue({ id: 1, mastery_score: 1 }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await service.attemptWrongQuestion(req, '1', { is_correct: 1, spent_sec: '12', practice_source: 'review' });
    expect(tx.wrong_questions.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        mastery_score: 1,
        cleared_at: expect.any(Date),
        updated_at: expect.any(Date),
      },
    });

    await expect(service.generateWrongQuestionPractice(req, '1')).resolves.toEqual([{ id: 901 }]);
    expect(prismaMock.questions.findMany).toHaveBeenCalledWith({
      where: {
        id: { not: 900 },
        subject_id: 2,
        type: 'single',
      },
      take: 5,
      orderBy: { id: 'desc' },
    });
  });

  it('archives old active study plans and checks item ownership before updates', async () => {
    const req = mockReq('student', 8);
    prismaMock.students.findFirst.mockResolvedValue({ id: 80, user_id: 8, class_id: 6 });
    prismaMock.study_plans.findFirst.mockResolvedValue({ id: 3, student_id: 80, status: 'active' });
    prismaMock.study_plan_items.findFirst.mockResolvedValue({
      id: 4,
      study_plans: { student_id: 80 },
    });
    prismaMock.study_plan_items.update.mockResolvedValue({ id: 4, status: 'done' });

    await expect(service.getMyStudyPlan(req)).resolves.toEqual({ id: 3, student_id: 80, status: 'active' });

    const tx = {
      study_plans: {
        create: vi.fn().mockResolvedValue({ id: 5, status: 'active' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await expect(service.createStudyPlan(req, { target_score: '95' })).resolves.toEqual({ id: 5, status: 'active' });
    expect(tx.study_plans.updateMany).toHaveBeenCalledWith({
      where: { student_id: 80, status: 'active' },
      data: { status: 'archived', updated_at: expect.any(Date) },
    });
    await expect(service.updateStudyPlanItem(req, '4', { status: 'done' })).resolves.toEqual({ id: 4, status: 'done' });
  });
});
