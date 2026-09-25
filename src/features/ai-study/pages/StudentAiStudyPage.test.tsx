/**
 * 学生端 AI 智学页.
 *
 * Three things this page must get right, and each one is a place the feature could quietly lie:
 *
 *   - the empty state says *why* there is nothing (an empty question bank is the usual reason), not
 *     just "no data";
 *   - every question shows the reason it was chosen, because that is the feature's whole visible
 *     value over a plain exercise list;
 *   - when no model took part, the server's own line is printed verbatim - it names the console field
 *     an operator has to fill in, and paraphrasing it would make the one actionable sentence
 *     unactionable. The assertion mirrors `AiQuestionPanel.test.tsx`, which pins the same rule for
 *     the homework surface.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useMyAiStudySet: vi.fn(),
  generate: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/features/ai-study/hooks/useAiStudy', () => ({
  useMyAiStudySet: mocks.useMyAiStudySet,
  useGenerateAiStudySetMutation: () => ({ mutateAsync: mocks.generate, isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, warning: mocks.toastWarning, error: vi.fn() },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mocks.navigate };
});

import StudentAiStudyPage from '@/features/ai-study/pages/StudentAiStudyPage';

const MOCK_MESSAGE =
  '当前未接入外部模型：智选结果由本地规则打分产生。请在后台「系统设置 → AI 判分与问答」里配置接口地址、API 密钥与模型名称后，模型才会参与重排并给出理由。';

function setWithItems() {
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
          id: 1,
          question_id: 100,
          order_no: 1,
          reason: '这道题你错过 2 次，掌握度 30%，再练一遍最有效。',
          score: 58,
          factors: { masteryGap: 21, repeatMiss: 16, weakNode: 21, difficultyFit: 0, freshness: 0 },
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
      ],
    },
    ai: { source: 'mock', available: false, confidence: null, message: MOCK_MESSAGE },
  };
}

describe('StudentAiStudyPage', () => {
  beforeEach(() => {
    mocks.useMyAiStudySet.mockReturnValue({ data: undefined, isLoading: false, error: null });
    mocks.generate.mockReset();
    mocks.navigate.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it('shows the empty state and offers to generate', () => {
    mocks.useMyAiStudySet.mockReturnValue({
      data: { set: null, ai: { source: 'mock', available: false, confidence: null, message: '还没有进行中的智学练单。' } },
      isLoading: false,
      error: null,
    });

    render(<StudentAiStudyPage />);

    expect(screen.getByText('还没有进行中的智学练单')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /生成今日智学/ })).toBeInTheDocument();
  });

  it('renders each question with the reason it was chosen', () => {
    mocks.useMyAiStudySet.mockReturnValue({ data: setWithItems(), isLoading: false, error: null });

    render(<StudentAiStudyPage />);

    expect(screen.getByText('1/2 + 1/3 = ?')).toBeInTheDocument();
    expect(screen.getByText(/这道题你错过 2 次，掌握度 30%/)).toBeInTheDocument();
    expect(screen.getByText('为什么选它：')).toBeInTheDocument();
  });

  it('prints the server\'s own line when no model took part', () => {
    mocks.useMyAiStudySet.mockReturnValue({ data: setWithItems(), isLoading: false, error: null });

    render(<StudentAiStudyPage />);

    expect(screen.getByText('本次由本地规则智选')).toBeInTheDocument();
    expect(screen.getByText(MOCK_MESSAGE)).toBeInTheDocument();
  });

  it('labels a model-ranked item differently from a rule-ranked one', () => {
    const payload = setWithItems();
    payload.set.items[0].ai_ranked = true;
    mocks.useMyAiStudySet.mockReturnValue({ data: payload, isLoading: false, error: null });

    render(<StudentAiStudyPage />);

    expect(screen.getByText('模型重排')).toBeInTheDocument();
  });

  it('generates on click and does not imply a model ran when the answer says none did', async () => {
    mocks.useMyAiStudySet.mockReturnValue({
      data: { set: null, ai: { source: 'mock', available: false, confidence: null, message: '还没有进行中的智学练单。' } },
      isLoading: false,
      error: null,
    });
    mocks.generate.mockResolvedValue({ success: true, data: setWithItems() });

    render(<StudentAiStudyPage />);
    fireEvent.click(screen.getByRole('button', { name: /生成今日智学/ }));

    await waitFor(() => expect(mocks.generate).toHaveBeenCalled());
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已生成今日智学');
  });

  it('reports an empty question bank as a reason, not as a failure', async () => {
    const message = '题库里还没有可用于智学的题目。请先在「试卷系统」或「作业管理」里录入题目，或让老师导入试卷后再试。';
    mocks.useMyAiStudySet.mockReturnValue({
      data: { set: null, ai: { source: 'mock', available: false, confidence: null, message } },
      isLoading: false,
      error: null,
    });

    render(<StudentAiStudyPage />);

    expect(screen.getByText(message)).toBeInTheDocument();
    // No success toast: nothing was generated, and saying otherwise would send the student looking
    // for a set that does not exist.
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('shows a retry affordance when the read fails', () => {
    mocks.useMyAiStudySet.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom') });

    render(<StudentAiStudyPage />);

    expect(screen.getByText('智学练单加载失败，请稍后重试')).toBeInTheDocument();
  });
});
