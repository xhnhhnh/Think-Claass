import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiPost: mocks.apiPost,
}));

import { parentBuffApi } from '../parentBuff';

describe('parentBuffApi', () => {
  it('casts parent buff for student', async () => {
    mocks.apiPost.mockResolvedValue({ success: true });
    await parentBuffApi.cast(10);
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/parent-buff', { studentId: 10 });
  });
});
