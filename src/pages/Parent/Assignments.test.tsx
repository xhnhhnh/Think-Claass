import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ParentAssignments from './Assignments';

const mocks = vi.hoisted(() => ({
  useStudentReport: vi.fn(),
  useSettings: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/hooks/queries/useAnalytics', () => ({
  useStudentReport: mocks.useStudentReport,
}));

vi.mock('@/hooks/queries/useSettings', () => ({
  useSettings: mocks.useSettings,
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) => selector({ user: { id: 8, role: 'parent', studentId: 7 } }),
}));

/**
 * 学习采撷 honours the same switch as 成长足迹.
 *
 * Both screens render `GET /api/analytics/students/:id/report`; only 成长足迹 checked
 * `enable_parent_report`, so an admin who switched the report off still had the child's assignments
 * and grades readable at the other URL.
 */
describe('ParentAssignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useStudentReport.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mocks.refetch,
    });
  });

  it('closes the page when the admin switched the parent report off', () => {
    mocks.useSettings.mockReturnValue({ data: { enable_parent_report: '0' } });

    render(<ParentAssignments />);

    expect(screen.getByText('报告功能暂未开放')).toBeInTheDocument();
    expect(screen.queryByText('正在获取学习记录...')).not.toBeInTheDocument();
  });

  it('renders normally while the report is on', () => {
    mocks.useSettings.mockReturnValue({ data: { enable_parent_report: '1' } });

    render(<ParentAssignments />);

    expect(screen.getByText('正在获取学习记录...')).toBeInTheDocument();
    expect(screen.queryByText('报告功能暂未开放')).not.toBeInTheDocument();
  });

  it('keeps rendering while the settings answer is still in flight', () => {
    // The flag's default is on, and a page that flashes "switched off" for one frame is a worse lie
    // than one that shows the real content a moment later.
    mocks.useSettings.mockReturnValue({ data: undefined });

    render(<ParentAssignments />);

    expect(screen.getByText('正在获取学习记录...')).toBeInTheDocument();
  });

  /** A failed read used to be a red sentence with no retry - only a full reload recovered. */
  it('offers a retry on the error branch instead of dead-ending', () => {
    mocks.useSettings.mockReturnValue({ data: { enable_parent_report: '1' } });
    mocks.useStudentReport.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('offline'),
      refetch: mocks.refetch,
    });

    render(<ParentAssignments />);

    expect(screen.getByText('学习记录加载失败，请稍后重试。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});
