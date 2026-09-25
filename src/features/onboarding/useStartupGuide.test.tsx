import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { adminPath } from '@/constants';

import { clearReplayRequest, markGuideSeen } from './startupGuideStore';
import { isInsideRoleShell, useStartupGuide } from './useStartupGuide';

/**
 * When the guide is allowed on screen.
 *
 * The interesting cases are all negatives: a guide that covers the activation form or the payment
 * page is worse than no guide, and a guide that reappears for an account that has dismissed it is
 * the bug the whole seen-flag exists to prevent.
 */

function Probe({ userId }: { userId: number | null }) {
  const { shouldShow, finish, replay } = useStartupGuide(userId);

  return (
    <div>
      <span data-testid="show">{shouldShow ? 'yes' : 'no'}</span>
      <button type="button" onClick={finish}>
        finish
      </button>
      <button type="button" onClick={replay}>
        replay
      </button>
    </div>
  );
}

function renderAt(path: string, userId: number | null = 42) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe userId={userId} />
    </MemoryRouter>,
  );
}

const shouldShow = () => screen.getByTestId('show').textContent === 'yes';

beforeEach(() => {
  window.localStorage.clear();
  clearReplayRequest();
});

afterEach(() => {
  clearReplayRequest();
});

describe('isInsideRoleShell', () => {
  it('accepts the four shells and the pages under them', () => {
    expect(isInsideRoleShell('/teacher')).toBe(true);
    expect(isInsideRoleShell('/teacher/settings')).toBe(true);
    expect(isInsideRoleShell('/student/pet')).toBe(true);
    expect(isInsideRoleShell('/parent/dashboard')).toBe(true);
    expect(isInsideRoleShell(adminPath())).toBe(true);
    expect(isInsideRoleShell(`${adminPath()}/audit-logs`)).toBe(true);
  });

  it('rejects the public routes and the flows nobody wants covered', () => {
    expect(isInsideRoleShell('/')).toBe(false);
    expect(isInsideRoleShell('/login')).toBe(false);
    // The one shell-shaped route that is not part of a shell: the console's own sign-in screen.
    expect(isInsideRoleShell(`${adminPath()}/login`)).toBe(false);
    // Outside every shell, which is exactly why `PrivateRoute` can park an unactivated account here.
    expect(isInsideRoleShell('/activate')).toBe(false);
    expect(isInsideRoleShell('/payment')).toBe(false);
  });

  it('does not accept a path that merely shares a prefix', () => {
    // `/teacherly` must not match `/teacher`.
    expect(isInsideRoleShell('/teacherly')).toBe(false);
  });
});

describe('useStartupGuide', () => {
  it('shows inside a shell for an account that has not seen it', () => {
    renderAt('/teacher/settings');
    expect(shouldShow()).toBe(true);
  });

  it('stays hidden for an account that has seen it', () => {
    markGuideSeen(42);
    renderAt('/teacher/settings');
    expect(shouldShow()).toBe(false);
  });

  it('stays hidden outside a shell even for an account that has never seen it', () => {
    renderAt('/login');
    expect(shouldShow()).toBe(false);
  });

  it('stays hidden when there is no account at all', () => {
    renderAt('/teacher/settings', null);
    expect(shouldShow()).toBe(false);
  });

  it('records the dismissal, which is what keeps it from coming back on the next login', () => {
    renderAt('/teacher/settings');
    expect(shouldShow()).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'finish' }));

    expect(shouldShow()).toBe(false);
    expect(window.localStorage.getItem('thinkclass-startup-guide-seen-42')).toBe('1');
  });

  it('opens on request even for an account that has already dismissed it', () => {
    markGuideSeen(42);
    renderAt('/teacher/settings');
    expect(shouldShow()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'replay' }));

    expect(shouldShow()).toBe(true);
  });

  it('still refuses a replay outside a shell', () => {
    // The settings card is the only caller, and it is always inside a shell - this pins that the
    // replay request cannot be used to put the guide over the login or the activation page.
    renderAt('/activate');
    fireEvent.click(screen.getByRole('button', { name: 'replay' }));
    expect(shouldShow()).toBe(false);
  });

  it('treats each account separately, because one browser serves a whole class', () => {
    markGuideSeen(42);
    const view = renderAt('/student/pet', 42);
    expect(shouldShow()).toBe(false);

    view.rerender(
      <MemoryRouter initialEntries={['/student/pet']}>
        <Probe userId={43} />
      </MemoryRouter>,
    );

    expect(shouldShow()).toBe(true);
  });
});
