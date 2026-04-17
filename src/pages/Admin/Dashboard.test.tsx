import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Dashboard from './Dashboard';

const mocks = vi.hoisted(() => ({
  useAdminStatsQuery: vi.fn(),
  useDatabaseImportMutation: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/features/admin/hooks/useAdminSystem', () => ({
  useAdminStatsQuery: mocks.useAdminStatsQuery,
  useDatabaseImportMutation: mocks.useDatabaseImportMutation,
}));

vi.mock('@/features/admin/api/adminClient', () => ({
  adminClient: {
    getDatabaseExportUrl: () => '/api/admin/system/database/export',
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});

describe('AdminDashboard', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.useAdminStatsQuery.mockReturnValue({
      data: {
        server: {
          cpuUsage: 10,
          cpuCount: 8,
          totalMem: 16000000000,
          usedMem: 8000000000,
          freeMem: 8000000000,
          memUsage: 50,
          uptime: 3600,
          platform: 'win32',
        },
        database: {
          totalUsers: 10,
          teachers: 2,
          students: 8,
          classes: 1,
          totalActivity: 20,
          totalAssignments: 3,
          totalLeaves: 1,
          totalTeamQuests: 2,
          totalPoints: 1000,
        },
      },
      isPending: false,
      isRefetching: false,
      refetch: vi.fn(),
    });
    mocks.useDatabaseImportMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });
  });

  it('renders the new admin system actions', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByText('系统仪表盘')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出数据' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入数据' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '系统重置' })).toBeInTheDocument();
  });
});
