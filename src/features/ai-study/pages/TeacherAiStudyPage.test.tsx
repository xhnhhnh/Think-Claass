/**
 * 教师端 AI 智学看板.
 *
 * The board is a dispatch surface, so the tests are about what it refuses to do as much as what it
 * shows: a student who already has an open set cannot be selected, a dispatch with nothing selected
 * is not sendable, and the class-size cap is printed rather than hidden - a partial board that reads
 * as complete is the failure that would make a teacher trust a number that is not about their class.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useClasses: vi.fn(),
  useInsight: vi.fn(),
  assign: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('@/features/classroom/hooks/useClasses', () => ({ useClasses: mocks.useClasses }));

vi.mock('@/features/ai-study/hooks/useAiStudy', () => ({
  useAiStudyClassInsight: mocks.useInsight,
  useAssignAiStudySetsMutation: () => ({ mutateAsync: mocks.assign, isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, warning: mocks.toastWarning, error: vi.fn() },
}));

import TeacherAiStudyPage from '@/features/ai-study/pages/TeacherAiStudyPage';

function insight(overrides: Record<string, unknown> = {}) {
  return {
    class_id: 1,
    students_considered: 2,
    students_total: 2,
    weak_nodes: [
      { node_id: 1, name: '分数加减法', importance: 5, wrong_count: 7, student_count: 2 },
      { node_id: 2, name: '小数乘法', importance: 3, wrong_count: 2, student_count: 1 },
    ],
    suggestions: [
      {
        student_id: 10,
        name: '小明',
        top_node_id: 1,
        top_node_name: '分数加减法',
        wrong_count: 4,
        open_set_id: null,
        reason: '「分数加减法」错了 3 次，建议先练这一块。',
      },
      {
        student_id: 11,
        name: '小红',
        top_node_id: null,
        top_node_name: null,
        wrong_count: 0,
        open_set_id: 55,
        reason: '暂无错题记录，可以生成一份难度适中的练习。',
      },
    ],
    ai: { source: 'mock', available: false, confidence: null, message: '班级智学看板由本地规则汇总，不调用模型。' },
    ...overrides,
  };
}

describe('TeacherAiStudyPage', () => {
  beforeEach(() => {
    mocks.useClasses.mockReturnValue({ data: [{ id: 1, name: '一班' }] });
    mocks.useInsight.mockReturnValue({ data: insight(), isLoading: false, error: null });
    mocks.assign.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastWarning.mockReset();
  });

  it('lists the class weak points with their counts', () => {
    render(<TeacherAiStudyPage />);

    expect(screen.getByText('分数加减法')).toBeInTheDocument();
    expect(screen.getByText('错 7 次')).toBeInTheDocument();
    expect(screen.getByText('2 人涉及')).toBeInTheDocument();
  });

  it('says the board is arithmetic rather than a model reading the class', () => {
    render(<TeacherAiStudyPage />);

    expect(screen.getByText('本地规则汇总')).toBeInTheDocument();
    expect(screen.getByText('班级智学看板由本地规则汇总，不调用模型。')).toBeInTheDocument();
  });

  it('cannot dispatch to a student who already has an open set', () => {
    render(<TeacherAiStudyPage />);

    // 小红 has an open set, so the checkbox is refused to assistive technology and to the mouse -
    // asserted behaviourally, because base-ui renders a `role="checkbox"` span whose disabled state is
    // `aria-disabled` rather than the HTML attribute `toBeDisabled()` looks for.
    const blocked = screen.getByLabelText('选择 小红');
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('已有进行中练单')).toBeInTheDocument();

    fireEvent.click(blocked);
    expect(screen.getByRole('button', { name: /派发智学练单（0）/ })).toBeDisabled();

    // 小明 can be selected, so the refusal is about the open set and not about the control.
    const available = screen.getByLabelText('选择 小明');
    expect(available).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(available);
    expect(screen.getByRole('button', { name: /派发智学练单（1）/ })).not.toBeDisabled();
  });

  it('keeps the dispatch button disabled until somebody is selected', () => {
    render(<TeacherAiStudyPage />);

    const dispatch = screen.getByRole('button', { name: /派发智学练单（0）/ });
    expect(dispatch).toBeDisabled();

    fireEvent.click(screen.getByLabelText('选择 小明'));
    expect(screen.getByRole('button', { name: /派发智学练单（1）/ })).not.toBeDisabled();
  });

  it('reports a partial analysis instead of looking complete', () => {
    mocks.useInsight.mockReturnValue({
      data: insight({ students_considered: 40, students_total: 52 }),
      isLoading: false,
      error: null,
    });

    render(<TeacherAiStudyPage />);

    expect(screen.getByText('本班共 52 人，本次分析了前 40 人。')).toBeInTheDocument();
  });

  it('dispatches the selected students and reports per-student failures', async () => {
    mocks.assign.mockResolvedValue({
      success: true,
      data: {
        class_id: 1,
        created: [{ student_id: 10, set_id: 77 }],
        failed: [{ student_id: 12, reason: '该学生已有进行中的智学练单' }],
        ai: { source: 'mock', available: false, confidence: null, message: '已按本地规则生成练单。' },
      },
    });

    render(<TeacherAiStudyPage />);
    fireEvent.click(screen.getByLabelText('选择 小明'));
    fireEvent.click(screen.getByRole('button', { name: /派发智学练单（1）/ }));
    // The confirmation is the kit's dialog, and the confirm button is the only one with this label.
    fireEvent.click(screen.getByRole('button', { name: '确认派发' }));

    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith({
        classId: 1,
        studentIds: [10],
        size: 5,
        hint: null,
      }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已为 1 名学生生成智学练单');
    expect(mocks.toastWarning).toHaveBeenCalledWith('有 1 名学生未派发，原因见列表');
  });

  it('invites the teacher to create a class before anything else can happen', () => {
    mocks.useClasses.mockReturnValue({ data: [] });

    render(<TeacherAiStudyPage />);

    expect(screen.getByText('还没有班级')).toBeInTheDocument();
  });

  it('shows the retry state when the board read fails', () => {
    mocks.useInsight.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom') });

    render(<TeacherAiStudyPage />);

    expect(screen.getByText('班级智学看板加载失败，请稍后重试')).toBeInTheDocument();
  });
});
