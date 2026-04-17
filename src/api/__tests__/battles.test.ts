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

import { battlesApi } from '../battles';

describe('battlesApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
  });

  it('searches classes with query and exclusion', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, classes: [] });
    await battlesApi.searchClasses('一班', 3);
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/battles/classes/search?q=%E4%B8%80%E7%8F%AD&excludeClassId=3');
  });

  it('initiates battle with class ids', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, battleId: 1 });
    await battlesApi.initiateBattle({ initiator_class_id: 1, target_class_id: 2 });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/battles/teacher/initiate', {
      initiator_class_id: 1,
      target_class_id: 2,
    });
  });
});
