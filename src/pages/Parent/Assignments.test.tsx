import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ParentAssignments from './Assignments';

const mocks = vi.hoisted(() => ({
  useStudentReport: vi.fn(),
  useSettings: vi.fn(),
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
    mocks.useStudentReport.mockReturnValue({ data: undefined, isLoading: true, error: null });
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
});
