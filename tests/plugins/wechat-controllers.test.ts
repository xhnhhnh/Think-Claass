/**
 * The `api/wechat` controller layer: what each route answers, and that a service failure keeps its
 * status.
 *
 * The service is faked, so what this pins is the route layer alone - the thing a future refactor can
 * break without any other suite noticing. `tests/plugins/wechat-http.test.ts` covers the same routes
 * over a real host; this file is the fast half.
 */

import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ApiError } from '@thinkclass/kernel';

import { WechatController } from '../../plugins/wechat/src/wechat.controllers.js';
import type { WechatService } from '../../plugins/wechat/src/wechat.service.js';

interface Call {
  method: string;
  args: unknown[];
}

function createFakeService() {
  const calls: Call[] = [];
  let failure: unknown = null;
  let loginResult: unknown = { success: true, bound: false, ticket: 'ticket-1', expiresAt: 'soon' };
  let bindResult: unknown = { success: true, bound: true, token: 'token-1' };
  let meResult: unknown = { success: true, bound: false };
  let unbindResult: unknown = { success: true, unbound: true };

  const service = {
    async login(body: Record<string, unknown>, meta: unknown) {
      calls.push({ method: 'login', args: [body, meta] });
      if (failure) throw failure;
      return loginResult;
    },
    async bind(body: Record<string, unknown>, meta: unknown) {
      calls.push({ method: 'bind', args: [body, meta] });
      if (failure) throw failure;
      return bindResult;
    },
    async me(actorId: number) {
      calls.push({ method: 'me', args: [actorId] });
      if (failure) throw failure;
      return meResult;
    },
    async unbind(actorId: number) {
      calls.push({ method: 'unbind', args: [actorId] });
      if (failure) throw failure;
      return unbindResult;
    },
  };

  return {
    service,
    calls,
    setFailure(next: unknown) {
      failure = next;
    },
    setLogin(next: unknown) {
      loginResult = next;
    },
  };
}

/** A request with the kernel's context attached, as `createRequestContextMiddleware` does. */
function request(
  actor: { userId: number; role: string } | null = null,
  headers: Record<string, string> = {},
) {
  return {
    context: { requestId: 'test', actor, authSource: actor ? ('bearer' as const) : ('none' as const) },
    header: (name: string) => headers[name.toLowerCase()] ?? undefined,
    ip: '127.0.0.1',
  } as never;
}

function controllerWith(fake: ReturnType<typeof createFakeService>): WechatController {
  return new WechatController(fake.service as unknown as WechatService);
}

describe('wechat controllers: login and bind', () => {
  it('answers the service body for login, with no wrapping of its own', async () => {
    const fake = createFakeService();
    const body = await controllerWith(fake).login({ code: 'c' }, request());

    expect(body).toEqual({ success: true, bound: false, ticket: 'ticket-1', expiresAt: 'soon' });
    expect(fake.calls[0].args[1]).toEqual({ userAgent: null, ip: '127.0.0.1' });
  });

  it('passes the user-agent through and defaults an absent one to null', async () => {
    const fake = createFakeService();
    await controllerWith(fake).login({ code: 'c' }, request(null, { 'user-agent': 'MicroMessenger/8' }));

    expect(fake.calls[0].args[1]).toEqual({ userAgent: 'MicroMessenger/8', ip: '127.0.0.1' });
  });

  it('tolerates a missing body instead of throwing a TypeError', async () => {
    const fake = createFakeService();
    await controllerWith(fake).login(undefined as never, request());

    expect(fake.calls[0].args[0]).toEqual({});
  });

  it('keeps a service ApiError status on bind', async () => {
    const fake = createFakeService();
    fake.setFailure(new ApiError(409, '该微信已绑定其他账号，请先解绑'));

    await expect(
      controllerWith(fake).bind({ ticket: 't', username: 'u', password: 'p' }, request()),
    ).rejects.toMatchObject({ status: 409, message: '该微信已绑定其他账号，请先解绑' });
  });

  it('turns an unexpected error into a 500 envelope rather than leaking it', async () => {
    const fake = createFakeService();
    fake.setFailure(new Error('boom'));

    await expect(controllerWith(fake).bind({}, request())).rejects.toMatchObject({
      status: 500,
      message: 'Internal Server Error',
    });
  });
});

describe('wechat controllers: me and unbind', () => {
  it('401s an anonymous caller on both routes, without reaching the service', async () => {
    const fake = createFakeService();

    await expect(controllerWith(fake).me(request())).rejects.toMatchObject({
      status: 401,
      message: '未登录或登录已过期',
    });
    await expect(controllerWith(fake).unbind(request())).rejects.toMatchObject({ status: 401 });
    expect(fake.calls).toHaveLength(0);
  });

  it('answers for the caller, never for an id in the body', async () => {
    const fake = createFakeService();
    const req = request({ userId: 42, role: 'student' });

    await controllerWith(fake).me(req);
    await controllerWith(fake).unbind(req);

    expect(fake.calls).toEqual([
      { method: 'me', args: [42] },
      { method: 'unbind', args: [42] },
    ]);
  });

  it('lets any signed-in role hold a binding of its own', async () => {
    for (const role of ['student', 'teacher', 'parent', 'admin', 'superadmin']) {
      const fake = createFakeService();
      await controllerWith(fake).me(request({ userId: 1, role }));
      expect(fake.calls).toHaveLength(1);
    }
  });
});
