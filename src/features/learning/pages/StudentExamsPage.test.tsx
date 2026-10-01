import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StudentExamsPage from './StudentExamsPage';

const mocks = vi.hoisted(() => ({
  listStudentExams: vi.fn(),
  studentId: { current: 7 as number | null },
}));

vi.mock('@/features/learning/api/examsApi', () => ({
  examsApi: { listStudentExams: mocks.listStudentExams },
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) => selector({ user: { id: 3, role: 'student', studentId: mocks.studentId.current } }),
}));

/**
 * 考试成绩 - the pupil's half of the teacher's grade sheet.
 *
 * `GET /api/exams/student-exams` had no caller in any console: a teacher typed the marks into
 * 成绩录入, they were stored in `student_exams`, and the pupil they belonged to could not read them.
 */
describe('StudentExamsPage', () => {
  const rows = [
    { id: 1, exam_id: 10, student_id: 7, score: 92, feedback: '进步很大', exam_title: '期中数学', exam_date: '2026-04-01 00:00:00', total_score: 100 },
    { id: 2, exam_id: 11, student_id: 7, score: null, feedback: null, exam_title: '单元测验', exam_date: '2026-05-06 00:00:00', total_score: 120 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.studentId.current = 7;
  });

  const renderPage = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StudentExamsPage />
      </QueryClientProvider>,
    );

  it('shows the score against the paper total, and 待录入 when the teacher has not marked it yet', async () => {
    mocks.listStudentExams.mockResolvedValue({ success: true, data: rows });

    renderPage();

    expect(await screen.findByText('期中数学')).toBeInTheDocument();
    // Scoped to the row: the average tile shows 92 too (one scored paper), so a bare text query
    // would pass on the wrong element.
    const [firstRow] = screen.getAllByRole('listitem');
    expect(within(firstRow).getByText('92')).toBeInTheDocument();
    // A bare "92" means nothing without the 100 it is out of.
    expect(within(firstRow).getByText(/\/ 100/)).toBeInTheDocument();
    expect(within(firstRow).getByText('老师评语：进步很大')).toBeInTheDocument();
    // The unmarked paper is not a zero.
    expect(screen.getByText('待录入')).toBeInTheDocument();
    expect(screen.getByText('单元测验')).toBeInTheDocument();
  });

  it('separates a failed read from having no exams', async () => {
    mocks.listStudentExams.mockRejectedValueOnce(new Error('offline'));

    renderPage();

    expect(await screen.findByText('考试成绩没有加载出来')).toBeInTheDocument();
    expect(screen.queryByText('还没有考试成绩')).not.toBeInTheDocument();
  });

  it('filters down to the exams that have been marked', async () => {
    mocks.listStudentExams.mockResolvedValue({ success: true, data: rows });

    renderPage();
    await screen.findByText('期中数学');

    fireEvent.click(screen.getByRole('button', { name: '只看已出分' }));

    expect(screen.getByText('期中数学')).toBeInTheDocument();
    expect(screen.queryByText('单元测验')).not.toBeInTheDocument();
  });

  it('asks for the pupil’s own results, and does not ask at all without a bound student', async () => {
    mocks.listStudentExams.mockResolvedValue({ success: true, data: [] });

    renderPage();
    await waitFor(() => expect(mocks.listStudentExams).toHaveBeenCalled());
    // No argument: the server scopes a student to their own rows (`listStudentExams` in
    // `assignments.service.ts` refuses a `student_id` that is not theirs).
    expect(mocks.listStudentExams).toHaveBeenCalledWith();

    mocks.studentId.current = null;
    renderPage();
    expect(await screen.findByText('等待绑定学生')).toBeInTheDocument();
  });
});
