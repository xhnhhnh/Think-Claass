/**
 * Deploy-time configuration for the mini program client.
 *
 * Everything a deployment may need to change lives in this one file, because a mini program
 * has no build-time environment injection the way the Vite frontend does (`import.meta.env`
 * does not exist here, and `wx.getAccountInfoSync().miniProgram.envVersion` is a *runtime*
 * read that cannot be used to pick a URL at build time without shipping both).
 */

/**
 * Where the Think-Class kernel is reachable.
 *
 * Local development: `http://localhost:3001` with 微信开发者工具's
 * 「详情 → 本地设置 → 不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」 checked -
 * a mini program otherwise refuses a plain-HTTP request to a domain that is not in the
 * account's 服务器域名 allowlist.
 *
 * Production: the https origin of the deployment, added to 开发设置 → 服务器域名 → request 合法域名.
 */
export const BASE_URL = 'http://localhost:3001'

/**
 * `'request'` uses `wx.request` against `BASE_URL`.
 *
 * `'container'` uses `wx.cloud.callContainer`, which is the 微信云托管 deployment: the call
 * goes through WeChat's own backbone to a container in the same account, so it needs **no**
 * domain allowlist entry and no public HTTPS certificate. It is a one-line switch precisely
 * because `utils/request.ts` keeps a single envelope/401 path for both transports.
 */
export const TRANSPORT: 'request' | 'container' = 'request'

/**
 * 云托管 coordinates - only read when `TRANSPORT === 'container'`.
 *
 * `CLOUD_ENV` is the 环境 ID (`prod-xxxxxxxx`) from 微信云托管; `CLOUD_SERVICE` is the
 * 服务名称, sent as the `X-WX-SERVICE` header because one environment can host several
 * services and the router needs to know which one answers `/api`.
 */
export const CLOUD_ENV = ''
export const CLOUD_SERVICE = ''

/** Per-request ceiling. 15s matches the web client; AI generation passes a longer one. */
export const REQUEST_TIMEOUT = 15000

/** The ceiling for the two AI routes that may wait on a model server-side. */
export const AI_REQUEST_TIMEOUT = 25000

/** Storage key for the session blob (token + user + login-time feature snapshot). */
export const AUTH_STORAGE_KEY = 'thinkclass-mp-auth'

/**
 * Storage key for the last *live* class-feature answer.
 *
 * Kept separate from the login-time snapshot inside the auth blob: that one is a fact about
 * the login ("this is what the server said when the token was issued"), this one is a cache
 * of the most recent `GET /api/classes/:id/features`. Merging them would lose the ability to
 * tell a stale-but-real answer from a snapshot taken days ago.
 */
export const FEATURE_CACHE_KEY = 'thinkclass-mp-features'

/**
 * Read-only mock mode for 微信开发者工具 without a backend.
 *
 * Off by default and never enabled implicitly: a mock that could turn itself on would make
 * "the API is down" look like a working app. `true` here swaps `utils/request.ts` onto the
 * fixtures in `utils/mock.ts`, which exist so a UI change can be reviewed on a machine with
 * no server running.
 */
export const MOCK = {
  enabled: false,
  /** Simulated latency so loading states are actually visible while reviewing. */
  delayMs: 300,
  failRate: 0,
}

/**
 * Development login bypass - the client half of the server's `WECHAT_ALLOW_DEV_LOGIN`.
 *
 * `POST /api/wechat/login` normally exchanges a `wx.login` code with WeChat, which requires a real
 * AppID/Secret on the server. The server also accepts a `devOpenid` in the body instead, but only
 * when it is *not* running in production **and** `WECHAT_ALLOW_DEV_LOGIN=1` is set there; otherwise
 * it answers 403 with the reason.
 *
 * Set this to any non-empty string (e.g. `'dev-openid-alice'`) to send it alongside the code, so a
 * mini program can be developed before its AppID has been approved. Leave it empty in every other
 * environment: it is an identity assertion that bypasses WeChat entirely, which is exactly why the
 * server fences it on both sides.
 */
export const DEV_LOGIN_OPENID = ''
