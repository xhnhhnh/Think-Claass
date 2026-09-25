/**
 * How the API client reports 401 and 403.
 *
 * These were one branch with one message: "登录已过期或无权限，请重新登录". Two concrete problems,
 * both of which made a working feature look broken:
 *
 *   - a 403 told the user to log in again, which never helps. A 403 means the session is fine and
 *     the account is not allowed - a role or ownership decision on the server. Reporting it as a
 *     login problem hides the real answer from whoever is debugging it.
 *   - a 401 left the stale user in the store, so the UI kept rendering as if signed in while every
 *     subsequent request failed the same way. It now clears the session and sends the user to the
 *     right login page.
 */

import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

/** The shared client under test, with axios mocked below. */
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  const instance = Object.assign(mocks.request, {
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  });
  return { ...actual, default: { ...actual.default, create: () => instance } };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/store/useStore', () => ({
  useStore: { getState: () => ({ user: null, token: 'tok', logout: mocks.logout }) },
}));

import { api } from './api';

/** An axios-shaped rejection carrying a status. */
function httpError(status: number, body: Record<string, unknown> = {}): AxiosError {
  const response = { status, data: body, statusText: '', headers: {}, config: {} } as AxiosResponse;
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, response);
}

describe('api client error handling', () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom will not let `location` be reassigned wholesale; replacing the one method is enough
    // to observe where the client sends the browser.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/student/pet', assign },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears the session, says why, and redirects on 401', async () => {
    mocks.request.mockRejectedValue(httpError(401, { message: '未登录或登录已过期' }));

    await expect(api({ url: '/api/students' })).rejects.toBeTruthy();

    expect(mocks.logout).toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('登录已过期，请重新登录');
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('does NOT sign the user out on 403, and does not claim the login expired', async () => {
    mocks.request.mockRejectedValue(httpError(403, { message: '无权限执行该操作' }));

    await expect(api({ url: '/api/wrong-questions/my' })).rejects.toBeTruthy();

    // The session is valid; the account is simply not allowed. Nothing to clear, nothing to retry.
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('当前账号无权访问该功能');
    expect(toast.error).not.toHaveBeenCalledWith('登录已过期，请重新登录');
  });

  it('sends an admin-console 401 to the admin login, not the student one', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/beiadmin/teachers', assign },
    });
    mocks.request.mockRejectedValue(httpError(401));

    await expect(api({ url: '/api/admin/users' })).rejects.toBeTruthy();

    expect(assign).toHaveBeenCalledWith('/beiadmin/login');
  });

  it('does not redirect when the page is already the login page', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/login', assign },
    });
    mocks.request.mockRejectedValue(httpError(401));

    await expect(api({ url: '/api/auth/login' })).rejects.toBeTruthy();

    // A 401 from the login request itself must not reload the page the user is typing into.
    expect(assign).not.toHaveBeenCalled();
  });

  it('surfaces the server message for other failures', async () => {
    mocks.request.mockRejectedValue(httpError(500, { message: '数据库繁忙' }));

    await expect(api({ url: '/api/students' })).rejects.toBeTruthy();

    expect(toast.error).toHaveBeenCalledWith('数据库繁忙');
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('stays quiet when the caller opts out of error toasts', async () => {
    mocks.request.mockRejectedValue(httpError(403));

    await expect(api({ url: '/api/students', showError: false })).rejects.toBeTruthy();

    expect(toast.error).not.toHaveBeenCalled();
  });
});
