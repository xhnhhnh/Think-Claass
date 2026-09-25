import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiQuestionPanel } from './AiQuestionPanel';

const mocks = vi.hoisted(() => ({
  useGenerateQuestionsMutation: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../hooks/useHomework', () => ({
  useGenerateQuestionsMutation: mocks.useGenerateQuestionsMutation,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
    error: mocks.toastError,
  },
}));

/** A candidate the panel would render, in the shape the route answers with. */
function generatedResponse(questions: Array<Record<string, unknown>>, skipped = 0) {
  return {
    data: {
      questions,
      skipped,
      ai: { source: 'http', available: true, confidence: null, message: `已生成 ${questions.length} 道题` },
    },
  };
}

describe('AiQuestionPanel', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    mutateAsync.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastWarning.mockReset();
    mocks.toastError.mockReset();
    mocks.useGenerateQuestionsMutation.mockReturnValue({ mutateAsync, isPending: false });
  });

  it('will not call the route without a topic, and says so', async () => {
    render(<AiQuestionPanel questions={[]} onInsert={vi.fn()} />);

    // The button is disabled until there is a topic, because the topic *is* the prompt.
    const button = screen.getByRole('button', { name: '生成候选题' });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText('出题主题'), { target: { value: '分数的加减法' } });
    expect(button).toBeEnabled();
  });

  it('offers only the three templated types', async () => {
    render(<AiQuestionPanel questions={[]} onInsert={vi.fn()} />);

    const options = Array.from(screen.getByLabelText('题型').querySelectorAll('option')).map((option) => option.textContent);

    // 简答 has no template (its answer is prose and its marking is a rubric), so offering it would
    // offer a button the route refuses. The list mirrors the server's `GENERATABLE_TYPES`, and
    // `tests/guardrails/homework-generate-types.test.ts` fails if the two drift.
    expect(options).toEqual(['混合题型', '单选', '多选', '填空']);
  });

  it('sends the topic, the type, the count and the stems already in the paper', async () => {
    mutateAsync.mockResolvedValue(generatedResponse([]));
    render(
      <AiQuestionPanel
        questions={[{ type: 'blank', stem: '1+1=?', options: [], reference: { accept: ['2'] }, points: 2 }]}
        contextTitle="第三章练习"
        onInsert={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('出题主题'), { target: { value: '分数的加减法' } });
    fireEvent.change(screen.getByLabelText('题型'), { target: { value: 'single' } });
    fireEvent.change(screen.getByLabelText('数量'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: '生成候选题' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        topic: '分数的加减法',
        type: 'single',
        count: 4,
        grade: null,
        hint: null,
        context_title: '第三章练习',
        // Stems only: the paper's reference answers are not sent anywhere by this panel.
        avoid: ['1+1=?'],
      });
    });
  });

  it('hands accepted candidates to the paper, one at a time or all at once', async () => {
    const onInsert = vi.fn();
    const candidates = [
      { type: 'blank', stem: '1+1=?', options: [], reference: { accept: ['2'] }, points: 2 },
      { type: 'single', stem: '下列哪个是质数？', options: [{ id: 'a', text: '4' }, { id: 'b', text: '7' }], reference: { choice: ['b'] }, points: 5 },
    ];
    mutateAsync.mockResolvedValue(generatedResponse(candidates, 1));
    render(<AiQuestionPanel questions={[]} onInsert={onInsert} />);

    fireEvent.change(screen.getByLabelText('出题主题'), { target: { value: '分数的加减法' } });
    fireEvent.click(screen.getByRole('button', { name: '生成候选题' }));

    expect(await screen.findByText('候选 1')).toBeInTheDocument();
    expect(screen.getByText('候选 2')).toBeInTheDocument();
    // The dropped candidates are reported rather than quietly returning fewer than were asked for.
    expect(screen.getByText(/另有 1 道不合格/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '插入' })[0]);
    expect(onInsert).toHaveBeenCalledWith([candidates[0]]);
    // Shown as inserted, and no longer offered for a second insert.
    expect(await screen.findByText('已插入')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /全部插入/ }));
    expect(onInsert).toHaveBeenLastCalledWith([candidates[1]]);
  });

  it('renders the refusal the route answered with, instead of pretending it generated something', async () => {
    mutateAsync.mockResolvedValue({
      data: {
        questions: [],
        skipped: 0,
        ai: {
          source: 'mock',
          available: false,
          confidence: 0,
          message: '当前未接入外部模型：……请在后台「系统设置 → AI 判分与问答」里配置接口地址、API 密钥与模型名称。',
        },
      },
    });
    const onInsert = vi.fn();
    render(<AiQuestionPanel questions={[]} onInsert={onInsert} />);

    fireEvent.change(screen.getByLabelText('出题主题'), { target: { value: '分数的加减法' } });
    fireEvent.click(screen.getByRole('button', { name: '生成候选题' }));

    expect(await screen.findByText('AI 未参与出题')).toBeInTheDocument();
    // The message names the console screen, which is the only actionable half of the refusal.
    expect(screen.getByText(/AI 判分与问答/)).toBeInTheDocument();
    expect(onInsert).not.toHaveBeenCalled();
    expect(mocks.toastWarning).toHaveBeenCalled();
  });
});
