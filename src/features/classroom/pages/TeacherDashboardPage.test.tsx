import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherDashboard from '@/features/classroom/pages/TeacherDashboardPage';

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
  getClassPraises: vi.fn(),
  classroomCreateClass: vi.fn(),
}));

vi.mock('@/features/engagement/api/praisesApi', () => ({
  praisesApi: { getClassPraises: mocks.getClassPraises },
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

vi.mock('@/features/classroom/api/classesApi', () => ({
  teacherApi: {
    createClass: vi.fn(),
    createGroup: vi.fn(),
    createPreset: vi.fn(),
    deletePreset: vi.fn(),
    sendPraise: vi.fn(),
  },
  // The first-run wizard is exercised through the real dashboard by one test below; it creates its
  // class through `classroomApi.createClass` (the ordinary endpoint), not `teacherApi`.
  classroomApi: {
    createClass: mocks.classroomCreateClass,
  },
}));

vi.mock('@/features/classroom/api/analyticsApi', () => ({
  analyticsApi: {
    getStudentRadar: mocks.getStudentRadar,
  },
}));

vi.mock('@/pages/Teacher/components/DroppableGroup', () => ({
  DroppableGroup: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/pages/Teacher/components/DraggableStudent', () => ({
  DraggableStudent: () => <div>student card</div>,
}));

vi.mock('@/pages/Teacher/components/ClassroomTools', () => ({
  ClassroomTools: () => <div>classroom tools</div>,
}));

vi.mock('@/pages/Teacher/components/PointsModal', () => ({
  PointsModal: () => null,
}));

vi.mock('@/pages/Teacher/components/CreateClassModal', () => ({
  CreateClassModal: () => null,
}));

vi.mock('@/pages/Teacher/components/CreateGroupModal', () => ({
  CreateGroupModal: () => null,
}));

vi.mock('@/pages/Teacher/components/PraiseModal', () => ({
  PraiseModal: () => null,
}));

vi.mock('@/pages/Teacher/components/EditStudentsModal', () => ({
  EditStudentsModal: () => null,
}));

vi.mock('@/pages/Teacher/components/AIRadarModal', () => ({
  AIRadarModal: () => null,
}));

vi.mock('@/pages/Teacher/components/ClassFeaturePanel', () => ({
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
      // The dashboard consults the same query for the first-run wizard, which shows only when the
      // account has no classes at all. Loaded-but-empty is a different state from loading.
      isLoading: false,
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
    mocks.getClassPraises.mockResolvedValue({ success: true, praises: [] });
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

    expect(await screen.findByText('班级策略与功能设置')).toBeInTheDocument();
    expect(screen.getByText('feature-panel-1-compact')).toBeInTheDocument();
  });

  it('does not tell the teacher the class is empty when the roster failed to load', async () => {
    // The old empty state said 「班级还没有学生，点击"添加学生"开始」 for an empty roster, a search
    // with no hits *and* a failed read - so a broken request invited the teacher to re-add pupils.
    const refetch = vi.fn();
    mocks.useStudents.mockReturnValue({ data: [], isLoading: false, isError: true, refetch });

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherDashboard />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('学生名单没有加载出来')).toBeInTheDocument();
    expect(screen.queryByText(/班级还没有学生/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(refetch).toHaveBeenCalled();
  });

  /**
   * 最近表扬 - the class roll-up of the praise the teacher hands out one pupil at a time.
   *
   * `GET /api/praises?classId=` was the last route in the praise family with no caller: the praise
   * modal sends one and each pupil's own page reads theirs, but nothing showed the class what it had
   * been praised for.
   */
  it('lists the class praise roll-up, newest first', async () => {
    mocks.getClassPraises.mockResolvedValue({
      success: true,
      praises: [
        { id: 2, student_id: 11, student_name: '小红', content: '主动帮同学讲题', color: 'pink', created_at: '2026-05-02 09:00:00' },
        { id: 1, student_id: 10, student_name: '小明', content: '作业字迹工整', color: 'blue', created_at: '2026-05-01 09:00:00' },
      ],
    });

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherDashboard />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('最近表扬')).toBeInTheDocument();
    await waitFor(() => expect(mocks.getClassPraises).toHaveBeenCalledWith(1));
    expect(screen.getByText('小红')).toBeInTheDocument();
    expect(screen.getByText('主动帮同学讲题')).toBeInTheDocument();
    expect(screen.getByText('小明')).toBeInTheDocument();
  });

  it('does not tell the teacher nobody was praised when the roll-up failed', async () => {
    mocks.getClassPraises.mockRejectedValueOnce(new Error('offline'));

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TeacherDashboard />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('表扬记录没有加载出来')).toBeInTheDocument();
    expect(screen.queryByText(/还没有表扬记录/)).not.toBeInTheDocument();
  });

  /**
   * The first-run wizard's own step 1 creates the class, and steps 2–4 (roster, features, done)
   * write to that class. Deriving visibility from a live `classes.length === 0` unmounted the
   * wizard the moment the create succeeded, stranding the rest of the flow. The dashboard must
   * keep rendering it after the classes query answers with the new class.
   */
  it('keeps the first-run wizard on the roster step after its class is created', async () => {
    mocks.useClasses.mockReturnValue({ data: [], isLoading: false });
    mocks.classroomCreateClass.mockResolvedValue({
      success: true,
      class: { id: 42, name: '三年二班', invite_code: 'ABC123' },
    });

    const queryClient = new QueryClient();
    const ui = (
      <QueryClientProvider client={queryClient}>
        <TeacherDashboard />
      </QueryClientProvider>
    );
    const { rerender } = render(ui);

    fireEvent.change(await screen.findByPlaceholderText('三年二班'), { target: { value: '三年二班' } });
    fireEvent.click(screen.getByRole('button', { name: /创建班级/ }));

    // Step 2 is now on screen; then the classes query answers with the class just created.
    expect(await screen.findByText('学生名单')).toBeInTheDocument();
    mocks.useClasses.mockReturnValue({ data: [{ id: 42, name: '三年二班' }], isLoading: false });
    rerender(ui);

    expect(screen.getByText('学生名单')).toBeInTheDocument();
    expect(screen.queryByText('让每个孩子的进步都被看见')).not.toBeInTheDocument();
  });
});
