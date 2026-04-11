import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
  apiDelete: mocks.apiDelete,
}));

import { examsApi } from '../exams';

describe('examsApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.apiDelete.mockReset();
  });

  it('builds exam list query with class filter', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, data: [] });

    await examsApi.getExams(4);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/exams?class_id=4');
  });

  it('loads exam grade details', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, exam: {}, grades: [] });

    await examsApi.getExamGrades(7);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/exams/7/grades');
  });

  it('saves grades in a single batch request', async () => {
    mocks.apiPut.mockResolvedValue({ success: true });

    await examsApi.saveExamGrades(7, [
      { student_id: 11, score: 98 },
      { student_id: 12, score: null },
    ]);

    expect(mocks.apiPut).toHaveBeenCalledWith('/api/exams/7/grades', {
      grades: [
        { student_id: 11, score: 98 },
        { student_id: 12, score: null },
      ],
    });
  });
});
