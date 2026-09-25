/**
 * The WeChat half of the mini program login: `code2session`.
 *
 * Kept behind an interface for two reasons that have nothing to do with testing convenience:
 *
 *  1. **It is the only outbound network call in this plugin**, and its failure modes are WeChat's,
 *     not ours - a code that was already used, a rate limit, a system-busy answer. Mapping them in
 *     one place is what lets the service above stay about bindings.
 *  2. **The credentials are read at call time, not at boot.** A deployment that never runs the mini
 *     program must still start, so a missing `WECHAT_APPID`/`WECHAT_SECRET` has to surface as a 503
 *     on this route rather than as a plugin that refuses to load.
 *
 * `api.weixin.qq.com` cannot be configured as a mini program request domain (official network
 * documentation), and it should not be: the AppSecret lives on the server and never reaches a
 * client. That is why this call is here and not in the mini program.
 */

import { ApiError } from '@thinkclass/kernel';
import type { KernelContext } from '@thinkclass/plugin-sdk';

import type { WechatCodeSession } from './wechat.types.js';

export interface WechatGateway {
  /** Exchange a `wx.login` code for the openid. Single use, as far as WeChat is concerned. */
  exchangeCode(code: string): Promise<WechatCodeSession>;
}

export interface WechatGatewayCredentials {
  appId: string;
  secret: string;
}

const CODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';
const REQUEST_TIMEOUT_MS = 5_000;

interface Code2SessionResponse {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

/**
 * WeChat answers HTTP 200 with an `errcode` for a refused code, so a status check alone would treat
 * every refusal as a success with no openid. These are the four that mean something to a caller.
 */
function errorFor(errcode: number, errmsg?: string): ApiError {
  switch (errcode) {
    case 40029:
    case 40163:
      // 40029: invalid code. 40163: code already used. Both mean "ask the client for a new code",
      // which is a 401 on this route because the mini program re-runs wx.login silently on it.
      return new ApiError(401, '微信登录凭证无效，请重试');
    case 45011:
      return new ApiError(429, '微信登录请求过于频繁，请稍后再试');
    case -1:
      return new ApiError(503, '微信服务暂时不可用，请稍后再试');
    default:
      // The errcode belongs to WeChat and is not a secret; it is the only thing that makes a support
      // conversation possible. Neither the AppSecret nor the code ever appears in this message.
      return new ApiError(503, `微信登录失败（errcode ${errcode}${errmsg ? `：${errmsg}` : ''}）`);
  }
}

export function createWechatGateway(credentials: WechatGatewayCredentials): WechatGateway {
  const url = new URL(CODE2SESSION_URL);
  url.searchParams.set('appid', credentials.appId);
  url.searchParams.set('secret', credentials.secret);
  url.searchParams.set('grant_type', 'authorization_code');

  async function request(code: string): Promise<Code2SessionResponse> {
    const target = new URL(url);
    target.searchParams.set('js_code', code);

    const response = await fetch(target, {
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // A body that is not JSON is a gateway/WAF page rather than WeChat's answer; treat it as an
    // outage instead of letting the parse error escape as a 500.
    try {
      return (await response.json()) as Code2SessionResponse;
    } catch {
      throw new ApiError(503, '微信服务暂时不可用，请稍后再试');
    }
  }

  return {
    async exchangeCode(code) {
      let payload: Code2SessionResponse;
      try {
        payload = await request(code);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        // Transport-level failure: the request may never have reached WeChat, so one retry is worth
        // it. A retry after a *successful* exchange is refused by WeChat with 40163, which the mini
        // program recovers from by asking for a fresh code - so the retry cannot hand out a second
        // session for one code.
        try {
          payload = await request(code);
        } catch (retryError) {
          if (retryError instanceof ApiError) throw retryError;
          throw new ApiError(503, '微信服务暂时不可用，请稍后再试');
        }
      }

      if (typeof payload.errcode === 'number' && payload.errcode !== 0) {
        throw errorFor(payload.errcode, payload.errmsg);
      }
      if (!payload.openid) {
        throw new ApiError(503, '微信登录失败（未返回 openid）');
      }

      return { openid: payload.openid, unionid: payload.unionid ?? null };
    },
  };
}

/**
 * Build the gateway from the instance's environment.
 *
 * Fail-loud and default-free: a missing or empty credential is a 503 naming both variables, never a
 * published fallback appid - the same rule guardrail G18 enforces for `ENCRYPTION_KEY`, applied to
 * the one secret this plugin needs. It is called per login attempt rather than at plugin setup,
 * which is what keeps a deployment without a mini program bootable.
 */
export function createGatewayFromConfig(ctx: KernelContext): WechatGateway {
  const appId = String(ctx.config.get<string>('WECHAT_APPID') ?? '').trim();
  const secret = String(ctx.config.get<string>('WECHAT_SECRET') ?? '').trim();

  if (!appId || !secret) {
    throw new ApiError(503, '微信小程序未配置：请设置 WECHAT_APPID / WECHAT_SECRET');
  }

  return createWechatGateway({ appId, secret });
}
