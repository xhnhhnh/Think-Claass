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

  it('routes unactivated users to card-key activation when direct scan payment is still configured', () => {
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

    expect(screen.getByText('Card key activation')).toBeInTheDocument();
    expect(screen.queryByText('Scan payment')).not.toBeInTheDocument();
  });
});
