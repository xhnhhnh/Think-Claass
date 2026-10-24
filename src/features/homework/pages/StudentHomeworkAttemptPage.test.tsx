import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  save: vi.fn(),
  submit: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate, useParams: () => ({ id: '4' }) };
});

vi.mock('../hooks/useHomework', () => ({
  useStartAttemptMutation: () => ({ mutateAsync: mocks.start, isPending: false }),
  useSaveAnswersMutation: () => ({ mutateAsync: mocks.save, isPending: false }),
  useSubmitAttemptMutation: () => ({ mutateAsync: mocks.submit, isPending: false }),
}));

vi.mock('@/app/commands/registry', () => ({ useRegisterPageCommands: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, warning: vi.fn(), info: vi.fn() },
}));

// The child editors fetch/upload on their own; this suite is about the save-state contract.
vi.mock('../components/PhotoUploader', () => ({ PhotoUploader: () => null }));
vi.mock('../components/AiQaPanel', () => ({ AiQaPanel: () => null }));
vi.mock('../components/QuestionRenderer', () => ({ QuestionRenderer: () => null }));

import StudentHomeworkAttemptPage from './StudentHomeworkAttemptPage';

function attempt() {
  return {
    data: {
      homework: { id: 4, title: '周作业', description: null, questions: [], total_points: 10 },
      submission: {
        id: 9,
        homework_id: 4,
        student_id: 101,
        status: 'draft',
        submitted_at: null,
        score: null,
        total_points: 10,
        teacher_feedback: null,
      },
      answers: [],
      photos: [],
    },
  };
}

/**
 * 作业作答 - the manual 保存 button must not announce a save that failed.
 *
 * `persist` swallowed the failure, so the footer said 「自动保存失败」 while a green 「已保存」
 * toast appeared over it. The button now only reports success when the write actually succeeded.
 */
describe('StudentHomeworkAttemptPage 保存', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue(attempt());
    mocks.save.mockResolvedValue({ success: true });
  });

  const renderPage = () =>
    render(<StudentHomeworkAttemptPage />);

  it('reports 已保存 after a successful save', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '保存' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已保存');
  });

  it('stays silent about success when the save failed, and keeps the failure visible', async () => {
    mocks.save.mockRejectedValueOnce(new Error('offline'));

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '保存' }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith('已保存');
    expect(await screen.findByText('自动保存失败，请点「保存」重试')).toBeInTheDocument();
  });
});
