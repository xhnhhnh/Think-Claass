import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminQuestionBankPage from './AdminQuestionBankPage';

const mocks = vi.hoisted(() => ({
  getQuestionBank: vi.fn(),
  createQuestionBankItem: vi.fn(),
  updateQuestionBankItem: vi.fn(),
  deleteQuestionBankItem: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/features/admin/api/adminClient', () => ({
  adminClient: {
    getQuestionBank: mocks.getQuestionBank,
    createQuestionBankItem: mocks.createQuestionBankItem,
    updateQuestionBankItem: mocks.updateQuestionBankItem,
    deleteQuestionBankItem: mocks.deleteQuestionBankItem,
  },
}));

vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

/**
 * 题库管理 - the console half of the challenge feature.
 *
 * `plugins/challenge` reads every question out of `question_bank`, and the four routes that write it
 * had no caller on any console: the bank stayed empty, so 挑战模式 answered 「暂无题目数据」 on every
 * fresh install. These tests pin the two things the page has to get right - the stored JSON shapes
 * the challenge mappers parse, and telling "the bank is empty" apart from "the read failed".
 */
describe('AdminQuestionBankPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getQuestionBank.mockResolvedValue([]);
    mocks.createQuestionBankItem.mockResolvedValue({ success: true });
    mocks.updateQuestionBankItem.mockResolvedValue({ success: true });
    mocks.deleteQuestionBankItem.mockResolvedValue({ success: true });
  });

  const renderPage = () => render(<AdminQuestionBankPage />);

  it('shows the empty state when the bank really is empty', async () => {
    renderPage();
    expect(await screen.findByText('题库还是空的')).toBeInTheDocument();
  });

  it('stores a single-choice question in the shape the challenge mappers parse', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '新增题目' }));

    fireEvent.change(screen.getByLabelText('题干'), { target: { value: '下面哪一个是偶数？' } });
    fireEvent.change(screen.getByLabelText('选项'), { target: { value: '4\n7\n8\n9' } });
    fireEvent.change(screen.getByLabelText('参考答案'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '加入题库' }));

    await waitFor(() =>
      expect(mocks.createQuestionBankItem).toHaveBeenCalledWith({
        title: '下面哪一个是偶数？',
        type: 'SINGLE',
        options: JSON.stringify(['4', '7', '8', '9']),
        answer: '8',
        explanation: null,
      }),
    );
  });

  it('refuses a single-choice question whose answer is not one of the options', async () => {
    // The select cannot produce this state on its own, so it is driven the way a stale form would:
    // the options are edited after an answer was chosen.
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: '新增题目' }));
    fireEvent.change(screen.getByLabelText('题干'), { target: { value: 'q' } });
    fireEvent.change(screen.getByLabelText('选项'), { target: { value: '4\n7' } });
    fireEvent.change(screen.getByLabelText('参考答案'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('选项'), { target: { value: '4\n9' } });
    fireEvent.click(screen.getByRole('button', { name: '加入题库' }));

    expect(await screen.findByRole('button', { name: '加入题库' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加入题库' }));

    // `toast` is mocked, so the refusal is observed on the mock rather than in the DOM.
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/参考答案必须是给出的选项之一|请选择参考答案/)),
    );
    expect(mocks.createQuestionBankItem).not.toHaveBeenCalled();
  });

  it('tells a failed load apart from an empty bank', async () => {
    mocks.getQuestionBank.mockRejectedValueOnce(new Error('offline'));
    mocks.getQuestionBank.mockResolvedValueOnce([
      {
        id: 1,
        title: '水的沸点',
        type: 'SINGLE',
        options: '["90℃","100℃"]',
        answer: '100℃',
        explanation: null,
        teacher_id: null,
        created_at: null,
      },
    ]);

    renderPage();

    expect(await screen.findByText('题库加载失败')).toBeInTheDocument();
    // Not the empty state: an outage must not read as "nothing was ever created".
    expect(screen.queryByText('题库还是空的')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByText('水的沸点')).toBeInTheDocument();
  });

  it('renders the answer of an existing multiple-choice question', async () => {
    mocks.getQuestionBank.mockResolvedValue([
      {
        id: 2,
        title: '哪些是偶数？',
        type: 'MULTIPLE',
        options: '["2","3","4"]',
        answer: '["2","4"]',
        explanation: '偶数能被 2 整除。',
        teacher_id: null,
        created_at: null,
      },
    ]);

    renderPage();

    expect(await screen.findByText('哪些是偶数？')).toBeInTheDocument();
    expect(screen.getByText('2、4')).toBeInTheDocument();
    expect(screen.getByText('偶数能被 2 整除。')).toBeInTheDocument();
  });
});
