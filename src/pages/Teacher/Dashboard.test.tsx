import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherDashboard from './Dashboard';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useStore: vi.fn(),
  useClasses: vi.fn(),
  useStudents: vi.fn(),
  useGroups: vi.fn(),
  usePresets: vi.fn(),
  useSettings: vi.fn(),
  useStudentMutations: vi.fn(),
  getStudentRadar: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useLocation: () => ({ pathname: '/teacher', state: null }),
  };
});

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

vi.mock('@/hooks/queries/useClasses', () => ({
  useClasses: mocks.useClasses,
}));

vi.mock('@/hooks/queries/useStudents', () => ({
  useStudents: mocks.useStudents,
}));

vi.mock('@/hooks/queries/useGroups', () => ({
  useGroups: mocks.useGroups,
}));

vi.mock('@/hooks/queries/usePresets', () => ({
  usePresets: mocks.usePresets,
}));

vi.mock('@/hooks/queries/useSettings', () => ({
  useSettings: mocks.useSettings,
}));

vi.mock('@/hooks/queries/useStudentMutations', () => ({
  useStudentMutations: mocks.useStudentMutations,
}));

vi.mock('@/api/teacher', () => ({
  teacherApi: {
    createClass: vi.fn(),
    createGroup: vi.fn(),
    createPreset: vi.fn(),
    deletePreset: vi.fn(),
    sendPraise: vi.fn(),
  },
}));

vi.mock('@/api/analytics', () => ({
  analyticsApi: {
    getStudentRadar: mocks.getStudentRadar,
  },
}));

vi.mock('./components/DroppableGroup', () => ({
  DroppableGroup: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('./components/DraggableStudent', () => ({
  DraggableStudent: () => <div>student card</div>,
}));

vi.mock('./components/ClassroomTools', () => ({
  ClassroomTools: () => <div>classroom tools</div>,
}));

vi.mock('./components/PointsModal', () => ({
  PointsModal: () => null,
}));

vi.mock('./components/CreateClassModal', () => ({
  CreateClassModal: () => null,
}));

vi.mock('./components/CreateGroupModal', () => ({
  CreateGroupModal: () => null,
}));

vi.mock('./components/PraiseModal', () => ({
  PraiseModal: () => null,
}));

vi.mock('./components/EditStudentsModal', () => ({
  EditStudentsModal: () => null,
}));

vi.mock('./components/AIRadarModal', () => ({
  AIRadarModal: () => null,
}));

vi.mock('./components/ClassFeaturePanel', () => ({
  default: ({ classId, compact }: { classId: number | null; compact?: boolean }) => (
    <div>{`feature-panel-${classId}-${compact ? 'compact' : 'full'}`}</div>
  ),
}));

describe('TeacherDashboard', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.useStore.mockImplementation((selector: any) =>
      selector({
        user: { id: 7, role: 'teacher', name: '王老师' },
      }),
    );
    mocks.useClasses.mockReturnValue({
      data: [{ id: 1, name: '一年级一班' }],
    });
    mocks.useStudents.mockReturnValue({
      data: [],
      isLoading: false,
    });
    mocks.useGroups.mockReturnValue({
      data: [],
    });
    mocks.usePresets.mockReturnValue({
      data: [],
    });
    mocks.useSettings.mockReturnValue({
      data: { enable_teacher_analytics: '1' },
    });
    mocks.useStudentMutations.mockReturnValue({
      addPointsMutation: { mutate: vi.fn(), isPending: false },
      addBatchPointsMutation: { mutate: vi.fn(), isPending: false },
      changeGroupMutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
      changeClassMutation: { mutateAsync: vi.fn(), isPending: false },
      resetPasswordMutation: { mutateAsync: vi.fn(), isPending: false },
    });
  });

  it('renders compact class feature panel for selected class', async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherDashboard />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('课堂功能控制')).toBeInTheDocument();
    expect(screen.getByText('feature-panel-1-compact')).toBeInTheDocument();
  });
});
