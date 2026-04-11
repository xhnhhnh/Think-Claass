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

import { teamQuestsApi } from '../teamQuests';

describe('teamQuestsApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
    mocks.apiDelete.mockReset();
  });

  it('builds list query with class and status filters', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, data: [] });

    await teamQuestsApi.getTeamQuests(3, 'active');

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/team-quests?class_id=3&status=active');
  });

  it('posts teacher team quest payload', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, id: 1 });

    await teamQuestsApi.createTeamQuest({
      class_id: 8,
      teacher_id: 12,
      title: '阅读挑战',
      description: '每组完成阅读目标',
      target_score: 10,
      reward_points: 50,
    });

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/team-quests', {
      class_id: 8,
      teacher_id: 12,
      title: '阅读挑战',
      description: '每组完成阅读目标',
      target_score: 10,
      reward_points: 50,
    });
  });

  it('submits team peer reviews through the shared endpoint', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, id: 9 });

    await teamQuestsApi.submitPeerReview({
      reviewer_id: 1,
      reviewee_id: 2,
      team_quest_id: 5,
      score: 4,
      comment: '配合很好',
    });

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/peer-reviews', {
      reviewer_id: 1,
      reviewee_id: 2,
      team_quest_id: 5,
      score: 4,
      comment: '配合很好',
    });
  });
});
