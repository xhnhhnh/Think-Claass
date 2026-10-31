/**
 * Teacher console shell gating.
 *
 * Three states matter before the rail may hide an entry or the page redirect: class list loading,
 * class list failed, and both answers known. The tests pin that "unknown" is never treated as
 * "switched off" - the defect was a refresh of a gated page bouncing to `/teacher` and the rail
 * flickering entries away before `/api/classes` answered - and that a failed class read renders its
 * own retry instead of the dashboard / first-run wizard.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherLayout from '@/app/layouts/TeacherLayout';
import { allClassFeatures, defaultClassFeatures } from '@/lib/classFeatures';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useStore: vi.fn(),
  useClasses: vi.fn(),
  useResolvedClassFeatures: vi.fn(),
  location: { pathname: '/teacher/shop', state: null as unknown },
  shell: { props: null as null | Record<string, any> },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useLocation: () => mocks.location,
    Outlet: () => <div data-testid="outlet-content" />,
  };
});

vi.mock('@/app/layouts/AppShell', () => ({
  AppShell: (props: Record<string, any>) => {
    mocks.shell.props = props;
    return <div data-testid="teacher-shell">{props.children}</div>;
  },
}));

vi.mock('@/store/useStore', () => ({
  useStore: mocks.useStore,
}));

vi.mock('@/hooks/queries/useClasses', () => ({
  useClasses: mocks.useClasses,
}));

vi.mock('@/features/classroom/hooks/useResolvedClassFeatures', () => ({
  useResolvedClassFeatures: mocks.useResolvedClassFeatures,
}));

const featuresWithShop = { ...defaultClassFeatures, enable_shop: true };

describe('TeacherLayout', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.shell.props = null;
    mocks.location.pathname = '/teacher/shop';
    mocks.useStore.mockImplementation((selector: any) =>
      selector({
        user: { id: 7, role: 'teacher', username: '王老师' },
        logout: vi.fn(),
      }),
    );
    mocks.useClasses.mockReturnValue({ data: undefined, isLoading: true, isSuccess: false });
    mocks.useResolvedClassFeatures.mockReturnValue({
      features: defaultClassFeatures,
      canDecide: false,
      isError: false,
      refetch: vi.fn(),
      source: 'unknown',
    });
  });

  it('decides nothing while the class list is loading: no redirect, nothing hidden, all features on', () => {
    mocks.useClasses.mockReturnValue({ data: undefined, isLoading: true, isSuccess: false });
    mocks.useResolvedClassFeatures.mockReturnValue({
      features: defaultClassFeatures,
      canDecide: false,
      isError: false,
      refetch: vi.fn(),
      source: 'unknown',
    });

    render(<TeacherLayout />);

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.shell.props?.hiddenPaths).toEqual([]);
    expect(mocks.shell.props?.features).toEqual(allClassFeatures);
    expect(screen.getByTestId('outlet-content')).toBeInTheDocument();
    expect(screen.queryByTestId('teacher-classes-error')).not.toBeInTheDocument();
  });

  it('does not hide a gated entry while the class-features answer is still pending', () => {
    mocks.useClasses.mockReturnValue({
      data: [{ id: 1, name: '一班' }],
      isLoading: false,
      isSuccess: true,
      isFetching: false,
    });
    mocks.useResolvedClassFeatures.mockReturnValue({
      features: defaultClassFeatures,
      canDecide: false,
      isError: false,
      refetch: vi.fn(),
      source: 'unknown',
    });

    render(<TeacherLayout />);

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.shell.props?.hiddenPaths).toEqual([]);
    expect(mocks.shell.props?.features).toEqual(allClassFeatures);
  });

  it('renders an explicit error with a retry when the class list failed, and never the routed page', () => {
    const refetch = vi.fn();
    mocks.useClasses.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
      isFetching: false,
      refetch,
    });

    render(<TeacherLayout />);

    expect(screen.getByTestId('teacher-classes-error')).toBeInTheDocument();
    expect(screen.getByText('班级列表加载失败')).toBeInTheDocument();
    expect(screen.queryByTestId('outlet-content')).not.toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
    // Unknown, not off: the shell must not hide entries over a failed request.
    expect(mocks.shell.props?.hiddenPaths).toEqual([]);
    expect(mocks.shell.props?.features).toEqual(allClassFeatures);

    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('does not redirect a menu-gated route whose flag is off', () => {
    mocks.location.pathname = '/teacher/certificates';
    mocks.useClasses.mockReturnValue({
      data: [{ id: 1, name: '一班' }],
      isLoading: false,
      isSuccess: true,
      isFetching: false,
    });
    mocks.useResolvedClassFeatures.mockReturnValue({
      features: { ...defaultClassFeatures, enable_achievements: false },
      canDecide: true,
      isError: false,
      refetch: vi.fn(),
      source: 'class',
    });

    render(<TeacherLayout />);

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.shell.props?.hiddenPaths).toContain('/teacher/certificates');
    expect(screen.getByTestId('outlet-content')).toBeInTheDocument();
  });

  it('hides only the entries whose flag is really off once both answers are known', () => {
    mocks.useClasses.mockReturnValue({
      data: [{ id: 1, name: '一班' }],
      isLoading: false,
      isSuccess: true,
      isFetching: false,
    });
    mocks.useResolvedClassFeatures.mockReturnValue({
      features: featuresWithShop,
      canDecide: true,
      isError: false,
      refetch: vi.fn(),
      source: 'class',
    });

    render(<TeacherLayout />);

    // Shop on -> shop entry shown, and 奖品核销 is shown too because shop purchases mint the
    // tickets it verifies. Economy off -> hidden.
    expect(mocks.shell.props?.hiddenPaths).toEqual(
      expect.arrayContaining(['/teacher/economy', '/teacher/auction', '/teacher/blind-box']),
    );
    expect(mocks.shell.props?.hiddenPaths).not.toContain('/teacher/shop');
    expect(mocks.shell.props?.hiddenPaths).not.toContain('/teacher/verification');
    expect(mocks.shell.props?.features).toEqual(featuresWithShop);
    // Menu visibility is not route permission: a hidden entry stays reachable by URL. The
    // selected class and feature answer are known, and `/teacher/shop` is allowed.
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
