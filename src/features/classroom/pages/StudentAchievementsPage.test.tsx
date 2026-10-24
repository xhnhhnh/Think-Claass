import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAchievements: vi.fn(),
}));

vi.mock('@/features/classroom/api/studentsApi', () => ({
  studentsApi: { getAchievements: mocks.getAchievements },
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 5, role: 'student', studentId: 101 } }),
}));

import StudentAchievementsPage from './StudentAchievementsPage';

function renderPage() {
  return render(<StudentAchievementsPage />);
}

/**
 * 成就墙 - the wall must agree with the counter.
 *
 * The read route answers the recorded names, and the page types them as rows. Reading
 * `a.achievement_name` off a string made every badge 未解锁 while 「已解锁成就 N / 3」 showed the
 * real count; these tests pin the normalised shape and the "no invented unlock date" rendering.
 */
describe('StudentAchievementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the achieved badge as unlocked and only the others as 未解锁', async () => {
    mocks.getAchievements.mockResolvedValue({
      success: true,
      achievements: [{ achievement_name: '初出茅庐' }],
      newAchievements: [],
    });

    renderPage();

    // The counter and the grid read the same list.
    expect(await screen.findByText('初出茅庐')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('未解锁')).toHaveLength(2));
    expect(screen.getByText('已解锁')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    expect(screen.queryByText(/解锁于/)).not.toBeInTheDocument();
  });

  it('renders the unlock date when the read actually carries one', async () => {
    mocks.getAchievements.mockResolvedValue({
      success: true,
      achievements: [{ achievement_name: '初出茅庐', unlocked_at: '2026-05-01T00:00:00.000Z' }],
      newAchievements: [],
    });

    renderPage();

    expect(await screen.findByText(/解锁于/)).toBeInTheDocument();
    expect(screen.queryByText('已解锁')).not.toBeInTheDocument();
  });
});
