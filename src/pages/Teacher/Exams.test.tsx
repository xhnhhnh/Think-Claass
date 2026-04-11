import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherExams from './Exams';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
  useExams: vi.fn(),
  useExamGrades: vi.fn(),
  createExam: vi.fn(),
  deleteExam: vi.fn(),
  saveExamGrades: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

vi.mock('@/hooks/queries/useExams', () => ({
  useExams: mocks.useExams,
  useExamGrades: mocks.useExamGrades,
}));

vi.mock('@/api/exams', () => ({
  examsApi: {
    createExam: mocks.createExam,
    deleteExam: mocks.deleteExam,
    saveExamGrades: mocks.saveExamGrades,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

describe('TeacherExams', () => {
  beforeEach(() => {
    mocks.useStore.mockImplementation((selector: any) =>
      selector({ user: { id: 7, class_id: 1 } }),
    );
    mocks.useExams.mockReturnValue({
      data: [
        {
          id: 10,
          class_id: 1,
          teacher_id: 7,
          title: '期中考试',
          description: '第一学期综合测验',
          exam_date: '2026-05-01',
          total_score: 100,
          created_at: '2026-04-11T00:00:00.000Z',
        },
      ],
      isLoading: false,
      error: null,
    });
    mocks.useExamGrades.mockReturnValue({
      data: {
        exam: {
          id: 10,
          class_id: 1,
          teacher_id: 7,
          title: '期中考试',
          description: '第一学期综合测验',
          exam_date: '2026-05-01',
          total_score: 100,
          created_at: '2026-04-11T00:00:00.000Z',
        },
        grades: [
          { id: 1, exam_id: 10, student_id: 101, student_name: '张三', score: 95, feedback: null },
          { id: 2, exam_id: 10, student_id: 102, student_name: '李四', score: null, feedback: null },
        ],
      },
      isLoading: false,
    });
    mocks.createExam.mockReset();
    mocks.deleteExam.mockReset();
    mocks.saveExamGrades.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  const renderPage = () => {
    const queryClient = new QueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <TeacherExams />
      </QueryClientProvider>,
    );
  };

  it('creates an exam with real backend fields', async () => {
    mocks.createExam.mockResolvedValue({ success: true, id: 11 });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '新建考试' }));
    fireEvent.change(screen.getByPlaceholderText('例如：期中考试'), {
      target: { value: '单元测验' },
    });
    fireEvent.change(screen.getByPlaceholderText('可填写考试范围、注意事项等'), {
      target: { value: '第 1 单元' },
    });
    fireEvent.change(screen.getByDisplayValue('100'), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认新建' }));

    await waitFor(() => {
      expect(mocks.createExam).toHaveBeenCalledWith(
        {
          class_id: 1,
          teacher_id: 7,
          title: '单元测验',
          description: '第 1 单元',
          exam_date: null,
          total_score: 120,
        },
        expect.anything(),
      );
    });
  });

  it('saves edited grades in a single batch', async () => {
    mocks.saveExamGrades.mockResolvedValue({ success: true });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '录入成绩' }));
    fireEvent.change(await screen.findByDisplayValue('95'), {
      target: { value: '96' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('未录入')[1], {
      target: { value: '88' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存成绩' }));

    await waitFor(() => {
      expect(mocks.saveExamGrades).toHaveBeenCalledWith(10, [
        { student_id: 101, score: 96 },
        { student_id: 102, score: 88 },
      ]);
    });
  });
});
