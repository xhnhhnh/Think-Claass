import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StudentPeerReviewPage from './StudentPeerReviewPage';

const mocks = vi.hoisted(() => ({
  getPendingPeerReviews: vi.fn(),
  submitPeerReview: vi.fn(),
  listPeerReviews: vi.fn(),
  // One stable object: the page's effect keys off `user`, and a fresh object per render would make
  // it re-run for ever (which is what a `selector({ user: {...} })` mock does).
  user: { id: 5, role: 'student', studentId: 101 },
}));

vi.mock('@/features/classroom/api/studentsApi', () => ({
  studentsApi: {
    getPendingPeerReviews: mocks.getPendingPeerReviews,
    submitPeerReview: mocks.submitPeerReview,
  },
}));

vi.mock('@/features/collaboration/api/teamQuestsApi', () => ({
  teamQuestsApi: { listPeerReviews: mocks.listPeerReviews },
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) => selector({ user: mocks.user }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * 我的互评记录 - the read half of a write-only feature.
 *
 * `POST /api/peer-reviews` had a caller (the form on this page) while `GET /api/peer-reviews` had
 * none, so a pupil handed out peer reviews and never saw one: not the praise they received, and not
 * a record of what they wrote.
 */
describe('StudentPeerReviewPage 我的互评记录', () => {
  const review = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 1,
    reviewer_id: 102,
    reviewee_id: 101,
    assignment_id: 3,
    team_quest_id: null,
    score: 5,
    comment: '乐于助人',
    created_at: '2026-05-01 10:00:00',
    reviewer_name: '小红',
    reviewee_name: '小明',
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPendingPeerReviews.mockResolvedValue({ success: true, pending: [] });
    mocks.listPeerReviews.mockResolvedValue({ success: true, data: [] });
  });

  const renderPage = () => render(<StudentPeerReviewPage />);

  it('splits the scoped list into what I received and what I gave', async () => {
    mocks.listPeerReviews.mockResolvedValue({
      success: true,
      data: [
        review({ id: 1, reviewer_id: 102, reviewee_id: 101, reviewer_name: '小红', comment: '乐于助人' }),
        review({ id: 2, reviewer_id: 101, reviewee_id: 103, reviewee_name: '小刚', comment: '进步很大' }),
      ],
    });

    renderPage();

    await waitFor(() => expect(mocks.listPeerReviews).toHaveBeenCalledWith());

    expect(await screen.findByText('我收到的（1）')).toBeInTheDocument();
    expect(screen.getByText('我给出的（1）')).toBeInTheDocument();
    expect(screen.getByText('来自 小红')).toBeInTheDocument();
    expect(screen.getByText('写给 小刚')).toBeInTheDocument();
    expect(screen.getByText('乐于助人')).toBeInTheDocument();
    expect(screen.getByText('进步很大')).toBeInTheDocument();
  });

  it('falls back to a neutral label when a name no longer resolves', async () => {
    mocks.listPeerReviews.mockResolvedValue({
      success: true,
      data: [review({ reviewer_name: null })],
    });

    renderPage();

    expect(await screen.findByText('来自 一位同学')).toBeInTheDocument();
  });

  it('separates a failed read from having no records at all', async () => {
    mocks.listPeerReviews.mockRejectedValueOnce(new Error('offline'));

    renderPage();

    expect(await screen.findByText('互评记录没有加载出来')).toBeInTheDocument();
    expect(screen.queryByText('还没有收到同学的评价。')).not.toBeInTheDocument();
  });

  it('says the lists are empty when they really are', async () => {
    renderPage();

    expect(await screen.findByText('还没有收到同学的评价。')).toBeInTheDocument();
    expect(screen.getByText('你还没有给同学写过评价。')).toBeInTheDocument();
    // The counts still render, so the section is present rather than silently missing.
    expect(screen.getByText('我收到的（0）')).toBeInTheDocument();
    expect(screen.getByText('我给出的（0）')).toBeInTheDocument();
  });
});
