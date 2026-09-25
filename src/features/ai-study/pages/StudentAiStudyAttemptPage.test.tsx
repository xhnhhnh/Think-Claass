/**
 * 智学作答页.
 *
 * The page is a single-open-set resource, so the id in the path is checked against
 * `/my/sets/current` rather than fetched. These tests pin the three outcomes that matter:
 *
 *   - answering a choice question serialises the pick as JSON (`"a"`), which is the spelling the
 *     question owner's comparison parses - a free-text rendering would mark correct picks wrong;
 *   - submitting reports the owner's verdicts, including `null` for a question nobody could judge,
 *     and says the mastery was written back rather than showing a score for it;
 *   - a path that no longer names the open set says so instead of rendering someone else's questions.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useMyAiStudySet: vi.fn(),
  saveAnswers: vi.fn(),
  submitSet: vi.fn(),
  toastSuccess: vi.fn(),
  navigate: vi.fn(),
  params: { id: '4' } as Record<string, string | undefined>,
}));

vi.mock('@/features/ai-study/hooks/useAiStudy', () => ({
  useMyAiStudySet: mocks.useMyAiStudySet,
  useSaveAiStudyAnswersMutation: () => ({ mutateAsync: mocks.saveAnswers, isPending: false }),
  useSubmitAiStudySetMutation: () => ({ mutateAsync: mocks.submitSet, isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, warning: vi.fn(), error: vi.fn() },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate, useParams: () => mocks.params };
});

import StudentAiStudyAttemptPage from '@/features/ai-study/pages/StudentAiStudyAttemptPage';

function payload() {
  return {
    set: {
      id: 4,
      student_id: 10,
      class_id: 1,
      subject_id: null,
      source: 'self',
      status: 'open',
      engine_version: 1,
      created_at: '2026-09-25T00:00:00.000Z',
      updated_at: '2026-09-25T00:00:00.000Z',
      items: [
        {
          id: 11,
          question_id: 100,
          order_no: 1,
          reason: '这道题你错过 2 次，掌握度 30%，再练一遍最有效。',
          score: 58,
          factors: {},
          ai_ranked: false,
          question: {
            id: 100,
            type: 'single',
            stem: '1/2 + 1/3 = ?',
            options: [
              { id: 'a', text: '5/6' },
              { id: 'b', text: '2/5' },
            ],
            points: 5,
            difficulty: 3,
          },
          answer: null,
        },
        {
          id: 12,
          question_id: 101,
          order_no: 2,
          reason: '知识点「小数乘法」是你的薄弱项。',
          score: 20,
          factors: {},
          ai_ranked: false,
          question: {
            id: 101,
            type: 'blank',
            stem: '0.5 + 0.25 = ?',
            options: [],
            points: 3,
            difficulty: 2,
          },
          answer: null,
        },
      ],
    },
    ai: { source: 'mock', available: false, confidence: null, message: '本地规则智选。' },
  };
}

describe('StudentAiStudyAttemptPage', () => {
  beforeEach(() => {
    mocks.useMyAiStudySet.mockReturnValue({ data: payload(), isLoading: false, error: null });
    mocks.saveAnswers.mockReset();
    mocks.submitSet.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.params = { id: '4' };
  });

  it('renders the questions, their reasons and the progress count', () => {
    render(<StudentAiStudyAttemptPage />);

    expect(screen.getByText('1/2 + 1/3 = ?')).toBeInTheDocument();
    expect(screen.getByText('0.5 + 0.25 = ?')).toBeInTheDocument();
    expect(screen.getByText(/共 2 题，已作答 0 题/)).toBeInTheDocument();
  });

  it('saves a choice answer as the JSON spelling the owner compares against', async () => {
    mocks.saveAnswers.mockResolvedValue({ success: true, data: payload() });

    render(<StudentAiStudyAttemptPage />);
    fireEvent.click(screen.getByRole('button', { name: /a\. 5\/6/ }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(mocks.saveAnswers).toHaveBeenCalledWith({
        setId: 4,
        answers: [{ item_id: 11, value: '"a"' }],
      }),
    );
  });

  it('keeps a multi-select answer as a sorted JSON array', async () => {
    mocks.saveAnswers.mockResolvedValue({ success: true, data: payload() });
    const withMultiple = payload();
    withMultiple.set.items[0].question.type = 'multiple';
    mocks.useMyAiStudySet.mockReturnValue({ data: withMultiple, isLoading: false, error: null });

    render(<StudentAiStudyAttemptPage />);
    fireEvent.click(screen.getByRole('button', { name: /b\. 2\/5/ }));
    fireEvent.click(screen.getByRole('button', { name: /a\. 5\/6/ }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(mocks.saveAnswers).toHaveBeenCalledWith({
        setId: 4,
        answers: [{ item_id: 11, value: '["a","b"]' }],
      }),
    );
  });

  it('reports the owner\'s verdicts and never a score for an unjudged question', async () => {
    mocks.submitSet.mockResolvedValue({
      success: true,
      data: {
        set_id: 4,
        total: 2,
        correct: 1,
        pending: 1,
        items: [
          { item_id: 11, question_id: 100, is_correct: true, mastery_score: null },
          { item_id: 12, question_id: 101, is_correct: null, mastery_score: null },
        ],
        ai: { source: 'mock', available: false, confidence: null, message: '本地规则智选。' },
      },
    });

    render(<StudentAiStudyAttemptPage />);
    fireEvent.click(screen.getByRole('button', { name: '交卷' }));

    await waitFor(() => expect(screen.getByText('答对 1 题')).toBeInTheDocument());
    expect(screen.getByText('待人工判断 1 题')).toBeInTheDocument();
    expect(screen.getByText('答对了')).toBeInTheDocument();
    expect(screen.getByText('待人工判断，未改动掌握度')).toBeInTheDocument();
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已提交，掌握度已更新');
  });

  it('says the set has ended when the path no longer names the open one', () => {
    mocks.params = { id: '99' };

    render(<StudentAiStudyAttemptPage />);

    expect(screen.getByText('该练单已结束或已被新的练单替代')).toBeInTheDocument();
  });

  it('refuses an invalid id without calling the API', () => {
    mocks.params = { id: 'abc' };

    render(<StudentAiStudyAttemptPage />);

    expect(screen.getByText('无效练单')).toBeInTheDocument();
  });
});
