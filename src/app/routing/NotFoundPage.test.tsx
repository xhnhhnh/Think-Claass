import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NotFoundPage from './NotFoundPage';
import { homePathForRole } from './homePath';

const mocks = vi.hoisted(() => ({ user: null as null | { id: number; role: string } }));

vi.mock('@/store/useStore', () => ({
  useStore: (selector: (state: { user: typeof mocks.user }) => unknown) =>
    selector({ user: mocks.user }),
}));

describe('NotFoundPage', () => {
  beforeEach(() => {
    mocks.user = null;
  });

  it('renders a recoverable page instead of nothing', () => {
    render(
      <MemoryRouter initialEntries={['/no-such-page']}>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('这个页面不存在')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回到官网首页' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '去登录' })).toBeInTheDocument();
  });

  it('offers a signed-in reader their own console', () => {
    mocks.user = { id: 5, role: 'teacher' };
    render(
      <MemoryRouter initialEntries={['/no-such-page']}>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: '回到我的控制台' })).toBeInTheDocument();
  });
});

describe('homePathForRole', () => {
  it('gives every role its own console, never the marketing homepage', () => {
    expect(homePathForRole('teacher')).toBe('/teacher');
    expect(homePathForRole('student')).toBe('/student');
    expect(homePathForRole('parent')).toBe('/parent/dashboard');
    expect(homePathForRole('superadmin')).toMatch(/^\/.+/);
    expect(homePathForRole('admin')).toMatch(/^\/.+/);
    expect(homePathForRole(null)).toBe('/');
  });
});
