/**
 * 大屏展示 - fullscreen state.
 *
 * The page used to set `isFullscreen` before `requestFullscreen` resolved and never listened to the
 * document, so pressing Esc (or a browser refusing the request) left the dark stage rendered while
 * the document was not full screen. These pin the reconciliation with `fullscreenchange` and the
 * Chinese failure message.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeacherBigscreen from '@/features/classroom/pages/TeacherBigscreenPage';

const mocks = vi.hoisted(() => ({
  getClasses: vi.fn(),
  getBigscreen: vi.fn(),
  toastError: vi.fn(),
  requestFullscreen: vi.fn(),
  exitFullscreen: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.toastError } }));

vi.mock('@/app/commands/registry', () => ({ useRegisterPageCommands: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/components/DanmakuOverlay', () => ({ default: () => null }));

vi.mock('@/features/classroom/api/classesApi', () => ({
  classroomApi: { getClasses: mocks.getClasses, getBigscreen: mocks.getBigscreen },
}));

vi.mock('@/features/classroom/hooks/useResolvedClassFeatures', () => ({
  useResolvedClassFeatures: () => ({
    features: { enable_danmaku: false, enable_world_boss: false },
    canDecide: true,
  }),
}));

// `ClassFeaturePanel` lives in the legacy teacher components and talks to real APIs; the fullscreen
// behaviour under test does not depend on it.
vi.mock('@/pages/Teacher/components/ClassFeaturePanel', () => ({ default: () => null }));

const bigscreenPayload = {
  success: true,
  class: { id: 1, name: '一班', invite_code: 'CODE1' },
  topStudents: [],
  latestPraises: [],
  latestRecords: [],
  activeBoss: null,
};

describe('TeacherBigscreen fullscreen state', () => {
  let fullscreenElement: Element | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    fullscreenElement = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    mocks.requestFullscreen.mockImplementation(async () => {
      fullscreenElement = document.documentElement;
    });
    mocks.exitFullscreen.mockImplementation(async () => {
      fullscreenElement = null;
    });
    (document.documentElement as any).requestFullscreen = mocks.requestFullscreen;
    (document as any).exitFullscreen = mocks.exitFullscreen;

    mocks.getClasses.mockResolvedValue({ success: true, classes: [{ id: 1, name: '一班', invite_code: 'CODE1' }] });
    mocks.getBigscreen.mockResolvedValue(bigscreenPayload);
  });

  const renderPage = () => render(<TeacherBigscreen />);

  it('shows the setup summary before going fullscreen', async () => {
    renderPage();

    expect(await screen.findByText('把这一节课，投到大屏上。')).toBeInTheDocument();
    expect(screen.getByText('课堂光荣榜')).toBeInTheDocument();
    expect(screen.getByText('大屏相关功能')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /进入大屏模式/ })).toBeInTheDocument();
  });

  it('only shows the stage as fullscreen while the document really is', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /进入大屏模式/ }));

    await waitFor(() => expect(mocks.requestFullscreen).toHaveBeenCalledTimes(1));
    // The fullscreenchange listener picks the real document state up.
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(await screen.findByRole('button', { name: '退出大屏' })).toBeInTheDocument();

    // Esc: the browser clears the element and fires the event; the page must follow.
    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /进入大屏模式/ })).toBeInTheDocument(),
    );
  });

  it('stays non-fullscreen and says so in Chinese when the browser refuses', async () => {
    mocks.requestFullscreen.mockRejectedValue(new Error('denied by policy'));

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /进入大屏模式/ }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(String(mocks.toastError.mock.calls[0][0])).toContain('进入大屏失败');
    expect(screen.getByRole('button', { name: /进入大屏模式/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '退出大屏' })).not.toBeInTheDocument();
  });
});
