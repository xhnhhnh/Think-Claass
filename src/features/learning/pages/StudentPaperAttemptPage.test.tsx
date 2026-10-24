import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  saveAnswers: vi.fn(),
  submit: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate, useParams: () => ({ id: '4' }) };
});

vi.mock('@/features/learning/api/paperSubmissionsApi', () => ({
  paperSubmissionsApi: {
    start: mocks.start,
    saveAnswers: mocks.saveAnswers,
    submit: mocks.submit,
  },
}));

vi.mock('@/app/commands/registry', () => ({ useRegisterPageCommands: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import StudentPaperAttemptPage from './StudentPaperAttemptPage';

function started(over: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      submission: {
        id: 9,
        paper_id: 4,
        student_id: 101,
        started_at: '2026-10-01T00:00:00.000Z',
        submitted_at: null,
        total_time_sec: 0,
        created_at: '2026-10-01T00:00:00.000Z',
      },
      items: [
        {
          id: 11,
          paper_id: 4,
          section_id: null,
          question_id: 100,
          order_no: 1,
          points_override: null,
          difficulty_override: null,
          rubric_json: null,
          created_at: null,
          questions: { id: 100, stem: '1/2 + 1/3 = ?' },
        },
      ],
      answers: [],
      ...over,
    },
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <StudentPaperAttemptPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * 试卷作答 - a reopened attempt is the same attempt.
 *
 * `start` used to INSERT a new blank submission and answer no saved answers, so a pupil who saved
 * their work and came back saw an empty sheet. These tests pin the restore path, the retry on a
 * failed start, and the confirmation before the irreversible 提交.
 */
describe('StudentPaperAttemptPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue(started());
    mocks.saveAnswers.mockResolvedValue({ success: true });
    mocks.submit.mockResolvedValue({
      success: true,
      data: { paper_id: 4, submission_id: 9, total_score: 5, correct_count: 1, wrong_count: 0 },
    });
  });

  it('restores the answers saved on the open submission', async () => {
    mocks.start.mockResolvedValue(
      started({ answers: [{ paper_item_id: 11, answer_json: '5/6' }] }),
    );

    renderPage();

    const textarea = await screen.findByPlaceholderText('请输入你的答案');
    await waitFor(() => expect(textarea).toHaveValue('5/6'));
    expect(mocks.start).toHaveBeenCalledWith(4);
  });

  it('keeps a failed start recoverable instead of showing a dead page', async () => {
    mocks.start.mockRejectedValueOnce(new Error('试卷未发布'));

    renderPage();

    expect(await screen.findByText('试卷未发布')).toBeInTheDocument();
    expect(screen.queryByText('无法开始该试卷')).not.toBeInTheDocument();

    mocks.start.mockResolvedValue(started());
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));

    expect(await screen.findByPlaceholderText('请输入你的答案')).toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });

  it('asks for confirmation before submitting and only then calls the API', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '提交' }));

    expect(await screen.findByText('确认提交试卷？')).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认提交' }));

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(9));
  });
});
