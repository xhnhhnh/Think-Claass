import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiPut: mocks.apiPut,
}));

import { knowledgeApi } from '../knowledge';
import { papersApi } from '../papers';
import { paperSubmissionsApi } from '../paperSubmissions';
import { studyPlansApi } from '../studyPlans';
import { wrongQuestionsApi } from '../wrongQuestions';

describe('learning content APIs', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
  });

  it('loads paper details and uploads assets', async () => {
    const formData = new FormData();
    mocks.apiGet.mockResolvedValue({ success: true, data: {} });
    mocks.apiPost.mockResolvedValue({ success: true, data: {} });
    await papersApi.get(4);
    await papersApi.uploadAsset(4, formData);
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/papers/4');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/papers/4/assets', formData);
  });

  it('uses stable paths for submission flow', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, data: {} });
    mocks.apiPut.mockResolvedValue({ success: true });
    await paperSubmissionsApi.start(9);
    await paperSubmissionsApi.saveAnswers(2, [{ paper_item_id: 1, answer_json: 'A' }]);
    await paperSubmissionsApi.submit(2);
    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, '/api/paper-submissions/start', { paper_id: 9 });
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/paper-submissions/2/answers', { answers: [{ paper_item_id: 1, answer_json: 'A' }] });
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, '/api/paper-submissions/2/submit', {});
  });

  it('covers knowledge, wrong question, and study plan endpoints', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, data: [] });
    mocks.apiPost.mockResolvedValue({ success: true, data: {} });
    mocks.apiPut.mockResolvedValue({ success: true, data: {} });
    await knowledgeApi.getNodes(5);
    await wrongQuestionsApi.generate(7);
    await studyPlansApi.updateItem(11, { status: 'done' });
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/knowledge/nodes?subject_id=5');
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/wrong-questions/7/generate', {});
    expect(mocks.apiPut).toHaveBeenCalledWith('/api/study-plans/items/11', { status: 'done' });
  });
});
