import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useActiveAnnouncement: vi.fn(),
}));

vi.mock('@/features/engagement/hooks/useAnnouncements', () => ({
  useActiveAnnouncement: mocks.useActiveAnnouncement,
}));

import AnnouncementBanner from './AnnouncementBanner';

describe('AnnouncementBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.useActiveAnnouncement.mockReset();
  });

  it('renders and dismisses the active announcement', () => {
    mocks.useActiveAnnouncement.mockReturnValue({
      data: { id: 4, title: '通知', content: '今天正常上课' },
    });

    render(<AnnouncementBanner />);

    expect(screen.getByText('通知:')).toBeInTheDocument();
    expect(screen.getByText('今天正常上课')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('关闭'));

    expect(localStorage.getItem('dismissed_announcement')).toBe('4');
    expect(screen.queryByText('今天正常上课')).not.toBeInTheDocument();
  });

  it('keeps a dismissed announcement hidden', () => {
    localStorage.setItem('dismissed_announcement', '4');
    mocks.useActiveAnnouncement.mockReturnValue({
      data: { id: 4, title: '通知', content: '今天正常上课' },
    });

    render(<AnnouncementBanner />);

    expect(screen.queryByText('今天正常上课')).not.toBeInTheDocument();
  });
});
