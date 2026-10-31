import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { usePageMeta } from './usePageMeta';

function wrapperFor(pathname: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>;
  };
}

describe('usePageMeta titles for non-destination routes', () => {
  it('names an alias route instead of falling back to the console name', () => {
    const { result } = renderHook(() => usePageMeta('教师工作台'), {
      wrapper: wrapperFor('/teacher/assignments'),
    });

    expect(result.current.title).toBe('作业管理');
    expect(result.current.breadcrumbs).toContainEqual({ label: '作业管理' });
  });

  it('names a parameterised detail route', () => {
    const grade = renderHook(() => usePageMeta('教师工作台'), {
      wrapper: wrapperFor('/teacher/homework/12/grade'),
    });
    expect(grade.result.current.title).toBe('批改作业');

    const attempt = renderHook(() => usePageMeta('学生空间'), {
      wrapper: wrapperFor('/student/homework/12'),
    });
    expect(attempt.result.current.title).toBe('作业作答');

    const result = renderHook(() => usePageMeta('学生空间'), {
      wrapper: wrapperFor('/student/homework/12/result'),
    });
    // The more specific route wins; a prefix match that stopped at `homework/:id` would say
    // 作业作答 for the result page.
    expect(result.result.current.title).toBe('作业结果');
  });
});
