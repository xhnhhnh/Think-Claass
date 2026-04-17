import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}));

import { slgApi } from '../slg';

describe('slgApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
  });

  it('loads map for class id', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, territories: [], resources: {} });
    await slgApi.getMap(8);
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/slg/map/8');
  });

  it('triggers yield for class id', async () => {
    mocks.apiPost.mockResolvedValue({ success: true });
    await slgApi.triggerYield(8);
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/slg/teacher/yield/8');
  });
});
