import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherAnalysis from './Analysis';

const mocks = vi.hoisted(() => ({
  useSettings: vi.fn(),
  useClasses: vi.fn(),
  useClassOverview: vi.fn(),
}));

vi.mock('@/hooks/queries/useSettings', () => ({
  useSettings: mocks.useSettings,
}));

vi.mock('@/hooks/queries/useClasses', () => ({
  useClasses: mocks.useClasses,
}));

vi.mock('@/hooks/queries/useAnalytics', () => ({
  useClassOverview: mocks.useClassOverview,
}));

describe('TeacherAnalysis', () => {
  beforeEach(() => {
    mocks.useSettings.mockReturnValue({
      data: {
        enable_teacher_analytics: '1',
      },
    });
    mocks.useClasses.mockReturnValue({
      data: [
        { id: 1, name: '一班' },
        { id: 2, name: '二班' },
      ],
      isLoading: false,
    });
    mocks.useClassOverview.mockImplementation((classId: number | null) => ({
      data: classId
        ? {
            success: true,
            class: { id: classId, name: classId === 1 ? '一班' : '二班', teacher_id: 7 },
            summary: {
              total_students: classId === 1 ? 32 : 28,
              average_points: 86,
              max_points: 120,
              min_points: 36,
              average_exam_score: 91,
              assignment_completion_rate: 88,
              attendance_rate: 96,
              praise_count: 12,
              leave_count: 2,
            },
            distributions: [
              { label: '80-99', value: 12 },
              { label: '60-79', value: 8 },
            ],
            exam_trend: [{ id: 1, title: '期中考试', exam_date: '2026-05-01', average_score: 91 }],
            assignment_trend: [{ id: 1, title: '阅读作业', due_date: '2026-05-02', total_students: 32, submitted_students: 28, completion_rate: 88 }],
            top_students: [{ id: 1, name: '张三', total_points: 120 }],
          }
        : null,
      isLoading: false,
      error: null,
    }));
  });

  it('renders aggregated analytics cards from the backend overview', () => {
    render(<TeacherAnalysis />);

    expect(screen.getByText('班级总人数')).toBeInTheDocument();
    expect(screen.getByText('32 人')).toBeInTheDocument();
    expect(screen.getAllByText('91 分').length).toBeGreaterThan(0);
    expect(screen.getByText('积分榜前五')).toBeInTheDocument();
    expect(screen.getByText('张三')).toBeInTheDocument();
  });

  it('switches class and requests the matching overview', () => {
    render(<TeacherAnalysis />);

    fireEvent.click(screen.getByRole('button', { name: '二班' }));

    expect(mocks.useClassOverview).toHaveBeenLastCalledWith(2);
  });
});
