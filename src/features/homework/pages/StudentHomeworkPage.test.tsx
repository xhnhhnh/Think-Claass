import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StudentHomework from './StudentHomeworkPage';

const mocks = vi.hoisted(() => ({
  useMyHomework: vi.fn(),
}));

vi.mock('@/features/homework/hooks/useHomework', () => ({
  useMyHomework: mocks.useMyHomework,
}));

/**
 * 我的作业 - "no homework" and "we could not ask" are different sentences.
 *
 * The page rendered 「暂时没有作业」 for a failed read. That tells a pupil their teacher set nothing,
 * and the one action that helps (retry) was not on the page at all.
 */
describe('StudentHomeworkPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <StudentHomework />
      </MemoryRouter>,
    );

  it('offers a retry instead of claiming there is no homework', () => {
    const refetch = vi.fn();
    mocks.useMyHomework.mockReturnValue({ data: [], isLoading: false, isError: true, refetch });

    renderPage();

    expect(screen.getByText('作业列表没有加载出来')).toBeInTheDocument();
    expect(screen.queryByText('暂时没有作业')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('still says "no homework" when the list really is empty', () => {
    mocks.useMyHomework.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });

    renderPage();

    expect(screen.getByText('暂时没有作业')).toBeInTheDocument();
  });
});
