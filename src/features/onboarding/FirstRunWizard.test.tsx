/**
 * The first-run wizard.
 *
 * The instance ships with no seed data at all, so the first teacher to log in sees an empty class
 * list - and the 19 class feature switches are attached to a class that does not exist yet. This
 * suite pins the three properties that make the wizard useful rather than decorative:
 *
 *   1. it appears exactly when the account has no classes (and not while that is still unknown);
 *   2. each step calls the real endpoint, and the next step is only reached on success - a failed
 *      create must not advance, or the teacher fills in a roster for a class that was never made;
 *   3. dismissing it is remembered for this browser, so it cannot become a modal that reappears
 *      every visit.
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FirstRunWizard } from './FirstRunWizard';
import { useFirstRun } from './useFirstRun';

const mocks = vi.hoisted(() => ({
  useClasses: vi.fn(),
  createClass: vi.fn(),
  batchImportStudents: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('@/hooks/queries/useClasses', () => ({ useClasses: mocks.useClasses }));

vi.mock('@/features/classroom/api/classesApi', () => ({
  classroomApi: { createClass: mocks.createClass, updateFeatures: vi.fn() },
}));

vi.mock('@/features/classroom/api/studentsApi', () => ({
  studentsApi: { batchImportStudents: mocks.batchImportStudents },
}));

vi.mock('@/hooks/queries/useClassFeatures', () => ({
  useClassFeatures: () => ({ data: undefined, isLoading: true, refetch: vi.fn() }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The real panel is exercised by its own suite and by the feature-route tests; here it only has to
// prove the wizard reaches step 3 with the class it just created.
vi.mock('@/pages/Teacher/components/ClassFeaturePanel', () => ({
  default: ({ classId }: { classId: number | null }) => <div>{`feature-panel-${classId}`}</div>,
}));

function wrapper(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('FirstRunWizard', () => {
  const onFinish = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useClasses.mockReturnValue({ data: [], isLoading: false });
    mocks.createClass.mockResolvedValue({ success: true, class: { id: 42, name: '三年二班' } });
    mocks.batchImportStudents.mockResolvedValue({ success: true, importedCount: 2, students: [] });
  });

  it('starts on the class step and refuses an empty name', () => {
    wrapper(<FirstRunWizard onFinish={onFinish} />);

    expect(screen.getByText('欢迎使用 Think-Class')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /创建班级/ })).toBeDisabled();
  });

  it('creates the class, then imports the parsed roster into it', async () => {
    wrapper(<FirstRunWizard onFinish={onFinish} />);

    fireEvent.change(screen.getByPlaceholderText('三年二班'), { target: { value: '三年二班' } });
    fireEvent.click(screen.getByRole('button', { name: /创建班级/ }));

    expect(await screen.findByText('学生名单')).toBeInTheDocument();
    expect(mocks.createClass).toHaveBeenCalledWith('三年二班');

    // Two lines with a username, one name-only line: the generated username must be present.
    fireEvent.change(screen.getByPlaceholderText(/张三 2023001/), {
      target: { value: '张三 2023001\n李四 2023002\n王五' },
    });
    fireEvent.click(screen.getByRole('button', { name: /导入名单/ }));

    await waitFor(() => {
      expect(mocks.batchImportStudents).toHaveBeenCalledWith({
        class_id: 42,
        students: [
          { name: '张三', username: '2023001' },
          { name: '李四', username: '2023002' },
          { name: '王五', username: 'tc003' },
        ],
      });
    });

    // The class created in step 1 is the one whose features step 3 configures.
    expect(await screen.findByText('feature-panel-42')).toBeInTheDocument();
  });

  it('does not advance when creating the class fails', async () => {
    mocks.createClass.mockRejectedValue(new Error('boom'));
    wrapper(<FirstRunWizard onFinish={onFinish} />);

    fireEvent.change(screen.getByPlaceholderText('三年二班'), { target: { value: '三年二班' } });
    fireEvent.click(screen.getByRole('button', { name: /创建班级/ }));

    // Staying on step 1 is the point: advancing would collect a roster for a class that was never
    // created, and the import would fail with a confusing "班级缺失" much later.
    await waitFor(() => expect(mocks.createClass).toHaveBeenCalled());
    expect(screen.queryByText(/学生名单/)).not.toBeInTheDocument();
  });

  it('can be skipped without creating anything', () => {
    wrapper(<FirstRunWizard onFinish={onFinish} />);

    fireEvent.click(screen.getByRole('button', { name: '先跳过' }));

    expect(onFinish).toHaveBeenCalled();
    expect(mocks.createClass).not.toHaveBeenCalled();
  });
});

describe('useFirstRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  const hook = () => renderHook(() => useFirstRun());

  it('offers the wizard only once classes are loaded and there are none', () => {
    mocks.useClasses.mockReturnValue({ data: undefined, isLoading: true });
    expect(hook().result.current.shouldShow).toBe(false);

    mocks.useClasses.mockReturnValue({ data: [], isLoading: false });
    expect(hook().result.current.shouldShow).toBe(true);

    mocks.useClasses.mockReturnValue({ data: [{ id: 1, name: '一班' }], isLoading: false });
    expect(hook().result.current.shouldShow).toBe(false);
  });

  it('stops offering it after a dismissal, and remembers that for the browser', () => {
    mocks.useClasses.mockReturnValue({ data: [], isLoading: false });
    window.localStorage.setItem('thinkclass-first-run-dismissed', '1');

    expect(hook().result.current.shouldShow).toBe(false);
  });

  it('records the dismissal so the next visit does not offer it again', () => {
    mocks.useClasses.mockReturnValue({ data: [], isLoading: false });
    const first = hook();
    expect(first.result.current.shouldShow).toBe(true);

    first.result.current.dismiss();

    expect(window.localStorage.getItem('thinkclass-first-run-dismissed')).toBe('1');
    expect(hook().result.current.shouldShow).toBe(false);
  });
});
