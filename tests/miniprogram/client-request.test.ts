/**
 * The mini program's HTTP path: envelope, 401 recovery, and the bodies it sends.
 *
 * This is the highest-risk code in the client. It is the only file that talks to the kernel, it
 * makes a decision no page can undo (clear the session and relaunch), and its behaviour differs
 * between the two transports and between authenticated and anonymous calls. A unit test cannot
 * prove the devtools render a page correctly - that happens in 微信开发者工具 - but it can prove
 * that a `success: false` body is an error, that a 401 with a bound WeChat ends in a retry with a
 * *new* token, and that a bind sends the role the server requires.
 *
 * Modules are re-imported per test (`vi.resetModules`) because `utils/request.ts` keeps the
 * in-flight refresh promise at module scope; a shared instance would leak one test's relogin into
 * the next.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeWx, authHeader, type FakeWx, type Responder } from './helpers/fake-wx';

const SESSION_KEY = 'thinkclass-mp-auth';

async function loadClient(respond: Responder, options: { loginCode?: string | null; pages?: string[] } = {}) {
  const fake: FakeWx = installFakeWx({
    respond,
    // `??` would swallow an explicit `null`, which is the case that means "wx.login fails".
    loginCode: 'loginCode' in options ? options.loginCode : 'code-from-wx',
    pages: options.pages,
  });

  vi.resetModules();
  const request = await import('../../miniprogram/utils/request');
  const storage = await import('../../miniprogram/utils/storage');
  const auth = await import('../../miniprogram/services/auth');

  return { fake, request, storage, auth };
}

/** A stored, valid session - what the app has on every launch after the first login. */
function seedSession(storage: { writeSession: (session: unknown) => void }, token = 'token-old') {
  storage.writeSession({
    token,
    expiresAt: '2026-12-31T00:00:00.000Z',
    user: { id: 9, username: 's9', role: 'student', studentId: 10, classId: 1 },
    classFeatures: { enable_shop: true },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the envelope', () => {
  it('resolves the body directly - there is no { data } wrapper to unwrap', async () => {
    const { request, fake } = await loadClient(() => ({
      statusCode: 200,
      data: { success: true, bound: true, token: 't1', user: { id: 1 } },
    }));

    const body = await request.post<{ token: string }>('/api/wechat/bind', { ticket: 't' }, { auth: false });

    expect(body).toMatchObject({ token: 't1' });
    expect(fake.requestsTo('/api/wechat/bind')).toHaveLength(1);
  });

  it('treats a 2xx body carrying success:false as a failure, with the server message', async () => {
    const { request } = await loadClient(() => ({
      statusCode: 200,
      data: { success: false, message: '绑定已过期，请重新登录' },
    }));

    await expect(request.get('/api/wechat/me')).rejects.toMatchObject({
      status: 200,
      message: '绑定已过期，请重新登录',
    });
  });

  it('uses the server message for a non-2xx, and a status default when there is none', async () => {
    const withMessage = await loadClient(() => ({ statusCode: 400, data: { message: '绑定参数不完整' } }));
    await expect(withMessage.request.post('/api/wechat/bind', {})).rejects.toMatchObject({
      status: 400,
      message: '绑定参数不完整',
    });

    const withoutMessage = await loadClient(() => ({ statusCode: 503, data: { html: '<h1>bad gateway</h1>' } }));
    await expect(withoutMessage.request.get('/api/health')).rejects.toMatchObject({
      status: 503,
      message: '服务暂时不可用，请稍后重试',
    });
  });

  it('reports a transport failure as status 0 with an actionable line', async () => {
    const { request } = await loadClient(() => ({ fail: true }));

    await expect(request.get('/api/settings')).rejects.toMatchObject({
      status: 0,
      message: '网络连接失败，请检查网络后重试',
    });
  });
});

describe('the bearer token', () => {
  it('is attached when a session exists', async () => {
    const { request, fake, storage } = await loadClient(() => ({ statusCode: 200, data: { success: true } }));
    seedSession(storage);

    await request.get('/api/students/10/summary');

    expect(authHeader(fake.requests[0])).toBe('Bearer token-old');
  });

  it('is left off an anonymous call, even with a session stored', async () => {
    const { request, fake, storage } = await loadClient(() => ({ statusCode: 200, data: { success: true } }));
    seedSession(storage);

    await request.post('/api/wechat/login', { code: 'c' }, { auth: false });

    expect(authHeader(fake.requests[0])).toBeUndefined();
  });
});

describe('401 recovery', () => {
  it('silently re-logs-in and retries the same call with the new token', async () => {
    const { request, fake, storage } = await loadClient((incoming) => {
      if (incoming.url.includes('/api/wechat/login')) {
        return {
          statusCode: 200,
          data: {
            bound: true,
            token: 'token-new',
            expiresAt: '2027-01-01T00:00:00.000Z',
            user: { id: 9, username: 's9', role: 'student', studentId: 10, classId: 1 },
            classFeatures: { enable_shop: true },
          },
        };
      }
      // The stored token is stale on the first attempt, accepted on the retry.
      return authHeader(incoming) === 'Bearer token-new'
        ? { statusCode: 200, data: { success: true, summary: { points: 42 } } }
        : { statusCode: 401, data: { message: '登录已过期，请重新登录' } };
    });
    seedSession(storage);

    const body = await request.get<{ summary: { points: number } }>('/api/students/10/summary');

    expect(body.summary.points).toBe(42);
    expect(fake.requestsTo('/api/wechat/login')).toHaveLength(1);
    expect(fake.requestsTo('/api/students/10/summary').map(authHeader)).toEqual([
      'Bearer token-old',
      'Bearer token-new',
    ]);
    // The refreshed session is persisted, so the next page starts from it rather than re-logging in.
    expect(JSON.parse(fake.storage.get(SESSION_KEY) as string).token).toBe('token-new');
    expect(fake.relaunches).toEqual([]);
  });

  it('clears the session and routes to login when the account holds no binding', async () => {
    const { request, fake, storage } = await loadClient((incoming) =>
      incoming.url.includes('/api/wechat/login')
        ? { statusCode: 200, data: { bound: false, ticket: 'tk', expiresAt: 'soon' } }
        : { statusCode: 401, data: { message: '登录已过期，请重新登录' } },
    );
    seedSession(storage);

    await expect(request.get('/api/students/10/summary')).rejects.toMatchObject({ status: 401 });

    expect(fake.storage.get(SESSION_KEY)).toBeUndefined();
    expect(fake.relaunches).toEqual(['/pages/login/login']);
  });

  it('does not relaunch when the login page is already on top - the loop guard', async () => {
    const { request, fake, storage } = await loadClient(
      (incoming) =>
        incoming.url.includes('/api/wechat/login')
          ? { statusCode: 200, data: { bound: false } }
          : { statusCode: 401, data: {} },
      { pages: ['pages/login/login'] },
    );
    seedSession(storage);

    await expect(request.get('/api/students/10/summary')).rejects.toThrow();

    expect(fake.relaunches).toEqual([]);
  });

  it('never recovers an anonymous call - a 401 from bind is a wrong password', async () => {
    const { request, fake } = await loadClient(() => ({
      statusCode: 401,
      data: { message: '账号或密码错误，请重试' },
    }));

    await expect(
      request.post('/api/wechat/bind', { ticket: 't', username: 'u', password: 'bad', role: 'student' }, { auth: false }),
    ).rejects.toMatchObject({ message: '账号或密码错误，请重试' });

    // No wx.login, no second request: re-running the login flow would only lose the ticket.
    expect(fake.loginCalls).toBe(0);
    expect(fake.requests).toHaveLength(1);
  });
});

describe('the service layer', () => {
  it('sends the role with a bind - the server refuses the request without it', async () => {
    const { auth, fake } = await loadClient(() => ({
      statusCode: 200,
      data: { bound: true, token: 't', expiresAt: 'later', user: { id: 9 }, classFeatures: {} },
    }));

    await auth.bindAccount('ticket-9', 'student01', 'pw', 'student');

    const [sent] = fake.requestsTo('/api/wechat/bind');
    expect(sent.method).toBe('POST');
    expect(sent.data).toEqual({
      ticket: 'ticket-9',
      username: 'student01',
      password: 'pw',
      role: 'student',
    });
  });

  it('runs wx.login first and sends only the code when no dev openid is configured', async () => {
    const { auth, fake } = await loadClient(() => ({
      statusCode: 200,
      data: { bound: false, ticket: 'tk', expiresAt: 'soon' },
    }));

    await auth.loginWithWechat();

    expect(fake.loginCalls).toBe(1);
    expect(fake.requestsTo('/api/wechat/login')[0].data).toEqual({ code: 'code-from-wx' });
  });

  it('surfaces a failed wx.login instead of sending a codeless request', async () => {
    const { auth, fake } = await loadClient(() => ({ statusCode: 200, data: { bound: false } }), {
      loginCode: null,
    });

    await expect(auth.loginWithWechat()).rejects.toThrowError('微信登录失败，请重试');
    expect(fake.requests).toHaveLength(0);
  });

  it('treats a valid token with no binding as "no session" and clears it', async () => {
    const { auth, fake, storage } = await loadClient(() => ({
      statusCode: 200,
      data: { success: true, bound: false },
    }));
    seedSession(storage);

    await expect(auth.restoreSession()).resolves.toBeNull();
    expect(fake.storage.get(SESSION_KEY)).toBeUndefined();
  });

  it('rewrites the stored user from the fresh /me answer', async () => {
    const { auth, fake, storage } = await loadClient(() => ({
      statusCode: 200,
      data: {
        success: true,
        bound: true,
        user: { id: 9, username: 's9-renamed', role: 'student', studentId: 10, classId: 2 },
        classFeatures: { enable_shop: false, enable_ai_study: true },
      },
    }));
    seedSession(storage);

    const session = await auth.restoreSession();

    expect(session?.user.username).toBe('s9-renamed');
    expect(session?.classFeatures).toEqual({ enable_shop: false, enable_ai_study: true });
    expect(fake.storage.get(SESSION_KEY)).toContain('s9-renamed');
  });
});
