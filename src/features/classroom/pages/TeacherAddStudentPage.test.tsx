/**
 * 添加学生 - the class dependency.
 *
 * The page used to fetch the class list itself, log a failure to the console and render a required
 * select with no options; because the submit button lives outside the form it bypassed native
 * validation, sent `class_id: ''` and showed the 400 as 「网络错误」. These pin that the query's
 * loading/error/empty states are visible, retryable, disable the submit, and that a server refusal
 * keeps its own sentence instead of a fabricated network error.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AddStudent from '@/features/classroom/pages/TeacherAddStudentPage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useClasses: vi.fn(),
  createStudent: vi.fn(),
  batchImportStudents: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useLocation: () => ({ state: null, pathname: '/teacher/add-student' }),
  };
});

vi.mock('@/app/commands/registry', () => ({
  useRegisterPageCommands: vi.fn(),
}));

vi.mock('@/hooks/queries/useClasses', () => ({
  useClasses: mocks.useClasses,
}));

vi.mock('@/features/classroom/api/studentsApi', () => ({
  studentsApi: {
    createStudent: mocks.createStudent,
    batchImportStudents: mocks.batchImportStudents,
  },
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddStudent />
    </QueryClientProvider>,
  );

describe('AddStudent class list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useClasses.mockReturnValue({
      data: [{ id: 1, name: '一班' }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.createStudent.mockReset();
    mocks.batchImportStudents.mockReset();
  });

  it('disables adding while the class list is loading', () => {
    mocks.useClasses.mockReturnValue({ data: [], isLoading: true, isError: false, refetch: vi.fn() });

    renderPage();

    expect(screen.getByText('正在加载班级…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /确认添加/ })).toBeDisabled();
  });

  it('shows the class read failure with a retry and keeps the submit disabled', () => {
    const refetch = vi.fn();
    mocks.useClasses.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });

    renderPage();

    expect(screen.getByText('班级列表加载失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /确认添加/ })).toBeDisabled();
  });

  it('offers a way to create a class when the teacher has none', () => {
    mocks.useClasses.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    renderPage();

    expect(screen.getByText('你还没有班级')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '去创建班级' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/teacher', expect.anything());
    expect(screen.getByRole('button', { name: /确认添加/ })).toBeDisabled();
  });

  it('keeps the server refusal inline instead of a second 网络错误 toast, and keeps the typed student', async () => {
    // An Axios-shaped refusal: the api layer's toast already carries this message.
    mocks.createStudent.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 400'), {
        isAxiosError: true,
        response: { status: 400, data: { message: '该登录账号已存在' } },
      }),
    );

    renderPage();

    fireEvent.change(screen.getByPlaceholderText('例如: 张三'), { target: { value: '张三' } });
    fireEvent.change(screen.getByPlaceholderText('建议使用学号或拼音缩写'), { target: { value: 'zhangsan' } });
    fireEvent.click(screen.getByRole('button', { name: /确认添加/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('该登录账号已存在');
    expect(screen.queryByText('网络错误')).not.toBeInTheDocument();
    // The page must not invent a second toast; the api layer owns that one.
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('张三')).toBeInTheDocument();
    expect(screen.getByDisplayValue('zhangsan')).toBeInTheDocument();
  });

  it('reports the server message for a failed import and keeps the pasted roster', async () => {
    mocks.batchImportStudents.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 400'), {
        isAxiosError: true,
        response: { status: 400, data: { message: '名单中有重复账号' } },
      }),
    );

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '批量导入' }));
    fireEvent.change(screen.getByPlaceholderText(/张三 zhangsan/), {
      target: { value: '张三 zhangsan' },
    });
    fireEvent.click(screen.getByRole('button', { name: /确认导入/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('名单中有重复账号');
    expect(screen.getByDisplayValue('张三 zhangsan')).toBeInTheDocument();
  });
});
