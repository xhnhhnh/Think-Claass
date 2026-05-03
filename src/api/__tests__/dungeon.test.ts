import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}));

import { dungeonApi } from '../dungeon';

describe('dungeonApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
  });

  it('loads current student run from the feature path', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, data: { run: null, best_floor: 0 } });
    await dungeonApi.getRun(42);
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/dungeon/students/42/run');
  });

  it('posts a floor choice to the feature path', async () => {
    const choice = { hpCost: 10, rewardType: 'points' as const, rewardValue: 50 };
    mocks.apiPost.mockResolvedValue({ success: true, data: { status: 'active', newHp: 90, newFloor: 2 } });
    await dungeonApi.choose(42, choice);
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/dungeon/students/42/choices', choice);
  });
});
