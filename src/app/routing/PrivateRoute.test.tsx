import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PrivateRoute from './PrivateRoute';

const mocks = vi.hoisted(() => ({
  useSettings: vi.fn(),
  useStore: vi.fn(),
}));

vi.mock('@/hooks/queries/useSettings', () => ({
  useSettings: mocks.useSettings,
}));

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

describe('PrivateRoute', () => {
  beforeEach(() => {
    mocks.useSettings.mockReset();
    mocks.useStore.mockReset();
  });

  it('shows a branded loading state while the site settings resolve', () => {
    mocks.useSettings.mockReturnValue({ data: undefined, isLoading: true });
    mocks.useStore.mockReturnValue({ user: { id: 8, role: 'student', username: 'student01' } });

    render(
      <MemoryRouter initialEntries={['/student']}>
        <Routes>
          <Route
            path="/student"
            element={(
              <PrivateRoute allowedRoles={['student']}>
                <div>Student content</div>
              </PrivateRoute>
            )}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('正在准备你的工作台…')).toBeInTheDocument();
    expect(screen.queryByText('Student content')).not.toBeInTheDocument();
  });

  it('sends a signed-in account that opens another console to its own console', () => {
    mocks.useSettings.mockReturnValue({ data: {}, isLoading: false });
    mocks.useStore.mockReturnValue({
      user: { id: 7, role: 'teacher', username: 'teacher01', is_activated: true },
    });

    render(
      <MemoryRouter initialEntries={['/student']}>
        <Routes>
          <Route
            path="/student"
            element={(
              <PrivateRoute allowedRoles={['student']}>
                <div>Student content</div>
              </PrivateRoute>
            )}
          />
          <Route path="/teacher" element={<div>Teacher console</div>} />
          <Route path="/" element={<div>Marketing home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // It used to send everyone to `/`, the marketing homepage.
    expect(screen.getByText('Teacher console')).toBeInTheDocument();
    expect(screen.queryByText('Marketing home')).not.toBeInTheDocument();
  });

  it('sends a visitor with no session to the login page', () => {
    mocks.useSettings.mockReturnValue({ data: {}, isLoading: false });
    mocks.useStore.mockReturnValue({ user: null });

    render(
      <MemoryRouter initialEntries={['/student']}>
        <Routes>
          <Route
            path="/student"
            element={(
              <PrivateRoute allowedRoles={['student']}>
                <div>Student content</div>
              </PrivateRoute>
            )}
          />
          <Route path="/login" element={<div>Sign in</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('routes unactivated users to the payment page when the operator chose direct payment', () => {
    mocks.useSettings.mockReturnValue({
      data: {
        revenue_enabled: '1',
        revenue_mode: 'direct_payment',
      },
      isLoading: false,
    });
    mocks.useStore.mockReturnValue({
      user: {
        id: 8,
        role: 'student',
        username: 'student01',
        is_activated: false,
      },
    });

    render(
      <MemoryRouter initialEntries={['/student']}>
        <Routes>
          <Route
            path="/student"
            element={(
              <PrivateRoute allowedRoles={['student']}>
                <div>Student content</div>
              </PrivateRoute>
            )}
          />
          <Route path="/activate" element={<div>Card key activation</div>} />
          <Route path="/payment" element={<div>Scan payment</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // `direct_payment` used to be unreachable: this file sent everyone to `/activate` regardless,
    // and `/payment` was a static card nothing linked to.
    expect(screen.getByText('Scan payment')).toBeInTheDocument();
    expect(screen.queryByText('Card key activation')).not.toBeInTheDocument();
  });

  it('routes unactivated users to card-key activation when that is the configured mode', () => {
    mocks.useSettings.mockReturnValue({
      data: {
        revenue_enabled: '1',
        revenue_mode: 'activation_code',
      },
      isLoading: false,
    });
    mocks.useStore.mockReturnValue({
      user: {
        id: 8,
        role: 'student',
        username: 'student01',
        is_activated: false,
      },
    });

    render(
      <MemoryRouter initialEntries={['/student']}>
        <Routes>
          <Route
            path="/student"
            element={(
              <PrivateRoute allowedRoles={['student']}>
                <div>Student content</div>
              </PrivateRoute>
            )}
          />
          <Route path="/activate" element={<div>Card key activation</div>} />
          <Route path="/payment" element={<div>Scan payment</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Card key activation')).toBeInTheDocument();
    expect(screen.queryByText('Scan payment')).not.toBeInTheDocument();
  });
});
