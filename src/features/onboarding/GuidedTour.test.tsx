import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GuidedTour from './GuidedTour';
import { tourStepsFor } from './tour/tourSteps';
import { clearReplayRequest } from './startupGuideStore';

/**
 * The guided tour, rendered against a stand-in interface.
 *
 * The tour's whole contract is that it points at real elements and is finished by really operating
 * them, so the tests render the anchors it looks for and then interact with *those* elements rather
 * than with the tour. A test that only pressed 下一步 would pass on a tour that pointed at nothing.
 *
 * `getBoundingClientRect` is stubbed because jsdom lays nothing out: every element reports a 0x0 box,
 * and the tour deliberately skips elements with no box (that check is what stops it spotlighting the
 * `hidden` desktop sidebar on a narrow viewport). Without the stub no anchor would ever be found.
 */

const mocks = vi.hoisted(() => ({
  classes: { data: [{ id: 1, name: '三年二班' }], isLoading: false } as {
    data: unknown[];
    isLoading: boolean;
  },
  reducedMotion: false,
  user: { id: 7, role: 'teacher', username: 't7', name: '测试老师' } as {
    id: number;
    role: string;
    username: string;
    name?: string;
  } | null,
}));

vi.mock('framer-motion', async () => {
  const { createElement } = await import('react');

  const strip = ({
    initial: _initial,
    animate: _animate,
    exit: _exit,
    transition: _transition,
    variants: _variants,
    whileHover: _whileHover,
    whileTap: _whileTap,
    ...rest
  }: Record<string, unknown>) => rest;

  const make = (tag: string) =>
    function MotionStub({ children, ...props }: Record<string, unknown>) {
      return createElement(tag, strip(props), children as React.ReactNode);
    };

  return {
    motion: new Proxy({} as Record<string, unknown>, {
      get: (_target, tag) => make(String(tag)),
    }),
    useReducedMotion: () => mocks.reducedMotion,
  };
});

vi.mock('@/store/useStore', () => ({
  useStore: (selector?: (state: unknown) => unknown) =>
    selector ? selector({ user: mocks.user }) : { user: mocks.user },
}));

vi.mock('@/hooks/queries/useClasses', () => ({
  useClasses: () => mocks.classes,
}));

const FULL_RECT = {
  top: 100,
  left: 120,
  width: 140,
  height: 40,
  bottom: 140,
  right: 260,
  x: 120,
  y: 100,
  toJSON: () => ({}),
} as DOMRect;

const EMPTY_RECT = {
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  bottom: 0,
  right: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

/**
 * The slice of the real interface the teacher tour walks through, with the anchors it looks for.
 *
 * Deliberately a plain `<button>` rather than the kit's: a test file is not measured by the UI audit
 * (its source scan excludes `*.test.*`), and what matters here is that a real element exists at the
 * anchor and that clicking it is seen.
 */
function FakeTeacherConsole({ onFeatureClick }: { onFeatureClick?: () => void } = {}) {
  return (
    <div>
      <nav data-tour="sidebar-nav">
        <button type="button" data-tour="nav:/teacher/features" onClick={onFeatureClick}>
          功能开关
        </button>
        <button type="button" data-tour="nav:/teacher/settings">
          个人设置
        </button>
      </nav>
      <div data-tour="teacher-class-tabs">三年二班</div>
      <input data-tour="teacher-search" aria-label="搜索学生" />
      <button type="button" data-tour="teacher-tools-toggle">
        课堂工具
      </button>
      <button type="button" data-tour="teacher-add-student">
        添加学生
      </button>
    </div>
  );
}

/** A stand-in for the first-run wizard, which is what a teacher with no class actually sees. */
function FakeFirstRunWizard() {
  return (
    <div>
      <nav data-tour="sidebar-nav">菜单</nav>
      <input data-tour="firstrun-class-name" aria-label="班级名称" />
      <textarea data-tour="firstrun-roster" aria-label="学生名单" />
      <div data-tour="firstrun-features">功能开关</div>
    </div>
  );
}

function renderTour(console = <FakeTeacherConsole />) {
  return render(
    <MemoryRouter initialEntries={['/teacher']}>
      {console}
      <GuidedTour />
    </MemoryRouter>,
  );
}

/** Press the tour's own primary button. */
function pressPrimary() {
  fireEvent.click(screen.getByRole('button', { name: /下一步|完成/ }));
}

const stepCounter = () => screen.getByText(/第 \d+ \/ \d+ 步/).textContent;

/**
 * The teacher tour is core steps plus one derived step per menu entry, so its length is the route
 * table's, not a number written down here. Hard-coding it is what this helper removes: the suite
 * should notice that the tour stopped covering a feature, not that a count moved.
 */
const TOTAL = tourStepsFor('teacher', { hasClass: true }).length;
const atStep = (n: number) => `第 ${n} / ${TOTAL} 步`;

beforeEach(() => {
  window.localStorage.clear();
  clearReplayRequest();
  mocks.classes = { data: [{ id: 1, name: '三年二班' }], isLoading: false };
  mocks.user = { id: 7, role: 'teacher', username: 't7', name: '测试老师' };
  mocks.reducedMotion = false;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(FULL_RECT);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearReplayRequest();
});

describe('GuidedTour', () => {
  it('opens on the first step and says where the reader is', () => {
    renderTour();

    expect(screen.getByText('这里是你的全部功能')).toBeInTheDocument();
    expect(stepCounter()).toBe(atStep(1));
    expect(screen.getByRole('button', { name: /跳过引导/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上一步/ })).toBeDisabled();
  });

  it('advances and goes back with its own controls', () => {
    renderTour();

    pressPrimary();
    expect(screen.getByText('先找到学生')).toBeInTheDocument();
    expect(stepCounter()).toBe(atStep(2));

    fireEvent.click(screen.getByRole('button', { name: /上一步/ }));
    expect(screen.getByText('这里是你的全部功能')).toBeInTheDocument();
    expect(stepCounter()).toBe(atStep(1));
  });

  it('finishes a step when the reader actually performs the action it asked for', () => {
    /*
     * The behaviour the whole redesign is for. The tour is on a `click` step, the reader presses the
     * real control, and the tour moves on because the control was pressed - not because a timer
     * expired or because they found the tour's own button.
     */
    renderTour();

    pressPrimary();
    pressPrimary();
    expect(screen.getByText('课堂上的随机工具')).toBeInTheDocument();

    fireEvent.click(screen.getByText('课堂工具'));

    expect(screen.getByText('工具展开在这里')).toBeInTheDocument();
    expect(stepCounter()).toBe(atStep(4));
  });

  it('finishes an input step when the reader types in the highlighted field', () => {
    renderTour();

    pressPrimary();
    expect(screen.getByText('先找到学生')).toBeInTheDocument();

    fireEvent.input(screen.getByLabelText('搜索学生'), { target: { value: '张' } });

    expect(screen.getByText('课堂上的随机工具')).toBeInTheDocument();
  });

  it('tells the reader that finishing the action continues the tour', () => {
    renderTour();

    pressPrimary();

    expect(screen.getByText(/完成上面的操作会自动继续/)).toBeInTheDocument();
  });

  it('leaves on 跳过引导 and records the account as having seen it', () => {
    renderTour();

    fireEvent.click(screen.getByRole('button', { name: /跳过引导/ }));

    expect(screen.queryByText('这里是你的全部功能')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('thinkclass-startup-guide-seen-7')).toBe('1');
  });

  it('leaves on Escape', () => {
    renderTour();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('这里是你的全部功能')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('thinkclass-startup-guide-seen-7')).toBe('1');
  });

  it('ends on 完成, on the settings page the menu itself ends with', () => {
    renderTour();

    for (let index = 0; index < TOTAL - 1; index += 1) pressPrimary();

    // The closing step is the menu's own last entry, not a step appended after it - so the tour's
    // ending and the menu's order cannot disagree. Queried as a heading because the stand-in console
    // renders a nav entry with the same words, which is the point: the step is *about* that entry.
    expect(screen.getByRole('heading', { name: '个人设置' })).toBeInTheDocument();
    expect(stepCounter()).toBe(atStep(TOTAL));

    fireEvent.click(screen.getByRole('button', { name: /完成/ }));

    expect(screen.queryByRole('heading', { name: '个人设置' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('thinkclass-startup-guide-seen-7')).toBe('1');
  });

  it('reaches a step for every menu entry, so no feature is left unexplained', () => {
    // Drives the whole tour rather than trusting the step list: the point is that the reader can
    // actually get to a sentence about each feature, not that one exists in an array.
    renderTour();

    const seen = new Set<string>();
    for (let index = 0; index < TOTAL; index += 1) {
      const heading = document.querySelector('#guided-tour-title')?.textContent ?? '';
      if (heading) seen.add(heading);
      if (index < TOTAL - 1) pressPrimary();
    }

    expect(seen.has('个人设置')).toBe(true);
    expect(seen.has('教师管理')).toBe(false); // not a teacher menu entry; guards against a stale id set
    expect(seen.size).toBeGreaterThan(20);
  });

  it('shows the fallback copy when a step has no target on this screen', async () => {
    vi.useFakeTimers();
    renderTour(<div />);

    expect(screen.getByText('这里是你的全部功能')).toBeInTheDocument();

    pressPrimary();

    // The step's own text while the search is still running...
    expect(screen.getByText('先找到学生')).toBeInTheDocument();
    expect(screen.getByText(/班上人多时/)).toBeInTheDocument();

    // ...and the fallback once it has given up, rather than a step that never resolves.
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByText(/这个搜索框只在你已经有班级/)).toBeInTheDocument();
  });

  it('treats an anchor with no box as absent, which is what hides the desktop sidebar on a phone', async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/teacher']}>
        <div data-tour="sidebar-nav" data-testid="hidden-sidebar">
          hidden
        </div>
        <GuidedTour />
      </MemoryRouter>,
    );

    const hidden = screen.getByTestId('hidden-sidebar');
    vi.spyOn(hidden, 'getBoundingClientRect').mockReturnValue(EMPTY_RECT);

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    // Not found, so the step cannot be shown as if it were - it says so instead.
    expect(screen.getByText(/左侧菜单按用途分组/)).toBeInTheDocument();
  });

  it('teaches the setup wizard instead when the teacher has no class yet', () => {
    // `TeacherDashboardPage` renders `FirstRunWizard` instead of the dashboard in that state, so the
    // dashboard's buttons do not exist to point at.
    mocks.classes = { data: [], isLoading: false };
    renderTour(<FakeFirstRunWizard />);

    pressPrimary();

    expect(screen.getByText('第一步：给班级起个名字')).toBeInTheDocument();
    expect(screen.queryByText('先找到学生')).not.toBeInTheDocument();
  });

  it('renders nothing while the teacher’s class list is still loading', () => {
    // Picking the wrong shape of the teacher tour and then swapping it mid-run would move the reader
    // to a different step at the same index, so the tour waits for the answer instead.
    mocks.classes = { data: [], isLoading: true };
    renderTour();

    expect(screen.queryByText('这里是你的全部功能')).not.toBeInTheDocument();
  });

  it('does not open for an account with no role the tour knows', () => {
    mocks.user = { id: 7, role: 'visitor', username: 'v' };
    renderTour();

    expect(screen.queryByText('这里是你的全部功能')).not.toBeInTheDocument();
  });

  it('stays open across a step change while motion is reduced', () => {
    mocks.reducedMotion = true;
    renderTour();

    pressPrimary();

    expect(screen.getByText('先找到学生')).toBeInTheDocument();
  });
});
