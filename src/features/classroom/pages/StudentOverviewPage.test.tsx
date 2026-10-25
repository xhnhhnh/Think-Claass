import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StudentOverviewPage from './StudentOverviewPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  getSummary: vi.fn(),
  getRecords: vi.fn(),
  useMyHomework: vi.fn(),
  listStudentExams: vi.fn(),
  useStudentPetData: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: any) => selector({ user: { id: 17, role: 'student', name: '张子涵', studentId: 1 } }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock('../api/studentsApi', () => ({
  studentsApi: { getSummary: mocks.getSummary, getRecords: mocks.getRecords },
}));

vi.mock('@/features/homework/hooks/useHomework', () => ({
  useMyHomework: mocks.useMyHomework,
}));

vi.mock('@/features/learning/api/examsApi', () => ({
  examsApi: { listStudentExams: mocks.listStudentExams },
}));

vi.mock('@/features/pet/hooks/usePet', () => ({
  useStudentPetData: mocks.useStudentPetData,
}));

describe('StudentOverviewPage', () => {
  beforeEach(() => {
    mocks.getSummary.mockResolvedValue({
      summary: {
        studentId: 1,
        growth: 12,
        collaboration: 3,
        competition: 0,
        participation: 4,
        availableCredits: 12,
        level: '幼苗',
        schoolStage: 'primary',
        parentBonusPercent: 0,
        parentBlessingActive: false,
      },
    });
    mocks.getRecords.mockResolvedValue({
      success: true,
      records: [
        { id: 1, student_id: 1, type: 'ADD_POINTS', amount: 4, description: '课堂参与', created_at: '2026-10-25 09:00:00', student_name: '张子涵' },
      ],
    });
    mocks.useMyHomework.mockReturnValue({
      data: [
        {
          homework: {
            id: 8,
            class_id: 12,
            teacher_id: 16,
            title: '第三课 · 分数的初步认识',
            description: null,
            due_at: '2026-10-26',
            status: 'published',
            total_points: 10,
            reward_points: 5,
          },
          submission: null,
          question_count: 3,
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.listStudentExams.mockResolvedValue({
      data: [
        { id: 1, exam_title: '第三单元测验', exam_date: '2026-10-27', score: 72, total_score: 100 },
      ],
    });
    mocks.useStudentPetData.mockReturnValue({
      data: {
        pet: { id: 1, student_id: 1, element_type: 'fire', level: 1, experience: 20, attack_power: 10 },
        availablePoints: 12,
        praises: [],
        records: [],
      },
      isLoading: false,
      isError: false,
    });
  });

  it('shows what is due, how the pupil is doing and the pet on the first screen', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <StudentOverviewPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/今天要做的事/)).toBeInTheDocument();
    expect(screen.getByText('第三课 · 分数的初步认识')).toBeInTheDocument();
    expect(await screen.findByText('第三单元测验')).toBeInTheDocument();
    expect(screen.getByText('火系精灵')).toBeInTheDocument();
    expect(screen.getByText('课堂参与')).toBeInTheDocument();
    expect(mocks.getSummary).toHaveBeenCalledWith(1);
  });
});
