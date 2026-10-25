/**
 * 考勤与请假 - the leave half.
 *
 * `GET /api/leaves` answers for the teacher, not for one class, so the page has to filter by the
 * selected class's roster. Without that, a multi-class teacher saw other-class pupils under the
 * selected class's tab and, worse, judged their leave from the wrong class context. The old row
 * printed 「学生 #id」 because the name map only held the selected class.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherAttendance from '@/pages/Teacher/Attendance';

const mocks = vi.hoisted(() => ({
  useClasses: vi.fn(),
  useStudents: vi.fn(),
  useAttendance: vi.fn(),
  useLeaves: vi.fn(),
  useSaveAttendanceMutation: vi.fn(),
  useUpdateLeaveMutation: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('@/app/commands/registry', () => ({
  useRegisterPageCommands: vi.fn(),
}));

vi.mock('@/hooks/queries/useClasses', () => ({
  useClasses: mocks.useClasses,
}));

vi.mock('@/hooks/queries/useStudents', () => ({
  useStudents: mocks.useStudents,
}));

vi.mock('@/features/classroom/hooks/useAttendance', () => ({
  useAttendance: mocks.useAttendance,
  useSaveAttendanceMutation: mocks.useSaveAttendanceMutation,
}));

vi.mock('@/features/classroom/hooks/useLeaves', () => ({
  useLeaves: mocks.useLeaves,
  useUpdateLeaveMutation: mocks.useUpdateLeaveMutation,
}));

const leave = (id: number, studentId: number, reason: string) => ({
  id,
  student_id: studentId,
  start_date: '2026-05-01',
  end_date: '2026-05-02',
  reason,
  status: 'pending',
  review_comment: null,
});

describe('TeacherAttendance leave approvals', () => {
  beforeEach(() => {
    mocks.useClasses.mockReturnValue({
      data: [
        { id: 1, name: '一班' },
        { id: 2, name: '二班' },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useStudents.mockImplementation((classId: number | null) => ({
      data:
        classId === 2
          ? [{ id: 2, name: '李四' }]
          : [{ id: 1, name: '张三' }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    mocks.useAttendance.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useLeaves.mockReturnValue({
      data: [leave(11, 1, '发烧'), leave(12, 2, '家事')],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useSaveAttendanceMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.useUpdateLeaveMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it('shows only the selected class\u2019s leave requests, by name', () => {
    render(<TeacherAttendance />);

    fireEvent.click(screen.getByRole('button', { name: '请假审批' }));

    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('发烧')).toBeInTheDocument();
    // The other class's pupil is neither shown nor anonymised as 「学生 #2」.
    expect(screen.queryByText('李四')).not.toBeInTheDocument();
    expect(screen.queryByText('家事')).not.toBeInTheDocument();
    expect(screen.queryByText(/学生 #/)).not.toBeInTheDocument();
  });

  it('refilters the list when another class is selected', () => {
    render(<TeacherAttendance />);

    fireEvent.click(screen.getByRole('button', { name: '请假审批' }));
    fireEvent.change(screen.getByLabelText('班级'), { target: { value: '2' } });

    expect(screen.getByText('李四')).toBeInTheDocument();
    expect(screen.getByText('家事')).toBeInTheDocument();
    expect(screen.queryByText('张三')).not.toBeInTheDocument();
    expect(screen.queryByText('发烧')).not.toBeInTheDocument();
    expect(screen.queryByText(/学生 #/)).not.toBeInTheDocument();
  });
});
