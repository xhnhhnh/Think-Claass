/**
 * `code2session` - the one outbound call this plugin makes, and its refusal modes.
 *
 * The value of this file is that WeChat answers **HTTP 200 with an `errcode`** for a refused code, so
 * a status check alone would treat every refusal as a success with no openid. Each mapping below is a
 * different recovery for the client: 40029/40163 mean "ask for a new code" (the mini program re-runs
 * `wx.login` silently on a 401), 45011 means "back off", and -1 means "WeChat is unwell, not you".
 *
 * `fetch` is stubbed: these are assertions about the mapping, not about the network, and a test that
 * reaches api.weixin.qq.com would need credentials and would be flaky in CI.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@thinkclass/kernel';

import {
  createGatewayFromConfig,
  createWechatGateway,
} from '../../plugins/wechat/src/wechat.gateway.js';

const credentials = { appId: 'wx-test-appid', secret: 'test-secret' };

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

function stubFetch(impl: (...args: unknown[]) => unknown): void {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('wechat gateway: code2session', () => {
  it('answers the openid and unionid on success', async () => {
    stubFetch(async () => jsonResponse({ openid: 'openid-1', unionid: 'union-1', session_key: 'k' }));

    await expect(createWechatGateway(credentials).exchangeCode('code-1')).resolves.toEqual({
      openid: 'openid-1',
      unionid: 'union-1',
    });
  });

  it('answers a null unionid when the mini program is not bound to an Open Platform account', async () => {
    stubFetch(async () => jsonResponse({ openid: 'openid-2' }));

    await expect(createWechatGateway(credentials).exchangeCode('code-2')).resolves.toEqual({
      openid: 'openid-2',
      unionid: null,
    });
  });

  it('sends the code once and never repeats a successful exchange', async () => {
    const calls: string[] = [];
    stubFetch(async (input: unknown) => {
      calls.push(String(input));
      return jsonResponse({ openid: 'openid-3' });
    });

    await createWechatGateway(credentials).exchangeCode('code-3');

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('js_code=code-3');
    expect(calls[0]).toContain('appid=wx-test-appid');
    // The secret is in the query string by WeChat's design, which is one more reason this call never
    // happens from a client.
    expect(calls[0]).toContain('secret=test-secret');
  });

  it('maps an invalid or already-used code to a 401 the client recovers from', async () => {
    for (const errcode of [40029, 40163]) {
      stubFetch(async () => jsonResponse({ errcode, errmsg: 'invalid code' }));
      await expect(createWechatGateway(credentials).exchangeCode('c')).rejects.toMatchObject({
        status: 401,
        message: '微信登录凭证无效，请重试',
      });
    }
  });

  it('maps the rate limit to 429 and a WeChat outage to 503', async () => {
    stubFetch(async () => jsonResponse({ errcode: 45011, errmsg: 'api freq out of limit' }));
    await expect(createWechatGateway(credentials).exchangeCode('c')).rejects.toMatchObject({ status: 429 });

    stubFetch(async () => jsonResponse({ errcode: -1, errmsg: 'system error' }));
    await expect(createWechatGateway(credentials).exchangeCode('c')).rejects.toMatchObject({
      status: 503,
      message: '微信服务暂时不可用，请稍后再试',
    });
  });

  it('names the errcode for anything else, and never the secret', async () => {
    stubFetch(async () => jsonResponse({ errcode: 40013, errmsg: 'invalid appid' }));

    const error = await createWechatGateway(credentials)
      .exchangeCode('c')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
    expect((error as ApiError).message).toContain('40013');
    expect((error as ApiError).message).not.toContain('test-secret');
  });

  it('treats a non-JSON body as an outage rather than a 500', async () => {
    stubFetch(async () => ({ status: 200, json: async () => { throw new Error('not json'); } }) as unknown as Response);

    await expect(createWechatGateway(credentials).exchangeCode('c')).rejects.toMatchObject({
      status: 503,
      message: '微信服务暂时不可用，请稍后再试',
    });
  });

  it('retries a transport failure once, and stops there', async () => {
    let attempts = 0;
    stubFetch(async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError('fetch failed');
      return jsonResponse({ openid: 'openid-retry' });
    });

    await expect(createWechatGateway(credentials).exchangeCode('c')).resolves.toMatchObject({
      openid: 'openid-retry',
    });
    expect(attempts).toBe(2);
  });

  it('answers 503 when the transport keeps failing', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(createWechatGateway(credentials).exchangeCode('c')).rejects.toMatchObject({
      status: 503,
      message: '微信服务暂时不可用，请稍后再试',
    });
  });
});

describe('wechat gateway: configuration', () => {
  function context(values: Record<string, string | undefined>) {
    return {
      config: { get: (key: string) => values[key] },
    } as never;
  }

  it('refuses to build without credentials, naming both variables', () => {
    expect(() => createGatewayFromConfig(context({}))).toThrowError(
      /WECHAT_APPID \/ WECHAT_SECRET/,
    );
  });

  it('treats a blank credential as missing', () => {
    expect(() => createGatewayFromConfig(context({ WECHAT_APPID: '  ', WECHAT_SECRET: 's' }))).toThrowError(
      ApiError,
    );
  });

  it('builds when both are present', () => {
    expect(() =>
      createGatewayFromConfig(context({ WECHAT_APPID: 'wx-1', WECHAT_SECRET: 's' })),
    ).not.toThrow();
  });
});
