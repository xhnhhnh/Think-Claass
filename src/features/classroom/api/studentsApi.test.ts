import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  apiGet,
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

import { studentsApi } from './studentsApi';

/**
 * The achievements route answers stored names, not rows.
 *
 * `plugins/classroom`'s `getAchievements` returns `{ achievements: Array.from(earnedSet) }`, i.e.
 * `['初出茅庐']`. The console type was `{ achievement_name }[]`, so the name was read off a string
 * and every badge rendered 未解锁. Normalising at the facade is the single boundary that keeps the
 * page (and `useStudentAchievements`) working without touching the public HTTP shape.
 */
describe('studentsApi.getAchievements', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('turns the names the server answers into achievement rows', async () => {
    apiGet.mockResolvedValueOnce({ success: true, achievements: ['初出茅庐', '自律骑士'], newAchievements: [] });

    const response = await studentsApi.getAchievements(101);

    expect(apiGet).toHaveBeenCalledWith('/api/students/101/achievements');
    expect(response.achievements).toEqual([
      { achievement_name: '初出茅庐' },
      { achievement_name: '自律骑士' },
    ]);
  });

  it('leaves a row-shaped answer alone', async () => {
    apiGet.mockResolvedValueOnce({
      success: true,
      achievements: [{ achievement_name: '初出茅庐', unlocked_at: '2026-05-01T00:00:00.000Z' }],
      newAchievements: [],
    });

    const response = await studentsApi.getAchievements(101);

    expect(response.achievements).toEqual([
      { achievement_name: '初出茅庐', unlocked_at: '2026-05-01T00:00:00.000Z' },
    ]);
  });
});
