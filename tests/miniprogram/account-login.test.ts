/**
 * 账号密码登录: the second door, and the binding it must not skip.
 *
 * The requirement this file pins is the one a client could quietly break: **an unbound WeChat has to
 * bind before it gets a session**. The server enforces it by answering a ticket instead of a token,
 * and `loginWithAccount` therefore runs the same two calls 微信一键登录 does. What is worth testing
 * here is the sequencing and the ticket lifecycle, because both are easy to get subtly wrong:
 *
 *   - a returning user (already linked) must **not** be sent to the bind call at all - one request,
 *     not two, or every launch would consume a useless ticket;
 *   - every submit must fetch a **fresh** ticket. The server claims the ticket *before* it checks the
 *     password, so a typo burns it; a client that reused one would work once and then answer
 *     「绑定已过期」 forever.
 *
 * Modules are re-imported per test (`vi.resetModules`) for the same reason `client-request.test.ts`
 * does it: `utils/request.ts` keeps state at module scope.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeWx, type FakeWx, type RecordedRequest, type Responder } from './helpers/fake-wx';

const SESSION_KEY = 'thinkclass-mp-auth';

/** The openid the repository's `config/index.ts` sends while a developer is logged in locally. */
const DEV_OPENID = 'dev-openid-demo-1';

async function loadClient(respond: Responder, options: { loginCode?: string | null } = {}) {
  const fake: FakeWx = installFakeWx({
    respond,
    // `??` would swallow an explicit `null`, and `null` is what means "wx.login fails".
    loginCode: 'loginCode' in options ? options.loginCode : 'code-from-wx',
  });

  vi.resetModules();
  const auth = await import('../../miniprogram/services/auth');
  const storage = await import('../../miniprogram/utils/storage');

  return { fake, auth, storage };
}

/** A body for `POST /api/wechat/login`: unbound, with the ticket the bind step needs. */
function unbound(ticket: string) {
  return { statusCode: 200, data: { success: true, bound: false, ticket, expiresAt: '2026-12-31T00:00:00.000Z' } };
}

/** A body for either login route: already linked, session issued. */
function bound(user: Record<string, unknown> = { id: 13, username: 's1', role: 'student' }) {
  return {
    statusCode: 200,
    data: {
      success: true,
      bound: true,
      token: 'token-new',
      expiresAt: '2026-12-31T00:00:00.000Z',
      user,
      classFeatures: { enable_shop: true },
    },
  };
}

function bodiesOf(requests: RecordedRequest[]): Array<Record<string, any>> {
  return requests.map((entry) => (entry.data ?? {}) as Record<string, any>);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('an already-linked WeChat logs in without a password prompt', () => {
  it('answers the token from the first call and never reaches the bind step', async () => {
    const { fake, auth } = await loadClient(() => bound());

    const result = await auth.loginWithAccount('s1', 'pw', 'student');

    expect(result).toMatchObject({ bound: true, token: 'token-new' });
    expect(fake.requestsTo('/api/wechat/login')).toHaveLength(1);
    expect(fake.requestsTo('/api/wechat/bind')).toHaveLength(0);
  });

  it('carries the development openid alongside the code, because local has no AppSecret', async () => {
    const { fake, auth } = await loadClient(() => bound());

    await auth.loginWithAccount('s1', 'pw', 'student');

    expect(bodiesOf(fake.requestsTo('/api/wechat/login'))[0]).toMatchObject({ devOpenid: DEV_OPENID });
  });
});

describe('an unlinked WeChat binds first - the requirement, not a nicety', () => {
  it('exchanges the ticket for a session, sending the account and its role', async () => {
    const { fake, auth, storage } = await loadClient((request) =>
      request.url.includes('/api/wechat/bind')
        ? bound({ id: 2, username: 'teacher-1', role: 'teacher' })
        : unbound('ticket-1'),
    );

    const result = await auth.loginWithAccount('teacher-1', 'pw', 'teacher');

    expect(result).toMatchObject({ bound: true, token: 'token-new' });
    const binds = bodiesOf(fake.requestsTo('/api/wechat/bind'));
    expect(binds).toHaveLength(1);
    expect(binds[0]).toMatchObject({ ticket: 'ticket-1', username: 'teacher-1', password: 'pw', role: 'teacher' });

    // This function deliberately does not write the session - the page calls `persistSession` once
    // it has navigated, and a service that stored a token before the caller rendered anything would
    // leave a session behind when the redirect fails.
    expect(storage.readSession()).toBeNull();
    expect(auth.persistSession(result)).toMatchObject({ token: 'token-new', user: { role: 'teacher' } });
    expect(storage.readSession()).toMatchObject({ token: 'token-new' });
  });

  it('accepts the console roles too: the identity plugin resolves them by (username, role)', async () => {
    const { fake, auth } = await loadClient((request) =>
      request.url.includes('/api/wechat/bind')
        ? bound({ id: 1, username: 'root', role: 'superadmin' })
        : unbound('ticket-2'),
    );

    const result = await auth.loginWithAccount('root', 'pw', 'superadmin');

    expect(result.user).toMatchObject({ role: 'superadmin' });
    expect(bodiesOf(fake.requestsTo('/api/wechat/bind'))[0]).toMatchObject({ role: 'superadmin' });
  });
});

describe('every submit fetches its own ticket', () => {
  it('asks for a new ticket per attempt, because the server claims the previous one', async () => {
    let issued = 0;
    const { fake, auth } = await loadClient((request) => {
      if (request.url.includes('/api/wechat/login')) {
        issued += 1;
        return unbound(`ticket-${issued}`);
      }
      return bound();
    });

    await auth.loginWithAccount('s1', 'first', 'student');
    await auth.loginWithAccount('s1', 'second', 'student');

    const tickets = bodiesOf(fake.requestsTo('/api/wechat/bind')).map((body) => body.ticket);
    expect(tickets).toEqual(['ticket-1', 'ticket-2']);
  });

  it('surfaces a dead ticket as the server words it, and leaves no session behind', async () => {
    const { auth, storage } = await loadClient((request) =>
      request.url.includes('/api/wechat/bind')
        ? { statusCode: 401, data: { success: false, message: '绑定已过期，请重新登录' } }
        : unbound('ticket-3'),
    );

    await expect(auth.loginWithAccount('s1', 'pw', 'student')).rejects.toMatchObject({
      message: '绑定已过期，请重新登录',
    });
    expect(storage.readSession()).toBeNull();
  });
});
