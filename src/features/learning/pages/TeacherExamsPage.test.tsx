import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherExams from '@/features/learning/pages/TeacherExamsPage';

const mocks = vi.hoisted(() => ({
  useStore: vi.fn(),
  useExams: vi.fn(),
  useExamGrades: vi.fn(),
  useClasses: vi.fn(),
  createExam: vi.fn(),
  deleteExam: vi.fn(),
  saveExamGrades: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

vi.mock('@/hooks/queries/useClasses', () => ({
  useClasses: mocks.useClasses,
}));

vi.mock('@/features/learning/hooks/useExams', () => ({
  useExams: mocks.useExams,
  useExamGrades: mocks.useExamGrades,
}));

vi.mock('@/features/learning/api/examsApi', () => ({
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
    // The page picks its class from the teacher's own class list: a teacher's login carries no
    // `class_id`, which is what `user?.class_id ?? 1` used to paper over.
    mocks.useClasses.mockReturnValue({
      data: [{ id: 1, name: '一班' }],
      isLoading: false,
    });
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

  it('asks for confirmation before deleting an exam and its grades', async () => {
    mocks.deleteExam.mockResolvedValue({ success: true });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '删除期中考试' }));

    expect(screen.getByText('删除这场考试？')).toBeInTheDocument();
    expect(mocks.deleteExam).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => expect(mocks.deleteExam).toHaveBeenCalledWith(10, expect.anything()));
  });

  it('remembers which exams have recorded grades after their dialogs close', async () => {
    const secondExam = {
      id: 20,
      class_id: 1,
      teacher_id: 7,
      title: '期末考试',
      description: null,
      exam_date: null,
      total_score: 100,
      created_at: '2026-04-11T00:00:00.000Z',
    };
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
        secondExam,
      ],
      isLoading: false,
      error: null,
    });
    // Two exams, each with at least one recorded score; the page must not need the dialog open on
    // an exam to know it has grades (the old badge was derived from `currentExam` only).
    // The objects are created once: the page's seeding effect keys off `examGradesData`, and a mock
    // that returned a fresh object per render would loop forever.
    const gradeSheet = (examId: 10 | 20) => ({
      data: {
        exam:
          examId === 20
            ? secondExam
            : { id: 10, class_id: 1, teacher_id: 7, title: '期中考试', total_score: 100, description: null, exam_date: '2026-05-01', created_at: '2026-04-11T00:00:00.000Z' },
        grades: [
          {
            id: examId === 20 ? 3 : 1,
            exam_id: examId,
            student_id: 101,
            student_name: '张三',
            score: examId === 20 ? 80 : 95,
            feedback: null,
          },
        ],
      },
      isLoading: false,
    });
    const exam10Sheet = gradeSheet(10);
    const exam20Sheet = gradeSheet(20);
    mocks.useExamGrades.mockImplementation((examId: number | null) =>
      examId === 20 ? exam20Sheet : exam10Sheet,
    );

    renderPage();

    expect(await screen.findAllByText('待录入成绩')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: '录入成绩' })[0]);
    await screen.findByDisplayValue('95');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getAllByRole('button', { name: '录入成绩' })[1]);
    await screen.findByDisplayValue('80');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.getAllByText('已录入部分成绩')).toHaveLength(2);
  });

  it('offers a retry when the exam list failed', async () => {
    const refetch = vi.fn();
    mocks.useExams.mockReturnValue({ data: [], isLoading: false, error: new Error('boom'), refetch });

    renderPage();

    expect(screen.getByText('考试列表加载失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(refetch).toHaveBeenCalled();
  });
});
