import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
}));

import { praisesApi } from '../praises';

describe('praisesApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
  });

  it('loads praises for a student through the API module', async () => {
    mocks.apiGet.mockResolvedValue({ success: true, praises: [] });
    await praisesApi.getStudentPraises(6);
    expect(mocks.apiGet).toHaveBeenCalledWith('/api/praises/student/6');
  });
});

