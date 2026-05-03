import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiDelete: mocks.apiDelete,
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}));

import { challengeApi } from '../challenge';

describe('challengeApi', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset();
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

  it('loads all world bosses', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, bosses: [] });
    await challengeApi.getWorldBosses();
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/challenge/boss');
  });

  it('deletes a world boss by id', async () => {
    mocks.apiDelete.mockResolvedValue({ success: true });
    await challengeApi.deleteWorldBoss(9);
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/challenge/boss/9');
  });
});
