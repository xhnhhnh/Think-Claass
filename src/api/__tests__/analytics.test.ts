import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiGet: mocks.apiGet,
}));

import { analyticsApi } from '../analytics';

describe('analyticsApi', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
  });

  it('loads teacher class overview by class id', async () => {
    mocks.apiGet.mockResolvedValue({ success: true });

    await analyticsApi.getClassOverview(3);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/analytics/classes/3/overview');
  });

  it('loads parent student report by student id', async () => {
    mocks.apiGet.mockResolvedValue({ success: true });

    await analyticsApi.getStudentReport(9);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/analytics/students/9/report');
  });

  it('loads student radar summary for teacher dashboard', async () => {
    mocks.apiGet.mockResolvedValue({ success: true });

    await analyticsApi.getStudentRadar(11);

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/analytics/students/11/radar');
  });
});
