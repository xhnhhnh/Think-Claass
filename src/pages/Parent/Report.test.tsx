import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ParentReport from './Report';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
  useSettings: vi.fn(),
  useStudentReport: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

vi.mock('@/hooks/queries/useSettings', () => ({
  useSettings: mocks.useSettings,
}));

vi.mock('@/hooks/queries/useAnalytics', () => ({
  useStudentReport: mocks.useStudentReport,
}));

describe('ParentReport', () => {
  beforeEach(() => {
    mocks.useStore.mockImplementation((selector: any) =>
      selector({ user: { studentId: 6 } }),
    );
    mocks.useSettings.mockReturnValue({
      data: {
        enable_parent_report: '1',
      },
    });
    mocks.useStudentReport.mockReturnValue({
      data: {
        success: true,
        student: { id: 6, class_id: 1, name: '小明', total_points: 120 },
        summary: {
          weekly_earned: 20,
          weekly_spent: 5,
          total_earned: 140,
          total_spent: 20,
          average_exam_score: 92,
          assignment_completion_rate: 95,
          attendance_rate: 98,
          praise_count: 3,
        },
        records: [{ id: 1, type: 'ADD_POINTS', amount: 5, description: '课堂表现优秀', created_at: '2026-04-11T08:00:00.000Z' }],
        recent_exams: [{ title: '期中考试', exam_date: '2026-05-01', total_score: 100, score: 96, feedback: null }],
        assignments: [{ title: '阅读笔记', due_date: '2026-04-12', status: 'submitted', score: 10, teacher_feedback: null }],
        attendance: { total_records: 20, present_count: 19, late_count: 1, absent_count: 0 },
        praises: [{ title: '课堂之星', message: '表现认真', created_at: '2026-04-10T08:00:00.000Z' }],
        leaves: [{ start_date: '2026-04-01', end_date: '2026-04-02', reason: '发烧', status: 'approved', review_comment: '注意休息', created_at: '2026-03-31T08:00:00.000Z' }],
      },
      isLoading: false,
      error: null,
    });
  });

  it('renders the aggregated student report sections', () => {
    render(<ParentReport />);

    expect(screen.getByText('小明 的真实成长报告')).toBeInTheDocument();
    expect(screen.getByText('+20')).toBeInTheDocument();
    expect(screen.getByText('近期考试')).toBeInTheDocument();
    expect(screen.getByText('课堂之星')).toBeInTheDocument();
    expect(screen.getByText('发烧')).toBeInTheDocument();
  });

  it('shows disabled state when parent reports are closed', () => {
    mocks.useSettings.mockReturnValue({
      data: {
        enable_parent_report: '0',
      },
    });

    render(<ParentReport />);

    expect(screen.getByText('报告功能暂未开放')).toBeInTheDocument();
  });
});
