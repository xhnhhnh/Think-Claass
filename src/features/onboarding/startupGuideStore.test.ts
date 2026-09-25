import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GUIDE_SEEN_PREFIX,
  clearReplayRequest,
  getReplayRequested,
  guideSeenKey,
  hasSeenGuide,
  markGuideSeen,
  requestReplay,
  subscribeReplay,
} from './startupGuideStore';

/**
 * The seen flag and the replay signal.
 *
 * The flag is the only thing that decides whether a second login shows the guide again, so the
 * assertions that matter are the two isolation ones: per account (a shared classroom machine hands
 * the same browser to thirty students) and per dismissal (a replay must not un-dismiss it for
 * everyone else).
 */

beforeEach(() => {
  window.localStorage.clear();
  clearReplayRequest();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearReplayRequest();
});

describe('the seen flag', () => {
  it('starts unset and reads back what was marked', () => {
    expect(hasSeenGuide(7)).toBe(false);

    markGuideSeen(7);

    expect(hasSeenGuide(7)).toBe(true);
  });

  it('is keyed by account, so one student does not use up another student’s first look', () => {
    markGuideSeen(7);

    expect(hasSeenGuide(7)).toBe(true);
    expect(hasSeenGuide(8)).toBe(false);
  });

  it('stores under a key the test seam can name', () => {
    expect(guideSeenKey(12)).toBe(`${GUIDE_SEEN_PREFIX}12`);
    markGuideSeen(12);
    expect(window.localStorage.getItem(`${GUIDE_SEEN_PREFIX}12`)).toBe('1');
  });

  it('reports "not seen" rather than throwing when storage is unavailable', () => {
    // Private mode throws on the property access, not on the read. The harmless direction is to
    // show the guide again; the other direction is a guide that can never be shown again.
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage disabled');
      });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('storage disabled');
      });

    expect(hasSeenGuide(1)).toBe(false);
    expect(() => markGuideSeen(1)).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
    expect(hasSeenGuide(1)).toBe(false);
  });
});

describe('the replay signal', () => {
  it('starts clear and flips on request', () => {
    expect(getReplayRequested()).toBe(false);
    requestReplay();
    expect(getReplayRequested()).toBe(true);
  });

  it('notifies subscribers once per real change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeReplay(listener);

    requestReplay();
    expect(listener).toHaveBeenCalledTimes(1);

    // Already requested: nothing changed, so nobody is woken up.
    requestReplay();
    expect(listener).toHaveBeenCalledTimes(1);

    clearReplayRequest();
    expect(listener).toHaveBeenCalledTimes(2);

    clearReplayRequest();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('stops notifying an unsubscribed listener', () => {
    const listener = vi.fn();
    subscribeReplay(listener)();

    requestReplay();

    expect(listener).not.toHaveBeenCalled();
  });

  it('leaves the seen flag alone, so a replay cannot re-arm the automatic showing', () => {
    // This is the property the settings card promises in its own copy: 重看之后它仍然只在第一次
    // 进入时自动出现.
    markGuideSeen(3);
    requestReplay();
    clearReplayRequest();

    expect(hasSeenGuide(3)).toBe(true);
    expect(getReplayRequested()).toBe(false);
  });
});
