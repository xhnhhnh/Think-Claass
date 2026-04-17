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

import { gachaApi } from '../gacha';

describe('gachaApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiPut.mockReset();
  });

  it('requests pools by class id', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, pools: [] });
    await gachaApi.getPools(7);
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/gacha/pools/7');
  });

  it('posts draw payload', async () => {
    mocks.apiPost.mockResolvedValue({ success: true, results: [] });
    await gachaApi.draw(99, { poolId: 3, times: 10 });
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/gacha/draw/99', { poolId: 3, times: 10 });
  });
});
