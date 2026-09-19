/**
 * Identity controller tests - envelopes, status codes and delegation.
 *
 * Ported from the deleted `api/modules/auth/*.service.test.ts` suites' HTTP half, which asserted
 * `{ success: true, ... }` through a mocked `AuthService`. The service is faked here instead, so
 * what this file pins is the *route layer*: what the four legacy endpoints answer, with which status
 * code, and that a service `ApiError` reaches the kernel's error filter with its status intact.
 *
 * Three details are contract, not style, and each one was carried over from the deleted controller:
 *
 *  1. **`@HttpCode(200)` on login, register and activate.** Nest answers 201 for a POST by default;
 *     the legacy controller pinned 200 and the frontend depends on it.
 *  2. **`PUT /api/auth/profile` keeps Nest's 200** (it is a PUT, so no decorator is needed) and the
 *     legacy envelope shape `{ success, user, message }`.
 *  3. **The login response gains `token`/`expiresAt`** from the session the controller mints. That
 *     used to come from `getActiveKernel().sessions` - a service locator - and now comes from the
 *     plugin context. Before this round the plugin did not exist; the assertion is what keeps the
 *     token from silently disappearing in a later refactor.
 */

import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { ApiError } from '@thinkclass/kernel';

import { IdentityController } from '../../plugins/identity/src/identity.controllers.js';
import type { IdentityService } from '../../plugins/identity/src/identity.service.js';

interface Call {
  method: string;
  args: unknown[];
}

/** A service double that records calls and can be told to throw. */
function createFakeService() {
  const calls: Call[] = [];
  let loginResult: unknown = {
    success: true,
    user: { id: 7, role: 'student', username: 'student01' },
    classFeatures: { enable_shop: true },
  };
  let profileResult: unknown = { success: true, user: { id: 9 }, message: '个人信息已更新' };
  let registerResult: unknown = { success: true };
  let activateResult: unknown = { success: true, message: '激活成功' };
  let failure: unknown = null;

  const service = {
    async login(body: Record<string, unknown>) {
      calls.push({ method: 'login', args: [body] });
      if (failure) throw failure;
      return loginResult;
    },
    async updateProfile(actor: unknown, body: Record<string, unknown>) {
      calls.push({ method: 'updateProfile', args: [actor, body] });
      if (failure) throw failure;
      return profileResult;
    },
    async register(body: Record<string, unknown>) {
      calls.push({ method: 'register', args: [body] });
      if (failure) throw failure;
      return registerResult;
    },
    async activate(body: Record<string, unknown>) {
      calls.push({ method: 'activate', args: [body] });
      if (failure) throw failure;
      return activateResult;
    },
    issueSession(input: { userId: number; role: string }) {
      calls.push({ method: 'issueSession', args: [input] });
      return { token: `token-for-${input.userId}`, expiresAt: '2026-01-01T00:00:00.000Z' };
    },
  };

  return {
    service,
    calls,
    setLogin(next: unknown) {
      loginResult = next;
    },
    setProfile(next: unknown) {
      profileResult = next;
    },
    setFailure(next: unknown) {
      failure = next;
    },
  };
}

/** A request with the kernel's context attached, as `createRequestContextMiddleware` does. */
function request(actor: { userId: number; role: string } | null = null, headers: Record<string, string> = {}) {
  return {
    context: { requestId: 'test', actor, authSource: actor ? ('bearer' as const) : ('none' as const) },
    header: (name: string) => headers[name.toLowerCase()] ?? undefined,
    ip: '127.0.0.1',
  } as never;
}

function controllerWith(fake: ReturnType<typeof createFakeService>): IdentityController {
  return new IdentityController(fake.service as unknown as IdentityService);
}

describe('identity controllers: login', () => {
  it('answers the legacy body plus a session token, and issues it for the returned user', async () => {
    const fake = createFakeService();
    const body = await controllerWith(fake).login({ username: 'student01', password: 'pw', role: 'student' }, request());

    expect(body).toMatchObject({
      success: true,
      user: { id: 7, role: 'student', username: 'student01' },
      classFeatures: { enable_shop: true },
      token: 'token-for-7',
      expiresAt: '2026-01-01T00:00:00.000Z',
    });
    // The session is issued for the *service's* user, not for whatever the body claimed.
    expect(fake.calls.find((call) => call.method === 'issueSession')?.args[0]).toMatchObject({ userId: 7, role: 'student' });
  });

  it('passes the user-agent through and keeps req.ip exactly as the legacy controller did', async () => {
    const fake = createFakeService();
    const req = request(null, { 'user-agent': 'probe/1.0' });
    await controllerWith(fake).login({ username: 'teacher9', password: 'pw', role: 'teacher' }, req);

    // `req.ip` is asserted as-is: a string on a real request, undefined on a double, and the legacy
    // call site passed it straight through without coercion.
    expect(fake.calls.find((call) => call.method === 'issueSession')?.args[0]).toMatchObject({
      userId: 7,
      userAgent: 'probe/1.0',
    });
  });

  it('skips session issuance when the service answers without a usable user', async () => {
    const fake = createFakeService();
    fake.setLogin({ success: true, user: { username: 'x' } });
    const body = await controllerWith(fake).login({ username: 'x', password: 'pw', role: 'teacher' }, request());

    expect(body).toEqual({ success: true, user: { username: 'x' } });
    expect(fake.calls.some((call) => call.method === 'issueSession')).toBe(false);
  });
});

describe('identity controllers: envelopes and delegation', () => {
  it('forwards profile, register and activate bodies unchanged', async () => {
    const fake = createFakeService();
    const controller = controllerWith(fake);

    await controller.updateProfile(request({ userId: 9, role: 'teacher' }), { username: 'renamed' });
    await controller.register({ username: 'new', password: 'pw', role: 'teacher' });
    await controller.activate({ code: 'TC-1', userId: 9 });

    expect(fake.calls.find((call) => call.method === 'updateProfile')?.args).toEqual([
      { id: 9, role: 'teacher' },
      { username: 'renamed' },
    ]);
    expect(fake.calls.find((call) => call.method === 'register')?.args).toEqual([
      { username: 'new', password: 'pw', role: 'teacher' },
    ]);
    expect(fake.calls.find((call) => call.method === 'activate')?.args).toEqual([{ code: 'TC-1', userId: 9 }]);
  });

  it('resolves the actor through the kernel request context, including anonymous', async () => {
    const fake = createFakeService();
    await controllerWith(fake).updateProfile(request(), { username: 'x' });

    expect(fake.calls.find((call) => call.method === 'updateProfile')?.args[0]).toEqual({ id: null, role: null });
  });
});

describe('identity controllers: errors', () => {
  it('lets a kernel ApiError through with its status and message intact', async () => {
    const fake = createFakeService();
    fake.setFailure(new ApiError(401, '账号或密码错误，请重试'));

    await expect(controllerWith(fake).login({}, request())).rejects.toMatchObject({
      statusCode: 401,
      message: '账号或密码错误，请重试',
    });
  });

  it('maps an unexpected error to the legacy 500 fallback instead of leaking it', async () => {
    const fake = createFakeService();
    fake.setFailure(new Error('driver exploded at /abs/path/line.ts'));

    await expect(controllerWith(fake).register({})).rejects.toMatchObject({
      statusCode: 500,
      message: 'Internal Server Error',
    });
  });
});

describe('identity controllers: the route surface', () => {
  it('declares one controller on api/auth with the four legacy handlers', () => {
    const metadata = Reflect.getMetadata('path', IdentityController) as string;
    expect(metadata).toBe('api/auth');

    const handlers = ['login', 'updateProfile', 'register', 'activate'] as const;
    const verbs = handlers.map((handler) => {
      const path = Reflect.getMetadata('path', IdentityController.prototype[handler]);
      const method = Reflect.getMetadata('method', IdentityController.prototype[handler]);
      return { handler, path, method };
    });

    // 0=GET 1=POST 2=PUT 3=DELETE in the Nest request-method enum.
    expect(verbs).toEqual([
      { handler: 'login', path: 'login', method: 1 },
      { handler: 'updateProfile', path: 'profile', method: 2 },
      { handler: 'register', path: 'register', method: 1 },
      { handler: 'activate', path: 'activate', method: 1 },
    ]);
  });

  it('pins 200 on the three POST handlers, because Nest would answer 201 otherwise', () => {
    const posts = ['login', 'register', 'activate'] as const;
    for (const handler of posts) {
      expect(Reflect.getMetadata('__httpCode__', IdentityController.prototype[handler]), handler).toBe(200);
    }
    // A PUT keeps Nest's default; adding a code here would change the contract.
    expect(Reflect.getMetadata('__httpCode__', IdentityController.prototype.updateProfile)).toBeUndefined();
  });
});
