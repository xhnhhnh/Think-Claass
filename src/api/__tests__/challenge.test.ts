import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}));

import { challengeApi } from '../challenge';

describe('challengeApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
  });

  it('loads challenge questions with limit', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, questions: [] });
    await challengeApi.getQuestions(5);
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/challenge/questions?limit=5');
  });

  it('submits answers with student context', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, score: 10 });
    await challengeApi.submitAnswers({ studentId: 11, answers: { 1: 'A' } });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/challenge/submit', {
      studentId: 11,
      answers: { 1: 'A' },
    });
  });
});
